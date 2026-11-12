const test = require('node:test');
const assert = require('node:assert');
const { guideView, SESSION } = require('../lib/guide');

function findItem(guide, id) {
  for (const sec of guide.sections) {
    for (const it of sec.items || []) if (it.id === id) return it;
    for (const g of sec.groups || []) {
      for (const it of g.items || []) if (it.id === id) return it;
    }
  }
  return null;
}

function countItems(commands) {
  let n = 0;
  for (const sec of commands.sections || []) {
    n += (sec.items || []).length;
    for (const g of sec.groups || []) n += (g.items || []).length;
  }
  return n;
}

function catalog(items, extra) {
  return Object.assign({ sections: [{ id: 'do', title: 'do', items }] }, extra);
}

test('SESSION 네 슬래시', () => {
  assert.deepStrictEqual([...SESSION].sort(), ['/clear', '/compact', '/context', '/new'].sort());
});

test('graphify 한 행 보류 → lab', () => {
  const commands = catalog([{ id: 'sk-graphify', title: 'graphify', tag: '보류' }]);
  const rows = [{ skill: 'graphify', task: 'point-mapper-recover', label: '보류', n: 1, removed: null }];
  const g = guideView(commands, rows);
  const it = findItem(g, 'sk-graphify');
  assert.ok(it);
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '보류');
  assert.strictEqual(it.skillKey, 'graphify');
  assert.strictEqual(g.sections.find((s) => s.id === 'lab-record').items[0].id, 'sk-graphify');
  assert.strictEqual(g.counts.lab, 1);
});

test('writing-plans removed 날짜 문자열 → hidden', () => {
  const commands = catalog([{ id: 'sk-wp', title: 'writing-plans', tag: '빼기' }]);
  const rows = [{ skill: 'writing-plans', task: 'fe-point-recover-plan', label: '빼기', n: 1, removed: '2026-11-12' }];
  const g = guideView(commands, rows);
  assert.strictEqual(findItem(g, 'sk-wp'), null);
  assert.strictEqual(g.counts.hidden, 1);
  assert.strictEqual(g.counts.lab, 0);
  assert.ok(!g.sections.some((s) => s.id === 'lab-record'));
});

test('improve 두 행 → lab, 보류, detail에 보류와 빼기', () => {
  const commands = catalog([{ id: 'sk-improve', title: 'improve', tag: '보류' }]);
  const rows = [
    { skill: 'improve', task: 'fe-point-recover-plan', label: '보류', n: 1, removed: null },
    { skill: 'improve', task: 'lab-verdict-impl', label: '빼기', n: 1, removed: null },
  ];
  const g = guideView(commands, rows);
  const it = findItem(g, 'sk-improve');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '보류');
  assert.ok(it.detail.includes('보류'));
  assert.ok(it.detail.includes('빼기'));
  assert.ok(it.detail.includes('fe-point-recover-plan'));
  assert.ok(it.detail.includes('lab-verdict-impl'));
});

test('wiki-before-after-r1 세 행 → lab, detail에 세 라벨과 n=1', () => {
  const commands = catalog([{ id: 'sk-wiki-ba', title: '위키 전후', skill: 'wiki-before-after-r1' }]);
  const rows = [
    { skill: 'wiki-before-after-r1', task: 'wiki-ba-impl', label: '써야 함', n: 1, removed: null },
    { skill: 'wiki-before-after-r1', task: 'wiki-ba-analysis', label: '보류', n: 1, removed: null },
    { skill: 'wiki-before-after-r1', task: 'wiki-ba-recall', label: '빼기', n: 1, removed: null },
  ];
  const g = guideView(commands, rows);
  const it = findItem(g, 'sk-wiki-ba');
  assert.strictEqual(it.surface, 'lab');
  assert.notStrictEqual(it.surface, 'default');
  assert.strictEqual(it.verdictLabel, '보류');
  assert.ok(it.detail.includes('써야 함'));
  assert.ok(it.detail.includes('보류'));
  assert.ok(it.detail.includes('빼기'));
  assert.ok(it.detail.includes('n=1'));
});

