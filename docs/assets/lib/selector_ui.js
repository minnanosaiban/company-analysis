// 「対象の会社」の選択部品（全ページ共通）。選んだ内容は URL に入る。
import { esc } from './fields.js?v=9af2442f53';
import { MODES, selectedCompanies, searchCompanies } from './selection.js?v=9af2442f53';
import { splitCsv } from './fields.js?v=9af2442f53';

/**
 * el に選択欄を描き、選ばれた会社のリストを返す。
 * ctx: { data, params, update(patch) }
 */
export function renderSelector(el, ctx, { defaultMode = 'all', title = '対象の会社' } = {}) {
  const { data, params } = ctx;
  const sel = selectedCompanies(params, data, defaultMode);
  const mode = sel.mode;
  const indSet = new Set(splitCsv(params.get('ind')));
  const coList = splitCsv(params.get('co'));

  const counts = new Map();
  data.companies.forEach((c) => counts.set(c.i, (counts.get(c.i) || 0) + 1));

  let body = '';
  if (mode === 'ind') {
    body = `<div class="ind-grid">${data.industries.map((i) => `
      <label class="check"><input type="checkbox" data-ind="${esc(i)}" ${indSet.has(i) ? 'checked' : ''}>${esc(i)}<span class="muted small">（${counts.get(i)}）</span></label>`).join('')}
    </div>
    <p class="small"><button class="btn link" data-act="ind-clear" type="button">すべて解除</button></p>`;
  } else if (mode === 'co') {
    const chips = coList.map((e) => data.byE.get(e)).filter(Boolean).map((c) => `
      <span class="chip">${esc(c.n)}（${esc(c.s)}）<button type="button" data-rm="${esc(c.e)}" aria-label="${esc(c.n)}を外す">×</button></span>`).join('');
    body = `<div style="margin-top:.7rem">
      <label for="co-search">会社名・証券コードで検索</label>
      <input id="co-search" type="search" placeholder="例: 三菱 / 8058" autocomplete="off" style="width:min(28rem,100%)">
      <ul class="suggest" id="co-suggest" hidden></ul>
      <div class="chips">${chips || '<span class="muted small">まだ選んでいません</span>'}</div>
    </div>`;
  }

  const n = sel.list.length;
  const nc = sel.list.filter((c) => !c.c).length;
  el.innerHTML = `
    <section class="selector">
      <h3 class="bar-title">${esc(title)}</h3>
      <div class="modes" role="radiogroup" aria-label="選び方">
        ${MODES.map((m) => `<label class="check"><input type="radio" name="sel-mode" value="${m.id}" ${m.id === mode ? 'checked' : ''}>${esc(m.label)}</label>`).join('')}
      </div>
      ${body}
      <p class="selected-count">対象：${n.toLocaleString()}社${nc ? `（うち個別財務諸表のみ ${nc}社）` : ''}</p>
    </section>`;

  // 選び方の切り替え。切り替え先に初期値がなければ、使いやすい初期値を入れる
  el.querySelectorAll('input[name="sel-mode"]').forEach((r) => r.addEventListener('change', () => {
    const patch = { m: r.value };
    if (r.value === 'ind' && !params.get('ind')) patch.ind = '卸売業';
    if (r.value === 'co' && !params.get('co')) {
      patch.co = data.companies.filter((c) => c.gr).slice(0, 3).map((c) => c.e).join(',');
    }
    ctx.update(patch);
  }));

  el.querySelectorAll('input[data-ind]').forEach((cb) => cb.addEventListener('change', () => {
    const s = new Set(splitCsv(ctx.params.get('ind')));
    if (cb.checked) s.add(cb.dataset.ind); else s.delete(cb.dataset.ind);
    ctx.update({ ind: [...s].join(',') });
  }));
  const clear = el.querySelector('[data-act="ind-clear"]');
  if (clear) clear.addEventListener('click', () => ctx.update({ ind: '' }));

  const input = el.querySelector('#co-search');
  if (input) {
    const box = el.querySelector('#co-suggest');
    const add = (e) => {
      const s = splitCsv(ctx.params.get('co'));
      if (!s.includes(e)) s.push(e);
      ctx.update({ co: s.join(',') });
    };
    input.addEventListener('input', () => {
      const hits = searchCompanies(data, input.value).filter((c) => !coList.includes(c.e));
      box.innerHTML = hits.map((c) => `<li><button type="button" data-add="${esc(c.e)}">${esc(c.n)}<span class="muted small">　${esc(c.s)}・${esc(c.i)}</span></button></li>`).join('');
      box.hidden = hits.length === 0;
      box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => add(b.dataset.add)));
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const first = box.querySelector('[data-add]'); if (first) { ev.preventDefault(); first.click(); } }
    });
  }
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    ctx.update({ co: splitCsv(ctx.params.get('co')).filter((e) => e !== b.dataset.rm).join(',') });
  }));

  return sel;
}
