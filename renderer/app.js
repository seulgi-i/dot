// 렌더러: 데이터가 바뀐 경우에만 DOM을 바꿔서 깜빡임을 없앤다. 자동 갱신 없음.
const state = { view: 'today', lastKey: '' };
const $ = (id) => document.getElementById(id);

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), 1400);
}

const chipClass = { '써야 함': 'good', '보류': 'hold', '빼기': 'bad', '미실험': 'none' };
const fmtTok = (n) => (n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
const fmtSec = (s) => (s == null ? '–' : s >= 60 ? Math.floor(s / 60) + '분 ' + (s % 60) + '초' : s + '초');
const fmtQ = (q) => (q == null ? '–' : Number(q).toFixed(1));
function pct(p) {
  if (p == null) return el('span', { class: 'sub', text: '' });
  return el('span', { class: p < 0 ? 'down' : p > 0 ? 'up' : '', text: (p > 0 ? '+' : '') + p + '%' });
}
function pair(a, b, fmt) { return `${fmt(a)} → ${fmt(b)}`; }

function acc(summaryKids, bodyKids) {
  return el('details', { class: 'acc' },
    el('summary', {}, summaryKids),
    el('div', { class: 'acc-body' }, bodyKids));
}

function renderPrompts(list) {
  if (!list.length) return el('div', { class: 'empty', text: '아직 추천 프롬프트가 없어. 실험 결과가 쌓이면 여기 생겨.' });
  return el('div', { class: 'acc-list' }, list.map((p) => acc(
    [el('span', { class: 'acc-title', text: p.title || p.id || '' }), p.skill ? el('span', { class: 'chip tag', text: p.skill }) : null],
    [
      p.when ? el('div', { class: 'when', text: p.when }) : null,
      p.body ? el('pre', { text: p.body }) : null,
      p.evidence ? el('div', { class: 'evidence', text: p.evidence }) : null,
      el('div', { class: 'row' }, copyBtn(p.body || '', '복사')),
    ]
  )));
}

function renderSkills(board) {
  const legend = el('p', { class: 'legend', text: '판정: 품질이 A와 같거나 낫고(−0.3 이내, 테스트 통과, 반려 안 늘어남) 비캐시 토큰이나 활성 시간이 20% 넘게 줄면 써야 함 · 품질 +1이면서 토큰 +30% 이내도 써야 함 · 품질 −0.5 이하이거나 토큰 +50%에 이득 없으면 빼기 · 나머지 보류. A 세션이 스킬을 썼으면 오염으로 보류. n=1은 참고용.' });
  const head = el('tr', {}, ['스킬', '분류', '판정', '토큰(비캐시) A→B', '활성시간 A→B', '루브릭 A→B', '반려 A→B', '테스트', 'n', '날짜', '오염체크', '카드'].map((h) => el('th', { text: h })));
  const rows = board.rows.map((r) => {
    const a = r.a || {}; const b = r.b || {};
    const tests = r.b ? (b.testsPass == null ? '해당 없음' : `${a.testsPass ? '✓' : a.testsPass === false ? '✗' : '–'} → ${b.testsPass ? '✓' : '✗'}`) : '–';
    const contam = r.n === 0 ? '–' : r.contaminated ? '오염' : 'OK';
    return el('tr', {},
      el('td', {}, el('div', { text: r.skill }), r.removed ? el('span', { class: 'chip none', text: '제거됨' }) : null, r.source ? el('div', { class: 'sub', text: r.source }) : null),
      el('td', { text: r.category || '–' }),
      el('td', {}, el('span', { class: 'chip ' + (chipClass[r.label] || 'none'), text: r.label }), r.n ? el('div', { class: 'sub', text: r.reasons[0] || '' }) : null),
      el('td', { class: 'num' }, r.n ? pair(a.nonCache, b.nonCache, fmtTok) + ' ' : '–', r.n ? pct(r.tokenPct) : null),
      el('td', { class: 'num' }, r.n ? pair(a.activeSec, b.activeSec, fmtSec) + ' ' : '–', r.n ? pct(r.timePct) : null),
      el('td', { class: 'num', text: r.n ? pair(a.quality, b.quality, fmtQ) : '–' }),
      el('td', { class: 'num', text: r.n ? pair(a.rejects, b.rejects, (x) => (x == null ? '–' : String(x))) : '–' }),
      el('td', { class: 'num', text: tests }),
      el('td', { class: 'num', text: String(r.n) }),
      el('td', { class: 'num', text: r.date || '–' }),
      el('td', { text: contam }),
      el('td', {}, r.card && r.cardExists ? el('a', { class: 'link', text: '열기', onclick: () => window.dot.openCard(r.card) }) : el('span', { class: 'sub', text: '–' })));
  });
  return el('div', {}, legend, el('table', {}, el('thead', {}, head), el('tbody', {}, rows)));
}


function copyBtn(text, label) {
  return el('button', { class: 'btn', text: label || '복사', onclick: async () => { await window.dot.copy(text || ''); toast('복사했어'); } });
}

function commandBlock(cmd, workdir) {
  const full = workdir ? ('cd ' + workdir + '\n' + cmd) : cmd;
  return el('div', { class: 'cmd-block' },
    el('pre', { text: cmd }),
    el('div', { class: 'row' },
      copyBtn(cmd, '복사'),
      workdir ? copyBtn(full, 'cd + 명령 복사') : null));
}

function tagClass(tag) {
  const s = String(tag || '');
  if (s.startsWith('추천')) return 'good';
  if (s.startsWith('빼기')) return 'bad';
  if (s.includes('미실험')) return 'none';
  if (s.startsWith('보류')) return 'hold';
  return 'tag';
}

function renderItemCard(item, workdir) {
  const cmds = Array.isArray(item.commands) ? item.commands : (item.command ? [item.command] : []);
  const useDir = item.useWorkdir && workdir;
  return acc(
    [
      el('span', { class: 'acc-title', text: item.title || item.id || '' }),
      item.tag ? el('span', { class: 'chip ' + tagClass(item.tag), text: item.tag }) : null,
      item.tool ? el('span', { class: 'chip tool', text: item.tool }) : null,
    ],
    [
      item.when ? el('div', { class: 'when', text: item.when }) : null,
      cmds.map((c) => commandBlock(String(c), useDir ? workdir : '')),
      item.body ? el('pre', { text: item.body }) : null,
      item.body ? el('div', { class: 'row' }, copyBtn(item.body, '프롬프트 복사')) : null,
    ]
  );
}

const QUICK = [
  { title: '세션 정리', rows: [
    { tool: 'Claude', cmd: '/clear', note: '대화만 비움' },
    { tool: 'Grok', cmd: '/new', note: '별칭 /clear' },
    { tool: 'Codex', cmd: '/new', note: '새 대화' },
  ]},
  { title: '컨텍스트 정리', rows: [
    { tool: '공통', cmd: '/compact', note: '요약하고 이어가기' },
    { tool: 'Claude · Grok', cmd: '/context', note: '창을 채운 것' },
  ]},
  { title: '시각화', rows: [
    { tool: 'Claude', cmd: '/diagram-design', note: '아키텍처·시퀀스·ER' },
  ]},
];

function renderQuick() {
  return el('aside', { class: 'quick-pop' },
    el('div', { class: 'quick-head', text: '바로 쓰기' }),
    QUICK.map((g) => el('div', { class: 'quick-group' },
      el('div', { class: 'quick-title', text: g.title }),
      g.rows.map((r) => el('button', {
        class: 'quick-row',
        type: 'button',
        onclick: async () => { await window.dot.copy(r.cmd); toast('복사했어'); },
      },
        el('span', { class: 'quick-cmd', text: r.cmd }),
        el('span', { class: 'quick-meta', text: r.tool }),
        el('span', { class: 'quick-note', text: r.note }))))));
}

function renderWiki(data) {
  const d = data || {};
  const workdir = d.workdir || '';
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const situations = Array.isArray(d.situations) ? d.situations : [];
  const prompts = Array.isArray(d.agentPrompts) ? d.agentPrompts : [];
  const topics = Array.isArray(d.exampleQuestions) ? d.exampleQuestions : [];
  const parts = [];
  if (d.intro) parts.push(el('p', { class: 'legend', text: d.intro }));
  if (workdir) {
    const cd = 'cd ' + workdir;
    parts.push(el('div', { class: 'card workdir-card' },
      el('h3', { text: '작업 폴더 (위키 명령)' }),
      el('pre', { text: cd }),
      el('div', { class: 'row' }, copyBtn(cd, '복사'))));
  }
  for (const sec of sections) {
    const secBody = [];
    if (sec.intro) secBody.push(el('p', { class: 'legend', text: sec.intro }));
    const groups = [];
    if (Array.isArray(sec.items) && sec.items.length) groups.push({ title: '', items: sec.items });
    if (Array.isArray(sec.groups)) {
      for (const g of sec.groups) groups.push(g);
    }
    for (const g of groups) {
      const gItems = Array.isArray(g.items) ? g.items : [];
      if (!gItems.length) continue;
      if (g.title) secBody.push(el('h3', { class: 'group-title', text: g.title }));
      secBody.push(el('div', { class: 'acc-list' }, gItems.map((item) => renderItemCard(item, workdir))));
    }
    const qgroups = Array.isArray(sec.questions) ? sec.questions : [];
    if (qgroups.length) {
      secBody.push(el('div', { class: 'acc-list' }, qgroups.map((t) => {
        const qs = Array.isArray(t.items) ? t.items : (Array.isArray(t.questions) ? t.questions : []);
        const bin = t.command || 'node bin/wiki.js query';
        return acc(
          [el('span', { class: 'acc-title', text: t.label || t.topic || '' }), t.topic ? el('span', { class: 'chip tag', text: t.topic }) : null],
          [el('div', { class: 'q-list' }, qs.map((q) => {
            const cmd = bin + ' "' + q + '"';
            const full = workdir ? ('cd ' + workdir + '\n' + cmd) : cmd;
            return el('div', { class: 'q-row' },
              el('div', { class: 'q-text', text: q }),
              el('div', { class: 'row' },
                copyBtn(cmd, '명령 복사'),
                workdir ? copyBtn(full, 'cd + 명령 복사') : null));
          }))]);
      })));
    }
    const n = groups.reduce((s, g) => s + ((g.items && g.items.length) || 0), 0) + qgroups.length;
    parts.push(acc(
      [el('span', { class: 'acc-title', text: sec.title || sec.id || '' }), el('span', { class: 'sub', text: n ? String(n) : '' })],
      secBody
    ));
  }

  if (!sections.length) {
    if (situations.length) {
      parts.push(el('h2', { class: 'section-title', text: '상황별 명령어' }));
      parts.push(el('div', { class: 'cards' }, situations.map((s) => {
        const cmds = Array.isArray(s.commands) ? s.commands : (s.command ? [s.command] : []);
        return el('div', { class: 'card' },
          el('h3', { text: s.title || s.id || '' }),
          s.note ? el('div', { class: 'when', text: s.note }) : null,
          cmds.map((c) => commandBlock(String(c), workdir)));
      })));
    }
    if (prompts.length) {
      parts.push(el('h2', { class: 'section-title', text: '오르카 에이전트 탭에서 물어볼 프롬프트' }));
      parts.push(el('div', { class: 'cards' }, prompts.map((pr) => el('div', { class: 'card' },
        el('h3', { text: pr.title || pr.id || '' }),
        pr.note ? el('div', { class: 'when', text: pr.note }) : null,
        el('pre', { text: pr.body || '' }),
        el('div', { class: 'row' }, copyBtn(pr.body || '', '복사'))))));
    }
    if (topics.length) {
      parts.push(el('h2', { class: 'section-title', text: '주제별 예시 질문' }));
      parts.push(el('div', { class: 'cards' }, topics.map((t) => {
        const qs = Array.isArray(t.questions) ? t.questions : [];
        return el('div', { class: 'card' },
          el('div', { class: 'row' }, el('h3', { text: t.label || t.topic || '' }), t.topic ? el('span', { class: 'chip tag', text: t.topic }) : null),
          el('div', { class: 'q-list' }, qs.map((q) => {
            const cmd = 'node bin/wiki.js query "' + q + '"';
            const full = workdir ? ('cd ' + workdir + '\n' + cmd) : cmd;
            return el('div', { class: 'q-row' },
              el('div', { class: 'q-text', text: q }),
              el('div', { class: 'row' }, copyBtn(cmd, '명령 복사'), workdir ? copyBtn(full, 'cd + 명령 복사') : null));
          })));
      })));
    }
  }
  if (!parts.length) parts.push(el('div', { class: 'empty', text: '접어 둔 목록이 없어. 오른쪽에서 바로 복사하면 된다.' }));
  return el('div', { class: 'guide-layout' },
    el('div', { class: 'guide-main' }, parts),
    renderQuick());
}


const todayChip = { '지금 할 일': 'good', '실험 대기': 'hold', '사이드': 'side', '버림': 'bad' };

function renderToday(data) {
  const cards = (data && Array.isArray(data.cards)) ? data.cards : [];
  if (!cards.length) return el('div', { class: 'empty', text: '오늘 카드 없음' });
  const head = data.date ? el('p', { class: 'legend', text: data.date + ' 적용 카드' }) : null;
  return el('div', {}, head, el('div', { class: 'cards' }, cards.map((c) => {
    const fields = [
      ['붙일 곳', c.attach],
      ['효용', c.value],
      ['데이터 주의', c.dataNote],
      ['스펙 문장', c.spec],
    ];
    const pre = c.prompt ? el('pre', { text: c.prompt }) : null;
    return el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('h3', { text: c.title || '' }),
        el('span', { class: 'chip ' + (todayChip[c.verdict] || 'none'), text: c.verdict || '미정' })),
      el('div', { class: 'apply-fields' }, fields.map(([k, v]) =>
        el('div', { class: 'apply-field' },
          el('div', { class: 'k', text: k }),
          el('div', { class: 'v' + (v ? '' : ' empty'), text: v || '—' })))),
      c.prompt ? acc(
        [el('span', { class: 'acc-title', text: '프롬프트' })],
        [pre, el('div', { class: 'row' }, copyBtn(c.prompt, '프롬프트 복사'))]
      ) : null);
  })));
}

