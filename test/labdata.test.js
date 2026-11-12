const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ld = require('../lib/labdata');

test('weekStart: 월요일 시작(KST)', () => {
  assert.strictEqual(ld.weekStart('2026-11-12'), '2026-11-09');
  assert.strictEqual(ld.weekStart('2026-11-09'), '2026-11-09');
  assert.strictEqual(ld.weekStart('2026-11-15'), '2026-11-09');
});

test('scoreboard: 판정·오염·미실험·이번 주 개수', () => {
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ld-'));
  const skills = path.join(dev, 'skills');
  fs.mkdirSync(path.join(skills, 'results'), { recursive: true });
  const rootSk = path.join(dev, 'agents-skills');
  for (const n of ['good', 'dirty', 'fresh']) fs.mkdirSync(path.join(rootSk, n), { recursive: true });
  const A = { quality: 4, nonCache: 1000, activeSec: 100, rejects: 0, testsPass: null, skillReads: [] };
  const lines = [
    { date: '2026-11-12', skill: 'good', category: '계획', a: A, b: { quality: 4, nonCache: 700, activeSec: 90, rejects: 0, testsPass: null }, card: 'skills/results/good-2026-11-12.md' },
    { date: '2026-11-12', skill: 'dirty', category: '분석', a: Object.assign({}, A, { skillReads: ['dirty'] }), b: { quality: 4, nonCache: 100, activeSec: 10, rejects: 0 } },
  ];
  fs.writeFileSync(path.join(skills, 'lab-runs.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n{깨진 줄\n');
  fs.writeFileSync(path.join(skills, 'results', 'good-2026-11-12.md'), '# card');
  const b = ld.scoreboard(dev, { skillsRoot: rootSk, today: '2026-11-12' });
  const by = Object.fromEntries(b.rows.map((r) => [r.skill, r]));
  assert.strictEqual(by.good.label, '써야 함');
  assert.strictEqual(by.good.tokenPct, -30);
  assert.strictEqual(by.good.cardExists, true);
  assert.strictEqual(by.dirty.label, '보류');
  assert.strictEqual(by.dirty.contaminated, true);
  assert.strictEqual(by.fresh.label, '미실험');
  assert.strictEqual(b.mustUseThisWeek, 1);
  assert.strictEqual(b.rows[0].skill, 'good');
});

test('scoreboard: 같은 날짜 두 줄은 파일의 나중 줄이 이긴다', () => {
  // 같은 날짜 비교는 0이라 ES2019 안정 정렬이 파일 순서를 유지한다.
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ld-'));
  const skills = path.join(dev, 'skills');
  fs.mkdirSync(skills, { recursive: true });
  const a = { quality: 4, nonCache: 1000, activeSec: 100, rejects: 0, testsPass: true };
  const first = {
    date: '2026-11-12', skill: 'same-date', task: 'same-task',
    a, b: { quality: 4, nonCache: 1000, activeSec: 100, rejects: 0, testsPass: true },
  };
  const later = {
    date: '2026-11-12', skill: 'same-date', task: 'same-task',
    a, b: { quality: 4, nonCache: 700, activeSec: 100, rejects: 0, testsPass: true },
  };
  fs.writeFileSync(path.join(skills, 'lab-runs.jsonl'), [first, later].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const b = ld.scoreboard(dev, { today: '2026-11-12' });
  const row = b.rows.find((r) => r.skill === 'same-date');
  assert.ok(row);
  assert.strictEqual(row.label, '써야 함');
  assert.strictEqual(row.tokenPct, -30);
  assert.strictEqual(row.n, 2);
});

test('prompts: 파일 없으면 빈 배열', () => {
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ld-'));
  assert.deepStrictEqual(ld.prompts(dev), []);
});

test('wikiCommands: 파일 없으면 빈 구조, 있으면 목록을 읽는다', () => {
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ld-'));
  const empty = ld.wikiCommands(dev);
  assert.strictEqual(empty.workdir, '');
  assert.deepStrictEqual(empty.situations, []);
  assert.deepStrictEqual(empty.agentPrompts, []);
  assert.deepStrictEqual(empty.exampleQuestions, []);
  fs.mkdirSync(path.join(dev, 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(dev, 'wiki', 'commands.json'), JSON.stringify({
    workdir: 'C:\\wiki',
    intro: 'hi',
    situations: [{ id: 'query', title: '물어보기', commands: ['node bin/wiki.js query "..."'] }],
    agentPrompts: [{ id: 'a', title: 't', body: 'b' }],
    exampleQuestions: [{ topic: 'fortune', label: '운세', questions: ['q1'] }],
  }));
  const w = ld.wikiCommands(dev);
  assert.strictEqual(w.workdir, 'C:\\wiki');
  assert.strictEqual(w.situations[0].id, 'query');
  assert.strictEqual(w.agentPrompts[0].body, 'b');
  assert.strictEqual(w.exampleQuestions[0].questions[0], 'q1');
});

test('wikiCommands: sections 목록을 읽는다', () => {
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ld-'));
  assert.deepStrictEqual(ld.wikiCommands(dev).sections, []);
  fs.mkdirSync(path.join(dev, 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(dev, 'wiki', 'commands.json'), JSON.stringify({
    workdir: 'C:\\wiki',
    intro: 'hi',
    sections: [{ id: 'do', title: '뭘 하고 싶을 때', items: [{ id: 'implement', title: '기능 구현', tool: 'Grok' }] }],
  }));
  const w = ld.wikiCommands(dev);
  assert.strictEqual(w.sections[0].id, 'do');
  assert.strictEqual(w.sections[0].items[0].tool, 'Grok');
});

test('parseApplyCards: 제목·필드·prompt 블록을 읽는다', () => {
  const md = [
    '# 오늘 적용 카드',
    '',
    '## 카드 하나',
    '- 판정: 지금 할 일',
    '- 붙일 곳: 표준카테고리 매핑',
    '- 효용: 아직 모름',
    '- 데이터 주의: 실제 상품 데이터를 외부로 보내지 말 것',
    '- 스펙 문장:',
    '',
    '```prompt',
    '마스크된 50행으로 정확도를 재 줘',
    '백엔드에는 붙이지 마',
    '```',
    '',
    '## 버린 것',
    '- 판정: 버림',
    '- 붙일 곳: 스킬 실험',
    '- 효용: 토큰 +77%',
    '- 데이터 주의: 없음',
    '- 스펙 문장:',
    '',
    '```prompt',
    '재실험하지 마',
    '```',
    '',
  ].join('\n');
  const cards = ld.parseApplyCards(md);
  assert.strictEqual(cards.length, 2);
  assert.strictEqual(cards[0].title, '카드 하나');
  assert.strictEqual(cards[0].verdict, '지금 할 일');
  assert.strictEqual(cards[0].attach, '표준카테고리 매핑');
  assert.strictEqual(cards[0].value, '아직 모름');
  assert.strictEqual(cards[0].dataNote, '실제 상품 데이터를 외부로 보내지 말 것');
  assert.strictEqual(cards[0].spec, '');
  assert.strictEqual(cards[0].prompt, '마스크된 50행으로 정확도를 재 줘\n백엔드에는 붙이지 마');
  assert.strictEqual(cards[1].title, '버린 것');
  assert.strictEqual(cards[1].verdict, '버림');
  assert.strictEqual(cards[1].prompt, '재실험하지 마');
});

test('applyToday: 가장 최근 날짜 파일을 읽고, 없으면 빈 값', () => {
  const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-apply-'));
  const empty = ld.applyToday(dev);
  assert.strictEqual(empty.file, null);
  assert.deepStrictEqual(empty.cards, []);
  const dir = path.join(dev, 'wiki', 'wiki', 'apply');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# ignore');
  fs.writeFileSync(path.join(dir, '2026-11-11.md'), '## 어제\n- 판정: 사이드\n- 붙일 곳:\n- 효용:\n- 데이터 주의:\n- 스펙 문장:\n\n```prompt\nold\n```\n');
  fs.writeFileSync(path.join(dir, '2026-11-12.md'), '## 오늘 할 일\n- 판정: 지금 할 일\n- 붙일 곳: 스크립트\n- 효용: 아직 모름\n- 데이터 주의: 없음\n- 스펙 문장:\n\n```prompt\n지금 해\n```\n');
  const r = ld.applyToday(dev);
  assert.strictEqual(r.date, '2026-11-12');
  assert.strictEqual(r.rel, 'wiki/wiki/apply/2026-11-12.md');
  assert.strictEqual(r.cards.length, 1);
  assert.strictEqual(r.cards[0].title, '오늘 할 일');
  assert.strictEqual(r.cards[0].verdict, '지금 할 일');
  assert.strictEqual(r.cards[0].prompt, '지금 해');
});
