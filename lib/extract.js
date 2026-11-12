'use strict';
// [LAB:<key>:A|B] 태그로 Claude·Codex·Grok 세션을 찾아 비캐시 토큰·활성 시간·턴 수·스킬 사용 흔적을 센다.
// 로그 원문은 돌려주지 않는다(숫자와 스킬 이름만).
const fs = require('fs');
const os = require('os');
const path = require('path');

const TAG_RE = /\[LAB:([^\]:]+(?::[^\]:]+)*?):(A|B)\]/;

function parseTag(text) {
  if (typeof text !== 'string') return null;
  const m = TAG_RE.exec(text);
  return m ? { key: m[1], arm: m[2], tag: m[0] } : null;
}

function roots(opts = {}) {
  const home = opts.home || os.homedir();
  return {
    claude: opts.claudeRoot || path.join(home, '.claude', 'projects'),
    codex: opts.codexRoot || path.join(home, '.codex', 'sessions'),
    grok: opts.grokRoot || path.join(home, '.grok', 'sessions'),
  };
}

function walk(dir, pick, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, pick, out, depth + 1);
    else if (pick(e.name, full)) out.push(full);
  }
  return out;
}

function readLines(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* 깨진 줄은 건너뜀 */ }
  }
  return rows;
}

function fileHas(file, needle) {
  try { return fs.readFileSync(file, 'utf8').includes(needle); } catch { return false; }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

function skillFromPath(p) {
  if (typeof p !== 'string') return null;
  const m = /[\\/]([^\\/]+)[\\/]+SKILL\.md/i.exec(p);
  return m ? m[1] : null;
}

function skillsInText(text) {
  const found = new Set();
  if (typeof text !== 'string') return found;
  const re = /([^\\/"'\s]+)[\\/]+SKILL\.md/gi;
  let m;
  while ((m = re.exec(text))) found.add(m[1]);
  return found;
}

// 프롬프트 시각 배열과 이벤트 시각 배열로 "프롬프트 → 그 턴의 마지막 이벤트" 합을 구한다. 쉬는 시간은 빠진다.
function activeFromTurns(promptTimes, eventTimes) {
  const starts = promptTimes.filter((t) => t != null).sort((a, b) => a - b);
  const events = eventTimes.filter((t) => t != null).sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i];
    const next = i + 1 < starts.length ? starts[i + 1] : Infinity;
    let last = s;
    for (const t of events) if (t >= s && t < next && t > last) last = t;
    total += last - s;
  }
  return Math.round(total / 1000);
}

function tokenBlock(input, cacheRead, cacheWrite, output) {
  return { input, cacheRead, cacheWrite, output, nonCache: input + cacheWrite + output, total: input + cacheRead + cacheWrite + output };
}

// ---------- Claude ----------
function watchHits(argText, watch, hits) {
  if (!watch || !watch.length || typeof argText !== 'string') return;
  const low = argText.toLowerCase();
  for (const w of watch) if (low.includes(String(w).toLowerCase())) hits[w] = (hits[w] || 0) + 1;
}

function claudeSession(file, tag, watch) {
  const rows = readLines(file);
  const seen = new Set();
  let input = 0; let cacheRead = 0; let cacheWrite = 0; let output = 0;
  const prompts = []; const events = []; const skills = new Set(); const hits = {};
  let found = false; let sessionId = null;
  for (const r of rows) {
    const t = ms(r.timestamp);
    if (r.sessionId && !sessionId) sessionId = r.sessionId;
    const msg = r.message || {};
    if (r.type === 'user') {
      const c = msg.content;
      const isText = typeof c === 'string' || (Array.isArray(c) && c.some((b) => b && b.type === 'text'));
      const isTool = Array.isArray(c) && c.some((b) => b && b.type === 'tool_result');
      if (isText && !isTool && !r.isMeta) {
        const text = typeof c === 'string' ? c : c.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        if (text.includes(tag)) found = true;
        prompts.push(t);
      }
      events.push(t);
    } else if (r.type === 'assistant') {
      events.push(t);
      const id = msg.id || r.uuid;
      if (msg.usage && !seen.has(id)) {
        seen.add(id);
        input += num(msg.usage.input_tokens);
        cacheRead += num(msg.usage.cache_read_input_tokens);
        cacheWrite += num(msg.usage.cache_creation_input_tokens);
        output += num(msg.usage.output_tokens);
      }
      for (const b of Array.isArray(msg.content) ? msg.content : []) {
        if (!b || b.type !== 'tool_use') continue;
        if (b.name === 'Skill' && b.input && typeof b.input.skill === 'string') skills.add(b.input.skill.split(':').pop());
        const s = skillFromPath(b.input && (b.input.file_path || b.input.path));
        if (s) skills.add(s);
        if (b.input && typeof b.input.command === 'string') for (const x of skillsInText(b.input.command)) skills.add(x);
        watchHits(JSON.stringify(b.input || {}), watch, hits);
      }
    }
  }
  if (!found) return null;
  return {
    agent: 'claude', sessionId, file,
    tokens: tokenBlock(input, cacheRead, cacheWrite, output),
    activeSec: activeFromTurns(prompts, events), turns: prompts.length, skillReads: [...skills].sort(), watchHits: hits,
  };
}

// ---------- Codex ----------
function codexSession(file, tag, watch) {
  const rows = readLines(file);
  let found = false; let last = null; let sessionId = null;
  const prompts = []; const events = []; const skills = new Set(); const hits = {};
  for (const r of rows) {
    const t = ms(r.timestamp);
    events.push(t);
    const p = r.payload || {};
    if (r.type === 'session_meta' && p.id) sessionId = p.id;
    if (p.type === 'user_message' && typeof p.message === 'string') {
      if (p.message.includes(tag)) found = true;
      prompts.push(t);
    }
    if (p.type === 'token_count' && p.info && p.info.total_token_usage) last = p.info.total_token_usage;
    if (p.type === 'function_call' || p.type === 'custom_tool_call') {
      const args = typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments || p.input || '');
      for (const x of skillsInText(args)) skills.add(x);
      watchHits(args, watch, hits);
    }
  }
  if (!found) return null;
  const inputAll = num(last && last.input_tokens);
  const cached = num(last && last.cached_input_tokens);
  return {
    agent: 'codex', sessionId, file,
    tokens: tokenBlock(inputAll - cached, cached, 0, num(last && last.output_tokens)),
    activeSec: activeFromTurns(prompts, events), turns: prompts.length, skillReads: [...skills].sort(), watchHits: hits,
  };
}

