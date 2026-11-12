const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ex = require('../lib/extract');

const TAG = '[LAB:fe-plan/improve:B]';
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ex-')); }
function jsonl(file, rows) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); }

test('parseTag: 키에 슬래시가 있어도 읽는다', () => {
  assert.deepStrictEqual(ex.parseTag(`앞 ${TAG} 뒤`), { key: 'fe-plan/improve', arm: 'B', tag: TAG });
  assert.deepStrictEqual(ex.parseTag('[LAB:graphify:A] x'), { key: 'graphify', arm: 'A', tag: '[LAB:graphify:A]' });
  assert.strictEqual(ex.parseTag('태그 없음'), null);
  assert.strictEqual(ex.parseTag(null), null);
});

test('activeFromTurns: 턴 사이 쉬는 시간은 빠진다', () => {
  const t = (s) => Date.parse(`2026-11-12T00:00:${String(s).padStart(2, '0')}Z`);
  // 턴1: 0→10초, (쉼 10→40), 턴2: 40→45초
  assert.strictEqual(ex.activeFromTurns([t(0), t(40)], [t(0), t(5), t(10), t(40), t(45)]), 15);
});

test('skillFromPath / skillsInText', () => {
  assert.strictEqual(ex.skillFromPath('C:\\Users\\x\\.agents\\skills\\graphify\\SKILL.md'), 'graphify');
  assert.strictEqual(ex.skillFromPath('/home/x/.claude/skills/improve/SKILL.md'), 'improve');
  assert.strictEqual(ex.skillFromPath('README.md'), null);
  assert.deepStrictEqual([...ex.skillsInText('{"target_file":"C:\\\\Users\\\\x\\\\.agents\\\\skills\\\\writing-plans\\\\SKILL.md"}')], ['writing-plans']);
});

test('Claude: 같은 message.id 사용량은 한 번만, 태그 없는 세션은 무시', () => {
  const root = tmp();
  jsonl(path.join(root, 'claude', 'p1', 's1.jsonl'), [
    { type: 'user', timestamp: '2026-11-12T00:00:00Z', sessionId: 'c1', message: { content: `${TAG} 계획 써줘` } },
    { type: 'assistant', timestamp: '2026-11-12T00:00:05Z', message: { id: 'm1', usage: { input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 20 }, content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'improve' } }] } },
    { type: 'assistant', timestamp: '2026-11-12T00:00:06Z', message: { id: 'm1', usage: { input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 20 }, content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'C:\\u\\.claude\\skills\\improve\\SKILL.md' } }] } },
    { type: 'user', timestamp: '2026-11-12T00:00:07Z', message: { content: [{ type: 'tool_result', content: 'x' }] } },
    { type: 'assistant', timestamp: '2026-11-12T00:00:10Z', message: { id: 'm2', usage: { input_tokens: 10, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0, output_tokens: 30 }, content: [] } },
  ]);
  jsonl(path.join(root, 'claude', 'p1', 's2.jsonl'), [{ type: 'user', timestamp: '2026-11-12T00:00:00Z', message: { content: '다른 일' } }]);
  const found = ex.findSessions(TAG, { claudeRoot: path.join(root, 'claude'), codexRoot: path.join(root, 'none1'), grokRoot: path.join(root, 'none2') });
  assert.strictEqual(found.length, 1);
  const s = found[0];
  assert.strictEqual(s.agent, 'claude');
  assert.deepStrictEqual(s.tokens, { input: 110, cacheRead: 3000, cacheWrite: 50, output: 50, nonCache: 210, total: 3210 });
  assert.strictEqual(s.turns, 1);
  assert.strictEqual(s.activeSec, 10);
  assert.deepStrictEqual(s.skillReads, ['improve']);
});

