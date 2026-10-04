// 図のページで共通の小さな部品（強調表示する会社の選択、スクリーニング条件の表示）。
import { esc, splitCsv } from './fields.js';
import { hasActiveFilters } from './filters.js';
import { searchCompanies } from './selection.js';

/**
 * 会社を検索して、複数選べる欄（URL の param に EDINET コードをカンマ区切りで保存）。
 * pool: 選べる会社の配列（省略時は全社）
 */
export function renderPicker(el, ctx, { param = 'hl', label = '強調表示する会社', pool = null, max = null, fallback = [], noneText = 'なし' } = {}) {
  const { data } = ctx;
  // param が空のときは fallback（既定の会社）を、選ばれているものとして扱う
  const fromUrl = splitCsv(ctx.params.get(param));
  const chosen = fromUrl.length ? fromUrl : fallback;
  const poolSet = pool ? new Set(pool.map((c) => c.e)) : null;
  const chips = chosen.map((e) => data.byE.get(e)).filter(Boolean).map((c) =>
    `<span class="chip">${esc(c.n)}<button type="button" data-rm="${esc(c.e)}" aria-label="${esc(c.n)}を外す">×</button></span>`).join('');
  el.innerHTML = `
    <label for="pk-${param}">${esc(label)}</label>
    <input id="pk-${param}" type="search" placeholder="会社名・証券コードで検索" autocomplete="off" style="width:min(22rem,100%)">
    <ul class="suggest" hidden></ul>
    <div class="chips">${chips || `<span class="muted small">${esc(noneText)}</span>`}</div>`;
  const input = el.querySelector('input');
  const box = el.querySelector('.suggest');
  const set = (list) => ctx.update({ [param]: list.join(',') });
  const full = max !== null && chosen.length >= max;
  if (full) { input.disabled = true; input.placeholder = `最大${max}社まで（外してから追加）`; }
  input.addEventListener('input', () => {
    const hits = searchCompanies(data, input.value, 30).filter((c) => !chosen.includes(c.e) && (!poolSet || poolSet.has(c.e))).slice(0, 10);
    box.innerHTML = hits.map((c) => `<li><button type="button" data-add="${esc(c.e)}">${esc(c.n)}<span class="muted small">　${esc(c.s)}・${esc(c.i)}</span></button></li>`).join('');
    box.hidden = hits.length === 0;
    box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => set([...chosen, b.dataset.add])));
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const f = box.querySelector('[data-add]'); if (f) { ev.preventDefault(); f.click(); } }
  });
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => set(chosen.filter((e) => e !== b.dataset.rm))));
}

/** 「企業を探す」の条件が付いているとき、そのことを示す帯を出す（外す・直すリンク付き）。 */
export function renderFilterBanner(el, ctx, shown, total) {
  if (!hasActiveFilters(ctx.params)) { el.innerHTML = ''; return; }
  el.innerHTML = `<p class="banner">「企業を探す」の条件で絞り込み中：<b>${shown.toLocaleString()}社</b>（対象 ${total.toLocaleString()}社中）
    <a href="${ctx.link('', {}, { withFilters: true })}">条件を直す</a>
    <button class="btn link" type="button" data-clear>条件を外す</button></p>`;
  el.querySelector('[data-clear]').addEventListener('click', () => ctx.clearFilters());
}

/** セレクト（<select>）の選択肢 HTML。options: [[value, label], ...] */
export function optionsHtml(options, current) {
  return options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(current) ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
