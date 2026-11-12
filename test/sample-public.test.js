'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const labdata = require('../lib/labdata');
const { guideView } = require('../lib/guide');

const root = path.join(__dirname, '..');
const sampleRoot = path.resolve(root, 'sample-data');
const fixtureRoot = path.resolve(__dirname, 'fixtures');
const commandsPath = path.join(sampleRoot, 'wiki', 'commands.json');
const jsonlPath = path.join(sampleRoot, 'skills', 'lab-runs.jsonl');
const fixturePath = path.join(fixtureRoot, 'nondev-api-brief.txt');
const ALLOWED_ROOTS = [sampleRoot, fixtureRoot];

const FORBIDDEN_SKILLS = [
  'graphify',
  'diagram-design',
  'eli5',
  'pptx',
  'improve',
  'brainstorming',
  'systematic-debugging',
  'diagnosing-bugs',
  'requesting-code-review',
  'receiving-code-review',
];

const FINGERPRINTS = [
  '14.2', '85.5', '10.2', '18.5', '29.7', '30.2', '31.3', '37.7',
  '46.1', '48.8', '68.6', '77.1', '89.1', '101.1', '103.8', '109.1',
  '116.7', '125.2', '149.8', '166.1', '195.3', '158167', '180568',
];

function assertAllowed(file) {
  const full = path.resolve(file);
  const ok = ALLOWED_ROOTS.some((dir) => full === dir || full.startsWith(dir + path.sep));
  assert.ok(ok, `not under sample-data or test/fixtures: ${full}`);
}

