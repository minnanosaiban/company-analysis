// 入口。データを読み込み、ハッシュに応じてページを描画する。
import { loadData } from './lib/data.js';
import { parseHash, buildHash, patched } from './lib/router.js';

// ページを移っても引き継ぐパラメータ（対象の会社の選び方、埋め込み表示）
const SHARED = ['m', 'ind', 'co', 'embed'];

// 作ったページだけを並べる。図のページは、作り次第ここに足す。
const PAGES = [
  { path: '',      title: '企業を探す',   load: () => import('./pages/screen.js') },
  { path: 'about', title: 'データと注意', load: () => import('./pages/about.js') },
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
    // 別ページへのリンク（対象の会社の選び方を引き継ぎ、patch で上書き）
    link(path, patch = {}) {
      return buildHash(path, patched(sharedOf(ctx.params), patch));
    },
  };
  return ctx;
}

async function render() {
  const { path, params } = parseHash();
  const page = PAGES.find((p) => p.path === path) || PAGES[0];
  document.body.classList.toggle('embed', params.get('embed') === '1');
  document.title = `${page.title} ― 企業分析`;
  renderNav(page, params);
  const keepScroll = lastPath === page.path;
  const y = window.scrollY;
  try {
    const mod = await page.load();
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
