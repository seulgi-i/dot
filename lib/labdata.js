'use strict';
// lab-runs.jsonl + 결과 카드 + 추천 프롬프트를 읽어 화면용 데이터로 만든다.
const fs = require('fs');
const path = require('path');
const { verdict } = require('./verdict');

function readJsonl(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 건너뜀 */ }
  }
  return out;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// 월요일 시작 주(Asia/Seoul). date는 'YYYY-MM-DD'.
function weekStart(today) {
  const d = new Date(`${today}T00:00:00+09:00`);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const dow = (kst.getUTCDay() + 6) % 7;
  const start = new Date(kst.getTime() - dow * 86400000);
  return start.toISOString().slice(0, 10);
}

function kstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function side(run) {
  if (!run) return null;
  return {
    quality: typeof run.quality === 'number' ? run.quality : null,
    tokens: typeof run.nonCache === 'number' ? run.nonCache : null,
    activeSec: typeof run.activeSec === 'number' ? run.activeSec : null,
    rejects: typeof run.rejects === 'number' ? run.rejects : null,
    testsPass: typeof run.testsPass === 'boolean' ? run.testsPass : null,
  };
}

function scoreboard(devlog, opts = {}) {
  const skillsDir = path.join(devlog, 'skills');
  const runs = readJsonl(path.join(skillsDir, 'lab-runs.jsonl'));
  const bySkill = new Map();
  for (const r of runs) {
    if (!r || !r.skill) continue;
    // 같은 스킬이라도 과제(계획/구현 등)가 다르면 다른 줄로 본다.
    const key = `${r.skill}|${r.task || ''}`;
    const list = bySkill.get(key) || [];
    list.push(r);
    bySkill.set(key, list);
  }
  const rows = [];
  const tested = new Set();
  for (const [, list] of bySkill) {
    const skill = list[0].skill;
    tested.add(skill);
    list.sort((x, y) => String(x.date).localeCompare(String(y.date)));
    const last = list[list.length - 1];
    const contaminated = !!(last.a && Array.isArray(last.a.skillReads) && last.a.skillReads.length) || last.contaminated === true;
    const v = verdict(side(last.a), side(last.b), { contaminated });
    const cardRel = last.card || null;
    rows.push({
      skill, category: last.category || '', source: last.source || '', task: last.task || '',
      label: v.label, reasons: v.reasons, tokenPct: v.tokenPct, timePct: v.timePct, qualityDelta: v.qualityDelta,
      a: last.a || null, b: last.b || null, n: list.length, date: last.date || '',
      contaminated, compliance: last.compliance == null ? null : !!last.compliance,
      note: last.note || '', removed: last.removed || null, card: cardRel, cardExists: cardRel ? fs.existsSync(path.join(devlog, cardRel)) : false,
    });
  }
  // 설치돼 있지만 아직 실험 안 한 공용 스킬
  const installed = opts.skillsRoot ? safeList(opts.skillsRoot) : [];
  for (const name of installed) {
    if (tested.has(name)) continue;
    rows.push({ skill: name, category: '', source: '', task: '', label: '미실험', reasons: ['아직 A/B 기록 없음'], tokenPct: null, timePct: null, qualityDelta: null, a: null, b: null, n: 0, date: '', contaminated: false, compliance: null, note: '', card: null, cardExists: false });
  }
  const order = { '써야 함': 0, '보류': 1, '빼기': 2, '미실험': 3 };
  rows.sort((x, y) => (order[x.label] - order[y.label]) || x.category.localeCompare(y.category) || x.skill.localeCompare(y.skill));
  const today = opts.today || kstToday();
  const ws = weekStart(today);
  const mustUse = rows.filter((r) => r.label === '써야 함' && r.date >= ws && r.date <= today).length;
  return { rows, mustUseThisWeek: mustUse, weekStart: ws, today };
}

function safeList(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && (e.isDirectory() || e.isSymbolicLink())).map((e) => e.name).sort();
  } catch { return []; }
}

function prompts(devlog) {
  const data = readJson(path.join(devlog, 'skills', 'prompts.json'), { prompts: [] });
  return Array.isArray(data.prompts) ? data.prompts : [];
}


function wikiCommands(devlog) {
  const empty = { workdir: '', intro: '', sections: [], situations: [], agentPrompts: [], exampleQuestions: [] };
  const data = readJson(path.join(devlog, 'wiki', 'commands.json'), null);
  if (!data || typeof data !== 'object') return empty;
  return {
    workdir: typeof data.workdir === 'string' ? data.workdir : '',
    intro: typeof data.intro === 'string' ? data.intro : '',
    sections: Array.isArray(data.sections) ? data.sections : [],
    situations: Array.isArray(data.situations) ? data.situations : [],
    agentPrompts: Array.isArray(data.agentPrompts) ? data.agentPrompts : [],
    exampleQuestions: Array.isArray(data.exampleQuestions) ? data.exampleQuestions : [],
  };
}


function parseApplyCards(md) {
  const text = String(md || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cards = [];
  const parts = text.split(/^## /m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? '' : part.slice(nl + 1);
    if (!title) continue;
    const field = (name) => {
      const m = body.match(new RegExp('^-[ \\t]*' + name + ':[ \\t]*(.*)$', 'm'));
      return m ? m[1].trim() : '';
    };
    let prompt = '';
    const pm = body.match(/```prompt[ \t]*\n([\s\S]*?)```/);
    if (pm) prompt = pm[1].replace(/\s+$/, '');
    cards.push({
      title,
      verdict: field('판정'),
      attach: field('붙일 곳'),
      value: field('효용'),
      dataNote: field('데이터 주의'),
      spec: field('스펙 문장'),
      prompt,
    });
  }
  return cards;
}

function applyToday(devlog) {
  const empty = { file: null, date: null, rel: null, cards: [] };
  const dir = path.join(devlog, 'wiki', 'wiki', 'apply');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/i.test(n)).sort().reverse();
  } catch {
    return empty;
  }
  if (!names.length) return empty;
  const name = names[0];
  const full = path.join(dir, name);
  let md = '';
  try { md = fs.readFileSync(full, 'utf8'); } catch { return empty; }
  const rel = path.join('wiki', 'wiki', 'apply', name).split(path.sep).join('/');
  return { file: full, date: name.replace(/\.md$/i, ''), rel, cards: parseApplyCards(md) };
}

module.exports = { scoreboard, prompts, wikiCommands, applyToday, parseApplyCards, weekStart, kstToday, readJsonl };