function readUtf8(file) {
  assertAllowed(file);
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function listFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function findItem(guide, id) {
  for (const sec of guide.sections || []) {
    for (const it of sec.items || []) if (it.id === id) return { item: it, section: sec };
    for (const g of sec.groups || []) {
      for (const it of g.items || []) if (it.id === id) return { item: it, section: sec };
    }
  }
  return null;
}

function catalogItem(commands, id) {
  for (const sec of commands.sections || []) {
    for (const it of sec.items || []) if (it.id === id) return it;
    for (const g of sec.groups || []) {
      for (const it of g.items || []) if (it.id === id) return it;
    }
  }
  return null;
}

function assertNoLiveIds(text, label) {
  assert.ok(!text.includes('인피'), `${label}: 인피`);
  const lower = text.toLowerCase();
  assert.ok(!lower.includes('infi-mall'), `${label}: infi-mall`);
  assert.ok(!/\bINFI\b/i.test(text), `${label}: INFI word`);
  assert.ok(!lower.includes('choisk'), `${label}: choisk`);
  assert.ok(!lower.includes('c:\\users'), `${label}: C:\\Users`);
  assert.ok(!lower.includes('c:\\\\users'), `${label}: C:\\\\Users`);
  assert.ok(!lower.includes('c:/users'), `${label}: C:/Users`);
}

function assertNoFingerprints(text, label) {
  for (const fp of FINGERPRINTS) {
    assert.ok(!text.includes(fp), `${label}: fingerprint ${fp}`);
  }
}

test('sample commands.json workdir 는 빈 문자열', () => {
  const commands = JSON.parse(readUtf8(commandsPath));
  assert.strictEqual(commands.workdir, '');
});

test('sample-data 와 픽스처에 식별자가 없다', () => {
  const fixtureText = readUtf8(fixturePath);
  assertNoLiveIds(fixtureText, 'fixture');
  assert.ok(!fixtureText.includes('@'), 'fixture: @');
  for (const file of listFiles(sampleRoot)) {
    const text = readUtf8(file);
    const rel = path.relative(sampleRoot, file);
    assertNoLiveIds(text, rel);
    if (path.basename(file) === 'commands.json') {
      assert.ok(!text.includes('@'), `${rel}: @`);
    }
  }
});

test('sample-data 와 픽스처에 실측 지문이 없다', () => {
  assertNoFingerprints(readUtf8(fixturePath), 'fixture');
  for (const file of listFiles(sampleRoot)) {
    assertNoFingerprints(readUtf8(file), path.relative(sampleRoot, file));
  }
});

test('픽스처 첫 문단에만 금지 스킬 이름이 있다', () => {
  const fixture = readUtf8(fixturePath);
  const splitAt = fixture.indexOf('\n\n');
  assert.ok(splitAt > 0);
  const first = fixture.slice(0, splitAt);
  const rest = fixture.slice(splitAt + 2);
  assert.ok(first.includes('호출하지 마'));
  for (const name of FORBIDDEN_SKILLS) {
    assert.ok(first.includes(name), `first paragraph missing ${name}`);
    assert.ok(!rest.includes(name), `rest still has ${name}`);
  }
  assertNoLiveIds(fixture, 'fixture-body');
  assertNoFingerprints(fixture, 'fixture-body');
});

test('sample nondev-api-brief.body 는 픽스처 바이트와 같다', () => {
  const fixture = readUtf8(fixturePath);
  const commands = JSON.parse(readUtf8(commandsPath));
  const item = catalogItem(commands, 'nondev-api-brief');
  assert.ok(item);
  assert.ok(item.when && !/diagram-design|pptx/i.test(item.when));
  assert.strictEqual(item.role, 'action');
  assert.strictEqual(item.skill, null);
  assert.strictEqual(item.kind, 'prompt');
  assert.strictEqual(item.tool, 'Grok');
  assert.strictEqual(item.title, '비개발자용 API 설명 자료');
  assert.strictEqual(item.body, fixture);
});

test('합성 3스킬: adopt 는 default, hold 는 lab, drop 은 hidden', () => {
  const board = labdata.scoreboard(sampleRoot);
  const commands = labdata.wikiCommands(sampleRoot);
  const guide = guideView(commands, board.rows);
  const bySkill = Object.fromEntries(board.rows.map((r) => [r.skill, r]));

  const adoptRow = bySkill['example-adopt'];
  assert.ok(adoptRow);
  assert.strictEqual(adoptRow.n, 2);
  assert.strictEqual(adoptRow.label, '써야 함');
  assert.strictEqual(adoptRow.a.nonCache, 1000);
  assert.strictEqual(adoptRow.b.nonCache, 700);
  assert.ok(!('tokens' in (adoptRow.a || {})));
  assert.ok(!('tokens' in (adoptRow.b || {})));
  assert.strictEqual(adoptRow.source, 'sample');

  const holdRow = bySkill['example-hold'];
  assert.ok(holdRow);
  assert.strictEqual(holdRow.label, '보류');
  assert.strictEqual(holdRow.n, 1);

  const dropRow = bySkill['example-drop'];
  assert.ok(dropRow);
  assert.strictEqual(dropRow.label, '빼기');
  assert.strictEqual(dropRow.n, 1);
  assert.strictEqual(dropRow.b.nonCache, 1600);

  const adopt = findItem(guide, 'example-adopt');
  assert.ok(adopt);
  assert.strictEqual(adopt.item.surface, 'default');
  assert.strictEqual(adopt.item.verdictLabel, '써야 함');
  assert.notStrictEqual(adopt.section.id, 'lab-record');

  const hold = findItem(guide, 'example-hold');
  assert.ok(hold);
  assert.strictEqual(hold.item.surface, 'lab');
  assert.strictEqual(hold.section.id, 'lab-record');

  assert.strictEqual(findItem(guide, 'example-drop'), null);
  assert.ok(board.rows.some((r) => r.skill === 'example-drop'));

  const impl = findItem(guide, 'implement');
  assert.ok(impl);
  assert.strictEqual(impl.item.surface, 'default');

  const brief = findItem(guide, 'nondev-api-brief');
  assert.ok(brief);
  assert.strictEqual(brief.item.surface, 'default');

  const diagram = findItem(guide, 'diagram');
  assert.ok(diagram);
  assert.strictEqual(diagram.item.surface, 'lab');
  assert.strictEqual(diagram.section.id, 'lab-record');

  assert.deepStrictEqual(guide.counts, { default: 3, lab: 2, hidden: 1, reference: 0 });
});

test('합성 jsonl 은 nonCache 만 쓰고 tokens·경로가 없다', () => {
  const raw = readUtf8(jsonlPath).trim().split(/\n/);
  assert.strictEqual(raw.length, 4);
  const rows = raw.map((line) => JSON.parse(line));
  assert.strictEqual(rows[0].skill, 'example-adopt');
  assert.strictEqual(rows[0].b.nonCache, 1000);
  assert.strictEqual(rows[1].skill, 'example-adopt');
  assert.strictEqual(rows[1].b.nonCache, 700);
  assert.strictEqual(rows[0].date, rows[1].date);
  for (const row of rows) {
    assert.strictEqual(row.source, 'sample');
    assert.strictEqual(row.task, 'sample-task');
    assert.ok(!('tokens' in row));
    assert.ok(!('card' in row));
    assert.deepStrictEqual(Object.keys(row.a).sort(), ['activeSec', 'nonCache', 'quality']);
    assert.deepStrictEqual(Object.keys(row.b).sort(), ['activeSec', 'nonCache', 'quality']);
  }
});
