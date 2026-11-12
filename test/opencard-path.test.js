const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const target = path.join(__dirname, '..', 'lib', 'opencard-path.js');
const { isInsideDevlog } = require(path.resolve(target));

const root = path.resolve(path.join('C:', 'data', 'devlog'));

test('루트 자체는 허용', () => {
  assert.strictEqual(isInsideDevlog(root, root), true);
});

test('루트 아래 파일은 허용', () => {
  const full = path.join(root, 'wiki', 'page.md');
  assert.strictEqual(isInsideDevlog(root, full), true);
});

test('문자열 접두어만 같은 형제는 거부', () => {
  const full = path.join(path.resolve(path.join('C:', 'data', 'devlog-evil')), 'file');
  assert.strictEqual(isInsideDevlog(root, full), false);
});

test('.. 로 루트 밖이면 거부', () => {
  const full = path.resolve(root, '..', 'other', 'file');
  assert.strictEqual(isInsideDevlog(root, full), false);
});

test('빈 rel은 루트와 같아 허용', () => {
  const full = path.resolve(root, '');
  assert.strictEqual(full, path.resolve(root));
  assert.strictEqual(isInsideDevlog(root, full), true);
});