test('Codex: 마지막 누적 사용량에서 캐시를 뺀다', () => {
  const root = tmp();
  jsonl(path.join(root, 'codex', '2026', 'r.jsonl'), [
    { type: 'session_meta', timestamp: '2026-11-12T00:00:00Z', payload: { id: 'x1', cwd: 'C:/w' } },
    { type: 'event_msg', timestamp: '2026-11-12T00:00:01Z', payload: { type: 'user_message', message: `${TAG} 해줘` } },
    { type: 'response_item', timestamp: '2026-11-12T00:00:02Z', payload: { type: 'function_call', name: 'shell', arguments: '{"command":["cat","C:/u/.agents/skills/tdd/SKILL.md"]}' } },
    { type: 'event_msg', timestamp: '2026-11-12T00:00:03Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 500, cached_input_tokens: 300, output_tokens: 40 } } } },
    { type: 'event_msg', timestamp: '2026-11-12T00:00:21Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 900, cached_input_tokens: 600, output_tokens: 70 } } } },
  ]);
  const [s] = ex.findSessions(TAG, { claudeRoot: path.join(root, 'n'), codexRoot: path.join(root, 'codex'), grokRoot: path.join(root, 'n2') });
  assert.strictEqual(s.agent, 'codex');
  assert.strictEqual(s.tokens.nonCache, 300 + 70);
  assert.strictEqual(s.tokens.cacheRead, 600);
  assert.strictEqual(s.activeSec, 20);
  assert.deepStrictEqual(s.skillReads, ['tdd']);
});

test('Grok: chat_history 사용자 프롬프트에서 태그를 찾고 events로 활성 시간을 잰다', () => {
  const root = tmp();
  const dir = path.join(root, 'grok', 'C%3A%5Cw', 'sess1');
  jsonl(path.join(dir, 'chat_history.jsonl'), [
    { type: 'system', content: '시스템' },
    { type: 'user', content: [{ type: 'text', text: '<system-reminder>skills</system-reminder>' }], synthetic_reason: 'system_reminder' },
    { type: 'user', content: [{ type: 'text', text: `<user_query>\n${TAG}\n과제\n</user_query>` }], prompt_index: 0 },
    { type: 'assistant', content: '읽을게', tool_calls: [{ id: 'c1', name: 'read_file', arguments: '{"target_file":"C:\\\\Users\\\\x\\\\.agents\\\\skills\\\\improve\\\\SKILL.md"}' }] },
  ]);
  fs.writeFileSync(path.join(dir, 'usage.json'), JSON.stringify({ sessionId: 'sess1', session: { inputTokens: 5000, cachedReadTokens: 4000, cacheCreationTokens: 0, outputTokens: 200 }, turns: [{}] }));
  jsonl(path.join(dir, 'events.jsonl'), [
    { ts: '2026-11-12T00:00:00Z', type: 'turn_started' },
    { ts: '2026-11-12T00:01:30Z', type: 'turn_ended' },
  ]);
  // summary.json 에 제목이 없어도 찾아야 한다
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ info: { cwd: 'C:\\w' } }));
  const [s] = ex.findSessions(TAG, { claudeRoot: path.join(root, 'n'), codexRoot: path.join(root, 'n2'), grokRoot: path.join(root, 'grok'), watch: ['improve', 'graphify'] });
  assert.strictEqual(s.agent, 'grok');
  assert.deepStrictEqual(s.watchHits, { improve: 1 });
  assert.strictEqual(s.tokens.nonCache, 1000 + 200);
  assert.strictEqual(s.activeSec, 90);
  assert.strictEqual(s.turns, 1);
  assert.deepStrictEqual(s.skillReads, ['improve']);
});

test('Grok: 시스템 리마인더 안의 태그는 세지 않는다', () => {
  const root = tmp();
  const dir = path.join(root, 'grok', 'w', 's');
  jsonl(path.join(dir, 'chat_history.jsonl'), [{ type: 'user', content: [{ type: 'text', text: TAG }], synthetic_reason: 'system_reminder' }]);
  assert.strictEqual(ex.findSessions(TAG, { claudeRoot: path.join(root, 'n'), codexRoot: path.join(root, 'n2'), grokRoot: path.join(root, 'grok') }).length, 0);
});

test('sumSessions: 계획+구현 세션 합산', () => {
  const s = ex.sumSessions([
    { tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 3, nonCache: 4, total: 6 }, activeSec: 10, turns: 1, skillReads: ['improve'] },
    { tokens: { input: 10, cacheRead: 20, cacheWrite: 0, output: 30, nonCache: 40, total: 60 }, activeSec: 5, turns: 2, skillReads: [] },
  ]);
  assert.strictEqual(s.tokens.nonCache, 44);
  assert.strictEqual(s.activeSec, 15);
  assert.strictEqual(s.turns, 3);
  assert.deepStrictEqual(s.skillReads, ['improve']);
});
