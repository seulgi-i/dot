'use strict';
// 스킬 A/B 판정. 명세: .devlog/skills/lab/scaffold/lab-verdict-impl/SPEC.md
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function pctChange(before, after) {
  if (!isNum(before) || !isNum(after) || before <= 0) return null;
  return Math.round(((after - before) / before) * 100 * 10) / 10;
}

function verdict(a, b, opts = {}) {
  const out = { label: '보류', reasons: [], tokenPct: null, timePct: null, qualityDelta: null };
  if (!a || !b || !isNum(a.quality) || !isNum(b.quality)) {
    out.label = '미실험';
    out.reasons.push('A/B 결과나 품질 점수가 없음');
    if (a && b) { out.tokenPct = pctChange(a.tokens, b.tokens); out.timePct = pctChange(a.activeSec, b.activeSec); }
    return out;
  }
  out.tokenPct = pctChange(a.tokens, b.tokens);
  out.timePct = pctChange(a.activeSec, b.activeSec);
  out.qualityDelta = Math.round((b.quality - a.quality) * 100) / 100;
  const q = out.qualityDelta;
  if (opts && opts.contaminated === true) {
    out.label = '보류';
    out.reasons.push('A 세션에서 스킬 사용 흔적이 있어 비교 무효');
    return out;
  }
  let testsOk = b.testsPass !== false;
  if (a.testsPass === true && b.testsPass !== true) testsOk = false;
  const rejectsOk = isNum(a.rejects) && isNum(b.rejects) ? b.rejects <= a.rejects : true;
  const cheaper = (out.tokenPct !== null && out.tokenPct <= -20) || (out.timePct !== null && out.timePct <= -20);
  if (q >= -0.3 && testsOk && rejectsOk && cheaper) {
    out.label = '써야 함';
    out.reasons.push('품질 유지(-0.3 이내)하면서 토큰 또는 시간이 20% 이상 줄어듦');
    return out;
  }
  if (q >= 1 && out.tokenPct !== null && out.tokenPct <= 30) {
    out.label = '써야 함';
    out.reasons.push('품질 +1 이상, 토큰 증가 30% 이내');
    return out;
  }
  if (q <= -0.5) {
    out.label = '빼기';
    out.reasons.push('품질이 0.5 이상 떨어짐');
    return out;
  }
  if (out.tokenPct !== null && out.tokenPct >= 50 && q < 0.3) {
    out.label = '빼기';
    out.reasons.push('토큰 50% 이상 늘었는데 품질 이득 없음');
    return out;
  }
  out.label = '보류';
  if (!testsOk) out.reasons.push('B 테스트가 통과하지 않음');
  if (!rejectsOk) out.reasons.push('B 반려가 더 많음');
  if (!cheaper) out.reasons.push('토큰·시간 20% 이상 절감 없음');
  if (!out.reasons.length) out.reasons.push('기준에 해당 없음');
  return out;
}

module.exports = { pctChange, verdict };