test('써야 함과 빼기만 있는 스킬 → lab, 보류', () => {
  const commands = catalog([{ id: 'mix', title: 'mix', skill: 'mix-skill' }]);
  const rows = [
    { skill: 'mix-skill', task: 'keep', label: '써야 함', n: 2, removed: null },
    { skill: 'mix-skill', task: 'drop', label: '빼기', n: 2, removed: null },
  ];
  const g = guideView(commands, rows);
  const it = findItem(g, 'mix');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '보류');
  assert.ok(it.detail.includes('써야 함'));
  assert.ok(it.detail.includes('빼기'));
});

test('action에 스킬 키만 있고 행 없음 → lab, 미실험', () => {
  const commands = catalog([{ id: 'act', title: 'act', role: 'action', skill: 'unmeasured', kind: 'prompt' }]);
  const g = guideView(commands, []);
  const it = findItem(g, 'act');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '미실험');
  assert.strictEqual(it.detail, '조인된 성적표 행 없음');
  assert.strictEqual(it.skillKey, 'unmeasured');
});

test('써야 함 n=2 contaminated undefined → default', () => {
  const commands = catalog([{ id: 'adopt', title: 'adopt', role: 'record', skill: 'example-adopt' }]);
  const rows = [{ skill: 'example-adopt', task: 'sample-task', label: '써야 함', n: 2 }];
  const g = guideView(commands, rows);
  const it = findItem(g, 'adopt');
  assert.strictEqual(it.surface, 'default');
  assert.strictEqual(it.verdictLabel, '써야 함');
  assert.ok(g.sections.some((s) => s.id === 'do'));
  assert.ok(!g.sections.some((s) => s.id === 'lab-record'));
  assert.strictEqual(g.counts.default, 1);
});

test('써야 함 n=2 contaminated true → lab', () => {
  const commands = catalog([{ id: 'dirty', title: 'dirty', role: 'record', skill: 'dirty' }]);
  const rows = [{ skill: 'dirty', task: 't', label: '써야 함', n: 2, contaminated: true }];
  const g = guideView(commands, rows);
  const it = findItem(g, 'dirty');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '써야 함');
});

test('써야 함 n=1 → lab, verdictLabel은 써야 함', () => {
  const commands = catalog([{ id: 'once', title: 'once', role: 'record', skill: 'once' }]);
  const rows = [{ skill: 'once', task: 't', label: '써야 함', n: 1, removed: null }];
  const g = guideView(commands, rows);
  const it = findItem(g, 'once');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '써야 함');
});

test('벗겨 낸 8개 id는 default, 픽스처에 절대 경로 없음', () => {
  const commandIds = ['lab-ab', 'wiki-query', 'wiki-ingest', 'wiki-concept', 'wiki-concept-query', 'wiki-concept-save'];
  const promptIds = ['orca-ask-index', 'orca-save'];
  const items = [
    ...commandIds.map((id) => ({ id, title: id, kind: 'command', commands: ['node bin/wiki.js'] })),
    ...promptIds.map((id) => ({ id, title: id, kind: 'prompt', body: '위키에서 찾아 줘' })),
  ];
  const raw = JSON.stringify(items);
  assert.ok(!/C:\\/i.test(raw) && !/C:\//i.test(raw));
  const g = guideView(catalog(items), []);
  for (const id of commandIds.concat(promptIds)) {
    const it = findItem(g, id);
    assert.strictEqual(it.surface, 'default', id);
    assert.strictEqual(it.quick, undefined);
  }
  assert.strictEqual(g.counts.default, 8);
  assert.strictEqual(g.quick, undefined);
});

test('/diagram-design + 보류 (미실험) → lab', () => {
  const commands = catalog([{
    id: 'pl-diagram', title: '/diagram-design', kind: 'command',
    commands: ['/diagram-design'], tag: '보류 (미실험)',
  }]);
  const g = guideView(commands, []);
  const it = findItem(g, 'pl-diagram');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '미실험');
});

test('/clear 하나만 + 추천 → session / default', () => {
  const commands = catalog([{ id: 'clear', title: '/clear', commands: ['/clear'], tag: '추천' }]);
  const g = guideView(commands, []);
  const it = findItem(g, 'clear');
  assert.strictEqual(it.surface, 'default');
  assert.notStrictEqual(it.surface, 'reference');
  assert.strictEqual(g.counts.default, 1);
  assert.strictEqual(g.counts.reference, 0);
});