async function refresh() {
  const btn = $('refresh'); btn.disabled = true;
  try {
    const data = await window.dot.load();
    const key = JSON.stringify([data.board, data.prompts, data.wikiCommands, data.applyToday]);
    $('headline').innerHTML = '';
    const todayN = (data.applyToday && Array.isArray(data.applyToday.cards)) ? data.applyToday.cards.length : 0;
    $('headline').append('이번 주 써야 함 ', el('b', { text: String(data.board.mustUseThisWeek) + '개' }), el('span', { class: 'sub', text: `  · 오늘 카드 ${todayN}개 · 스킬 ${data.board.rows.length}개 · 프롬프트 ${data.prompts.length}개 · 명령 ${((data.wikiCommands && (data.wikiCommands.sections || []).reduce((n, sec) => n + ((sec.items || []).length) + ((sec.groups || []).reduce((m, g) => m + ((g.items || []).length), 0)), 0)) || ((data.wikiCommands && (data.wikiCommands.situations || []).length) || 0))}개` }));
    if (key !== state.lastKey) {
      state.lastKey = key;
      const y = window.scrollY;
      $('view-today').replaceChildren(renderToday(data.applyToday));
      $('view-prompts').replaceChildren(renderPrompts(data.prompts));
      $('view-skills').replaceChildren(renderSkills(data.board));
      $('view-wiki').replaceChildren(renderWiki(data.wikiCommands));
      window.scrollTo(0, y);
    }
  } catch (e) {
    $('headline').textContent = '불러오기 실패: ' + (e && e.message ? e.message : e);
  } finally { btn.disabled = false; }
}

function show(view) {
  state.view = view;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.view === view);
  $('view-today').classList.toggle('hidden', view !== 'today');
  $('view-prompts').classList.toggle('hidden', view !== 'prompts');
  $('view-skills').classList.toggle('hidden', view !== 'skills');
  $('view-wiki').classList.toggle('hidden', view !== 'wiki');
}

for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => show(t.dataset.view));
$('refresh').addEventListener('click', refresh);
const minBtn = $('win-min');
const closeBtn = $('win-close');
if (minBtn) minBtn.addEventListener('click', () => window.dot.minimize());
if (closeBtn) closeBtn.addEventListener('click', () => window.dot.close());
refresh();
