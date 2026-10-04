// 入口。データを読み込み、ハッシュに応じてページを描画する。
import { loadData } from './lib/data.js?v=87b5bdf733';
import { parseHash, buildHash, patched } from './lib/router.js?v=87b5bdf733';
import { disposeAll } from './lib/charts.js?v=87b5bdf733';
import { RANGE_KEYS } from './lib/fields.js?v=87b5bdf733';
import { CF_SIGN_KEYS } from './lib/filters.js?v=87b5bdf733';

// ページを移っても引き継ぐパラメータ（対象の会社の選び方、埋め込み表示）
const SHARED = ['m', 'ind', 'co', 'embed'];
// 「企業を探す」の絞り込み条件（図のページへ「この結果を図で見る」ときに引き継ぐ）
const FILTER_PARAMS = ['std', 'cons', 'pat', 'p', ...RANGE_KEYS, ...CF_SIGN_KEYS.map((s) => s.param)];

const PAGES = [
  { path: '',          title: '企業を探す',             load: () => import('./pages/screen.js?v=87b5bdf733') },
  { path: 'trend',     title: '財務の推移',             load: () => import('./pages/trend.js?v=87b5bdf733') },
  { path: 'compare',   title: '会社を比べる',           load: () => import('./pages/compare.js?v=87b5bdf733') },
  { path: 'valuation', title: 'バリュエーション散布図', load: () => import('./pages/valuation.js?v=87b5bdf733') },
  { path: 'cashflow',  title: 'CFパターン',             load: () => import('./pages/cashflow.js?v=87b5bdf733') },
  { path: 'portfolio', title: '業界ポートフォリオ',     load: () => import('./pages/portfolio.js?v=87b5bdf733') },
  { path: 'segments',  title: 'セグメント推移',         load: () => import('./pages/segments.js?v=87b5bdf733') },
  { path: 'about',     title: 'データと注意',           load: () => import('./pages/about.js?v=87b5bdf733') },
];

let data = null;
let lastPath = null;
const app = document.getElementById('app');
const nav = document.getElementById('nav');

function sharedOf(params) {
  const p = new URLSearchParams();
  SHARED.forEach((k) => { if (params.get(k)) p.set(k, params.get(k)); });
  return p;
}

function renderNav(current, params) {
  const shared = sharedOf(params);
  nav.innerHTML = PAGES.map((p) =>
    `<a href="${buildHash(p.path, shared)}" ${p.path === current.path ? 'aria-current="page"' : ''}>${p.title}</a>`).join('');
  // 狭い画面ではナビが横スクロールになるので、いまのページが見える位置にそろえる
  const cur = nav.querySelector('[aria-current="page"]');
  if (cur) nav.scrollLeft += cur.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - cur.offsetWidth) / 2;
}

function makeCtx(params, page) {
  const ctx = {
    data, params, path: page.path,
    hasPage: (path) => PAGES.some((p) => p.path === path),
    // 同じページの条件を変える（履歴を増やさない）
    update(patch) {
      history.replaceState(null, '', buildHash(page.path, patched(ctx.params, patch)));
      render();
    },
    // 別ページへのリンク（対象の会社の選び方を引き継ぎ、patch で上書き）。withFilters: 絞り込み条件も引き継ぐ
    link(path, patch = {}, { withFilters = false } = {}) {
      const base = sharedOf(ctx.params);
      if (withFilters) FILTER_PARAMS.forEach((k) => { if (ctx.params.get(k)) base.set(k, ctx.params.get(k)); });
      return buildHash(path, patched(base, patch));
    },
    // 絞り込み条件を外す（対象の会社の選び方は残す）
    clearFilters() {
      const patch = {};
      FILTER_PARAMS.forEach((k) => { patch[k] = ''; });
      ctx.update(patch);
    },
  };
  return ctx;
}

async function render() {
  const { path, params } = parseHash();
  const page = PAGES.find((p) => p.path === path) || PAGES[0];
  document.body.classList.toggle('embed', params.get('embed') === '1');
  document.title = `${page.title} ― 有報ナビ`;
  renderNav(page, params);
  const keepScroll = lastPath === page.path;
  const y = window.scrollY;
  try {
    const mod = await page.load();
    disposeAll();           // 前のページの図を片付ける
    app.replaceChildren();
    await mod.render(app, makeCtx(params, page));
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="error">ページを表示できませんでした：${String(e.message || e)}</p>`;
  }
  window.scrollTo(0, keepScroll ? y : 0);
  lastPath = page.path;
}

async function main() {
  try {
    data = await loadData('data/');
  } catch (e) {
    app.innerHTML = `<p class="error">データを読み込めませんでした：${String(e.message || e)}</p>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

main();