test('입력 commands 항목 수는 guideView 뒤에도 그대로다', () => {
  const commands = {
    sections: [{
      id: 'do',
      items: [{ id: 'impl', title: '기능 구현', kind: 'prompt' }],
      groups: [{ title: 'sk', items: [{ id: 'g', title: 'graphify', tag: '보류' }] }],
    }],
  };
  const snapshot = JSON.stringify(commands);
  const n = countItems(commands);
  const g = guideView(commands, [{ skill: 'graphify', task: 't', label: '보류', n: 1 }]);
  assert.strictEqual(JSON.stringify(commands), snapshot);
  assert.strictEqual(countItems(commands), n);
  assert.strictEqual(commands.sections[0].items[0].surface, undefined);
  assert.strictEqual(commands.sections[0].groups[0].items[0].surface, undefined);
  assert.ok(findItem(g, 'g'));
});

test('빈이 된 섹션은 없고 questions는 남는다', () => {
  const commands = {
    sections: [
      { id: 'gone', title: 'gone', items: [{ id: 'g', title: 'graphify', tag: '보류' }] },
      {
        id: 'ask', title: 'ask',
        items: [{ id: 'imp', title: 'improve', tag: '보류' }],
        questions: [{ topic: 'wiki', questions: ['이 위키는 뭐야'] }],
      },
      { id: 'keep', title: 'keep', items: [{ id: 'impl', title: '기능 구현', kind: 'prompt' }] },
    ],
  };
  const rows = [
    { skill: 'graphify', task: 't', label: '보류', n: 1, removed: null },
    { skill: 'improve', task: 't', label: '보류', n: 1, removed: null },
  ];
  const g = guideView(commands, rows);
  assert.ok(!g.sections.some((s) => s.id === 'gone'));
  const ask = g.sections.find((s) => s.id === 'ask');
  assert.ok(ask);
  assert.ok(ask.questions && ask.questions.length === 1);
  assert.ok(!ask.items || ask.items.length === 0);
  assert.ok(g.sections.some((s) => s.id === 'keep'));
  assert.ok(g.sections.some((s) => s.id === 'lab-record'));
});

test('skill: null이면 제목이 행과 같아도 조인하지 않는다', () => {
  const commands = catalog([{ id: 'nojoin', title: 'graphify', skill: null, tag: '보류' }]);
  const rows = [{ skill: 'graphify', task: 't', label: '보류', n: 1, removed: null }];
  const g = guideView(commands, rows);
  const it = findItem(g, 'nojoin');
  assert.strictEqual(it.skillKey, null);
  assert.strictEqual(it.verdictLabel, '미실험');
  assert.strictEqual(it.detail, '조인된 성적표 행 없음');
});

test('제목 조인은 skill 필드가 없고 role이 record일 때만 (graphify / improve)', () => {
  const commands = {
    sections: [{
      id: 'sk',
      items: [
        { id: 'by-title-g', title: 'graphify', tag: '보류' },
        { id: 'by-title-i', title: 'improve', tag: '보류' },
        { id: 'action-title', title: 'graphify', role: 'action', kind: 'prompt' },
      ],
    }],
  };
  const rows = [
    { skill: 'graphify', task: 't', label: '보류', n: 1, removed: null },
    { skill: 'improve', task: 'a', label: '보류', n: 1, removed: null },
    { skill: 'improve', task: 'b', label: '빼기', n: 1, removed: null },
  ];
  const g = guideView(commands, rows);
  assert.strictEqual(findItem(g, 'by-title-g').skillKey, 'graphify');
  assert.strictEqual(findItem(g, 'by-title-g').surface, 'lab');
  assert.strictEqual(findItem(g, 'by-title-i').skillKey, 'improve');
  assert.strictEqual(findItem(g, 'by-title-i').verdictLabel, '보류');
  const act = findItem(g, 'action-title');
  assert.strictEqual(act.surface, 'default');
  assert.strictEqual(act.skillKey, null);
});

