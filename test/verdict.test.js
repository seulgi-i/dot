// 판정 규칙 테스트 (lab 숨김 테스트와 같은 내용)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const target = path.join(__dirname, '..', 'lib', 'verdict.js');
const { verdict, pctChange } = require(path.resolve(target));
const A = { quality: 4, tokens: 1000, activeSec: 100, rejects: 1, testsPass: true };
const B = (o) => Object.assign({ quality: 4, tokens: 1000, activeSec: 100, rejects: 1, testsPass: true }, o);
test('pctChange 기본·반올림', () => {
  assert.strictEqual(pctChange(100, 80), -20);
  assert.strictEqual(pctChange(3, 4), 33.3);
  assert.strictEqual(pctChange(3, 2), -33.3);
});
test('pctChange null 처리', () => {
  assert.strictEqual(pctChange(0, 5), null);
  assert.strictEqual(pctChange(-1, 5), null);
  assert.strictEqual(pctChange(null, 5), null);
  assert.strictEqual(pctChange(5, undefined), null);
  assert.strictEqual(pctChange(NaN, 5), null);
});
test('미실험', () => {
  assert.strictEqual(verdict(A, null).label, '미실험');
  assert.strictEqual(verdict(null, B({})).label, '미실험');
  assert.strictEqual(verdict(A, B({ quality: null })).label, '미실험');
});
test('오염이면 보류', () => {
  assert.strictEqual(verdict(A, B({ tokens: 100 }), { contaminated: true }).label, '보류');
});
test('토큰 -20% 경계 → 써야 함', () => {
  assert.strictEqual(verdict(A, B({ tokens: 800 })).label, '써야 함');
  assert.strictEqual(verdict(A, B({ tokens: 801 })).label, '보류');
});
test('시간 -20%만으로도 써야 함', () => {
  assert.strictEqual(verdict(A, B({ activeSec: 80, tokens: null })).label, '써야 함');
});
test('품질 -0.3 경계', () => {
  assert.strictEqual(verdict(A, B({ quality: 3.7, tokens: 500 })).label, '써야 함');
  assert.strictEqual(verdict(A, B({ quality: 3.6, tokens: 500 })).label, '보류');
});
test('테스트 실패면 조건1 불가', () => {
  assert.strictEqual(verdict(A, B({ tokens: 500, testsPass: false })).label, '보류');
  assert.strictEqual(verdict(A, B({ tokens: 500, testsPass: null })).label, '보류');
  const a2 = Object.assign({}, A, { testsPass: null });
  assert.strictEqual(verdict(a2, B({ tokens: 500, testsPass: null })).label, '써야 함');
});
test('반려 증가면 조건1 불가', () => {
  assert.strictEqual(verdict(A, B({ tokens: 500, rejects: 2 })).label, '보류');
  assert.strictEqual(verdict(A, B({ tokens: 500, rejects: null })).label, '써야 함');
});
test('조건2: 품질 +1, 토큰 +30% 이내', () => {
  assert.strictEqual(verdict(A, B({ quality: 5, tokens: 1300 })).label, '써야 함');
  assert.strictEqual(verdict(A, B({ quality: 5, tokens: 1301 })).label, '보류');
  assert.strictEqual(verdict(A, B({ quality: 5, tokens: null })).label, '보류');
});
test('빼기', () => {
  assert.strictEqual(verdict(A, B({ quality: 3.5 })).label, '빼기');
  assert.strictEqual(verdict(A, B({ tokens: 1500, quality: 4.2 })).label, '빼기');
  assert.strictEqual(verdict(A, B({ tokens: 1500, quality: 4.3 })).label, '보류');
});
test('반환 필드', () => {
  const r = verdict(A, B({ quality: 4.333, tokens: 900, activeSec: 50 }));
  assert.strictEqual(r.tokenPct, -10);
  assert.strictEqual(r.timePct, -50);
  assert.strictEqual(r.qualityDelta, 0.33);
  assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 1);
});
test('입력 불변', () => {
  const a = Object.freeze(Object.assign({}, A)); const b = Object.freeze(B({ tokens: 500 }));
  assert.doesNotThrow(() => verdict(a, b));
});
