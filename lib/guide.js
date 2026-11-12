'use strict';
// 가이드 항목을 default / lab / hidden / reference 로 나눈다. 원본 commands 는 바꾸지 않는다.
const SESSION = new Set(['/clear', '/new', '/compact', '/context']);

function inferRole(item) {
  if (typeof item.role === 'string' && item.role) return item.role;
  if (typeof item.skill === 'string' && item.skill) return 'record';
  const tag = typeof item.tag === 'string' ? item.tag : '';
  if (tag.startsWith('보류') || tag.startsWith('빼기')) return 'record';
  if (Array.isArray(item.commands) && item.commands.length === 1 && SESSION.has(item.commands[0])) return 'session';
  if (tag.startsWith('추천')) return 'reference';
  if (item.kind === 'prompt' || item.kind === 'both' || item.kind === 'command') return 'action';
  return 'reference';
}

function skillKeyOf(item, role, rowSkills) {
  if (typeof item.skill === 'string' && item.skill) return item.skill;
  if (item.skill === null) return null;
  if (!('skill' in item) && role === 'record' && item.title && rowSkills.has(item.title)) return item.title;
  return null;
}

function indexRows(rows) {
  const bySkill = new Map();
  const skills = new Set();
  for (const r of rows || []) {
    if (!r || !r.skill) continue;
    skills.add(r.skill);
    const list = bySkill.get(r.skill) || [];
    list.push(r);
    bySkill.set(r.skill, list);
  }
  return { bySkill, skills };
}

function formatDetail(active) {
  return active.map((r) => {
    const parts = [];
    if (r.task) parts.push(r.task);
    if (r.label) parts.push(r.label);
    parts.push(`n=${r.n}`);
    return parts.join(' ');
  }).join(' ');
}

function decideSurface(role, key, bySkill) {
  const joined = key ? (bySkill.get(key) || []) : [];
  const n = joined.reduce((s, r) => s + (typeof r.n === 'number' ? r.n : 0), 0);
  const base = { skillKey: key, n };

  if (role === 'reference') return Object.assign({ surface: 'reference', verdictLabel: undefined, detail: '' }, base);
  if (role === 'session' && !key) return Object.assign({ surface: 'default', verdictLabel: undefined, detail: '' }, base);
  if (role === 'action' && !key) return Object.assign({ surface: 'default', verdictLabel: undefined, detail: '' }, base);

  if (!joined.length) {
    return Object.assign({ surface: 'lab', verdictLabel: '미실험', detail: '조인된 성적표 행 없음' }, base);
  }

  const active = joined.filter((r) => !r.removed);
  if (!active.length) {
    return Object.assign({ surface: 'hidden', verdictLabel: undefined, detail: 'removed' }, base);
  }

  const labels = active.map((r) => r.label);
  if (labels.every((l) => l === '빼기')) {
    return Object.assign({ surface: 'hidden', verdictLabel: '빼기', detail: formatDetail(active) }, base);
  }

  const allMust = labels.every((l) => l === '써야 함');
  const allN2 = active.every((r) => r.n >= 2);
  const clean = active.every((r) => r.contaminated !== true);
  if (allMust && allN2 && clean) {
    return Object.assign({ surface: 'default', verdictLabel: '써야 함', detail: formatDetail(active) }, base);
  }

  const unique = new Set(labels);
  const verdictLabel = unique.size === 1 ? labels[0] : '보류';
  return Object.assign({ surface: 'lab', verdictLabel, detail: formatDetail(active) }, base);
}

function annotate(item, ctx) {
  const role = inferRole(item);
  const key = skillKeyOf(item, role, ctx.skills);
  const decided = decideSurface(role, key, ctx.bySkill);
  item.surface = decided.surface;
  item.verdictLabel = decided.verdictLabel;
  item.detail = decided.detail;
  item.n = decided.n;
  item.skillKey = decided.skillKey;
  ctx.counts[decided.surface] += 1;
  return decided.surface;
}

function placeItem(item, surface, kept, labItems) {
  if (surface === 'lab') labItems.push(item);
  else if (surface !== 'hidden') kept.push(item);
}

function guideView(commands, rows) {
  const src = JSON.parse(JSON.stringify(commands || {}));
  const { bySkill, skills } = indexRows(rows);
  const counts = { default: 0, lab: 0, hidden: 0, reference: 0 };
  const ctx = { bySkill, skills, counts };
  const labItems = [];
  const sections = [];

  for (const sec of Array.isArray(src.sections) ? src.sections : []) {
    const keptItems = [];
    for (const item of Array.isArray(sec.items) ? sec.items : []) {
      placeItem(item, annotate(item, ctx), keptItems, labItems);
    }
    const keptGroups = [];
    for (const g of Array.isArray(sec.groups) ? sec.groups : []) {
      const gItems = [];
      for (const item of Array.isArray(g.items) ? g.items : []) {
        placeItem(item, annotate(item, ctx), gItems, labItems);
      }
      if (gItems.length) {
        const next = Object.assign({}, g, { items: gItems });
        keptGroups.push(next);
      }
    }
    const questions = Array.isArray(sec.questions) ? sec.questions : [];
    if (!keptItems.length && !keptGroups.length && !questions.length) continue;
    const next = Object.assign({}, sec);
    if (keptItems.length) next.items = keptItems;
    else delete next.items;
    if (keptGroups.length) next.groups = keptGroups;
    else delete next.groups;
    if (questions.length) next.questions = questions;
    else delete next.questions;
    sections.push(next);
  }

  if (labItems.length) {
    sections.push({ id: 'lab-record', title: '실험 기록', items: labItems });
  }

  return {
    workdir: src.workdir || '',
    intro: src.intro || '',
    sections,
    situations: src.situations || [],
    agentPrompts: src.agentPrompts || [],
    exampleQuestions: src.exampleQuestions || [],
    counts,
  };
}

module.exports = { guideView, SESSION };