test('no-clean (/clear와 다른 명령)은 session이 아니다', () => {
  const commands = catalog([{ id: 'no-clean', title: 'no-clean', commands: ['/clear', 'echo keep'], tag: '추천' }]);
  const g = guideView(commands, []);
  const it = findItem(g, 'no-clean');
  assert.strictEqual(it.surface, 'reference');
  assert.strictEqual(g.counts.reference, 1);
  assert.strictEqual(g.counts.default, 0);
});

test('plugin /diagram-design 행 없음 → lab 미실험', () => {
  const commands = catalog([{
    id: 'diagram', title: '그림으로 정리', role: 'plugin', kind: 'command',
    commands: ['/diagram-design'], tag: '보류 (미실험)',
  }]);
  const g = guideView(commands, []);
  const it = findItem(g, 'diagram');
  assert.strictEqual(it.surface, 'lab');
  assert.strictEqual(it.verdictLabel, '미실험');
});

test('active가 전부 빼기이면 hidden, 설치 전용 행은 가이드에 안 넣는다', () => {
  const commands = catalog([{ id: 'drop-only', title: 'drop-only', skill: 'drop-only', role: 'record' }]);
  const rows = [
    { skill: 'drop-only', task: 't', label: '빼기', n: 1, removed: null },
    { skill: 'installed-only', task: '', label: '미실험', n: 0 },
  ];
  const g = guideView(commands, rows);
  assert.strictEqual(findItem(g, 'drop-only'), null);
  assert.strictEqual(g.counts.hidden, 1);
  assert.ok(!findItem(g, 'installed-only'));
});

test('questions와 레거시 배열은 복사만 하고 세지 않는다', () => {
  const commands = {
    workdir: 'wiki',
    intro: 'hi',
    sections: [{
      id: 'ask',
      items: [{ id: 'impl', kind: 'prompt', title: '구현' }],
      questions: [{ topic: 'wiki', questions: ['q1'] }],
    }],
    situations: [{ id: 'query' }],
    agentPrompts: [{ id: 'a' }],
    exampleQuestions: [{ topic: 'wiki' }],
  };
  const g = guideView(commands, []);
  assert.strictEqual(g.workdir, 'wiki');
  assert.strictEqual(g.intro, 'hi');
  assert.strictEqual(g.sections[0].questions[0].topic, 'wiki');
  assert.strictEqual(g.situations[0].id, 'query');
  assert.strictEqual(g.agentPrompts[0].id, 'a');
  assert.strictEqual(g.exampleQuestions[0].topic, 'wiki');
  assert.strictEqual(g.counts.default, 1);
  assert.deepStrictEqual(g.counts, { default: 1, lab: 0, hidden: 0, reference: 0 });
});

test('오늘 71항목 분할: default 26 lab 23 hidden 0 reference 22', () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const commands = {
    sections: [
      {
        id: 'do',
        items: [
          ...many(12, (i) => ({ id: `p${i}`, title: `p${i}`, kind: 'prompt' })),
          ...many(6, (i) => ({ id: `c${i}`, title: `c${i}`, kind: 'command', commands: ['node bin/wiki.js'] })),
        ],
        questions: [{ topic: 'wiki', questions: ['q'] }],
      },
      {
        id: 'slash',
        groups: [
          {
            title: 'session',
            items: [
              { id: 'clear', commands: ['/clear'] },
              { id: 'new1', commands: ['/new'] },
              { id: 'new2', commands: ['/new'] },
              { id: 'compact1', commands: ['/compact'] },
              { id: 'compact2', commands: ['/compact'] },
              { id: 'compact3', commands: ['/compact'] },
              { id: 'ctx1', commands: ['/context'] },
              { id: 'ctx2', commands: ['/context'] },
            ],
          },
          { title: 'ref', items: many(22, (i) => ({ id: `ref${i}`, tag: '추천', commands: ['/usage'] })) },
          { title: 'rec', items: many(23, (i) => ({ id: `rec${i}`, tag: '보류' })) },
        ],
      },
    ],
  };
  const g = guideView(commands, []);
  assert.deepStrictEqual(g.counts, { default: 26, lab: 23, hidden: 0, reference: 22 });
  assert.strictEqual(countItems(commands), 71);
  assert.ok(g.sections.some((s) => s.id === 'do' && s.questions && s.questions.length === 1));
  assert.ok(g.sections.some((s) => s.id === 'lab-record' && s.items.length === 23));
});
