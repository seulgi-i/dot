const test = require('node:test');
const assert = require('node:assert');
const { buildLoadPayload, guideFilterOn } = require('../lib/load-payload');

function catalog(items) {
  return { workdir: '', intro: '', sections: [{ id: 'do', title: 'do', items }], situations: [], agentPrompts: [], exampleQuestions: [] };
}

test('guideFilter 없음 → true', () => {
  assert.strictEqual(guideFilterOn(undefined), true);
  assert.strictEqual(guideFilterOn(null), true);
  assert.strictEqual(guideFilterOn({}), true);
  const payload = buildLoadPayload({ config: {}, board: { rows: [] }, commands: catalog([]) });
  assert.strictEqual(payload.guideFilter, true);
});

test('guideFilter true → true', () => {
  assert.strictEqual(guideFilterOn({ guideFilter: true }), true);
  const payload = buildLoadPayload({ config: { guideFilter: true }, board: { rows: [] }, commands: catalog([]) });
  assert.strictEqual(payload.guideFilter, true);
});

test('guideFilter false → false', () => {
  assert.strictEqual(guideFilterOn({ guideFilter: false }), false);
  const payload = buildLoadPayload({ config: { guideFilter: false }, board: { rows: [] }, commands: catalog([]) });
  assert.strictEqual(payload.guideFilter, false);
});

test('wikiCommands 는 넘긴 commands 객체 그대로이고 변이 없음', () => {
  const commands = catalog([{ id: 'implement', title: '기능 구현', kind: 'prompt' }]);
  const payload = buildLoadPayload({ config: {}, board: { rows: [] }, commands, prompts: [], applyToday: null, loadedAt: 't' });
  assert.strictEqual(payload.wikiCommands, commands);
  assert.strictEqual(commands.sections[0].items[0].surface, undefined);
  assert.ok(!('quick' in payload));
});

test('guide 는 필터된 뷰 (counts / sections)', () => {
  const commands = catalog([
    { id: 'implement', title: '기능 구현', kind: 'prompt' },
    { id: 'sk-drop', title: 'drop-me', skill: 'drop-me', role: 'record' },
  ]);
  const board = { rows: [{ skill: 'drop-me', task: 't', label: '빼기', n: 1, removed: null }] };
  const prompts = [{ id: 'p' }];
  const applyToday = { cards: [] };
  const payload = buildLoadPayload({ config: {}, board, commands, prompts, applyToday, loadedAt: '2026-11-12T00:00:00.000Z' });
  assert.strictEqual(payload.board, board);
  assert.strictEqual(payload.prompts, prompts);
  assert.strictEqual(payload.applyToday, applyToday);
  assert.strictEqual(payload.loadedAt, '2026-11-12T00:00:00.000Z');
  assert.ok(payload.guide);
  assert.ok(payload.guide.counts);
  assert.ok(Array.isArray(payload.guide.sections));
  assert.strictEqual(payload.guide.counts.default, 1);
  assert.strictEqual(payload.guide.counts.hidden, 1);
  assert.strictEqual(payload.guide.counts.lab, 0);
  assert.strictEqual(payload.wikiCommands.sections[0].items.length, 2);
});