// ---------- Grok ----------
// summary.json 에는 제목이 없을 수 있어서 chat_history.jsonl 의 사용자 프롬프트에서 태그를 찾는다.
function grokSession(chatFile, tag, watch) {
  const dir = path.dirname(chatFile);
  const rows = readLines(chatFile);
  let found = false;
  const skills = new Set(); const hits = {};
  for (const r of rows) {
    if (r.type === 'user' && r.synthetic_reason == null) {
      const texts = typeof r.content === 'string' ? [r.content] : (Array.isArray(r.content) ? r.content.map((b) => (b && b.text) || '') : []);
      if (texts.some((x) => x.includes(tag))) found = true;
    }
    if (r.type === 'assistant' && Array.isArray(r.tool_calls)) {
      for (const c of r.tool_calls) {
        const args = typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || '');
        for (const x of skillsInText(args)) skills.add(x);
        watchHits(args, watch, hits);
      }
    }
  }
  if (!found) return null;
  let usage = null;
  try { usage = JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8')); } catch { /* 없음 */ }
  const s = (usage && usage.session) || {};
  const cached = num(s.cachedReadTokens);
  const tokens = tokenBlock(num(s.inputTokens) - cached, cached, num(s.cacheCreationTokens), num(s.outputTokens));
  let active = 0; let turns = 0; let open = null;
  for (const e of readLines(path.join(dir, 'events.jsonl'))) {
    if (e.type === 'turn_started') { open = ms(e.ts); turns += 1; }
    if (e.type === 'turn_ended' && open != null) { const end = ms(e.ts); if (end != null) active += end - open; open = null; }
  }
  if (!turns && usage && Array.isArray(usage.turns)) turns = usage.turns.length;
  return {
    agent: 'grok', sessionId: (usage && usage.sessionId) || path.basename(dir), file: chatFile,
    tokens, activeSec: Math.round(active / 1000), turns, skillReads: [...skills].sort(), watchHits: hits,
  };
}

// opts.watch: 도구 호출 인자에 이 이름이 나오면 센다(예: SKILL.md 없이 graphify CLI를 직접 쓴 경우).
function findSessions(tag, opts = {}) {
  const r = roots(opts); const w = opts.watch || [];
  const out = [];
  for (const f of walk(r.claude, (n) => n.endsWith('.jsonl'))) if (fileHas(f, tag)) { const s = claudeSession(f, tag, w); if (s) out.push(s); }
  for (const f of walk(r.codex, (n) => n.endsWith('.jsonl'))) if (fileHas(f, tag)) { const s = codexSession(f, tag, w); if (s) out.push(s); }
  for (const f of walk(r.grok, (n) => n === 'chat_history.jsonl')) if (fileHas(f, tag)) { const s = grokSession(f, tag, w); if (s) out.push(s); }
  return out;
}

// 여러 세션(예: 계획 세션 + 구현 세션)을 하나로 합친다.
function sumSessions(list) {
  const t = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, nonCache: 0, total: 0 };
  let activeSec = 0; let turns = 0; const skills = new Set(); const hits = {};
  for (const s of list) {
    for (const [k, v] of Object.entries(s.watchHits || {})) hits[k] = (hits[k] || 0) + v;
    for (const k of Object.keys(t)) t[k] += num(s.tokens && s.tokens[k]);
    activeSec += num(s.activeSec); turns += num(s.turns);
    for (const x of s.skillReads || []) skills.add(x);
  }
  return { sessions: list.length, tokens: t, activeSec, turns, skillReads: [...skills].sort(), watchHits: hits };
}

module.exports = { parseTag, findSessions, sumSessions, activeFromTurns, skillFromPath, skillsInText, claudeSession, codexSession, grokSession };
