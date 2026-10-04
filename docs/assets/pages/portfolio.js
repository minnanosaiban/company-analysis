// 業界ポートフォリオ: 会社ごとの、事業セグメント別の利益を Treemap で一覧する。
import { esc } from '../lib/fields.js?v=58accaa9d1';
import { periodRows, loadSegments } from '../lib/data.js?v=58accaa9d1';
import { applyFilters } from '../lib/filters.js?v=58accaa9d1';
import { renderSelector } from '../lib/selector_ui.js?v=58accaa9d1';
import { renderFilterBanner, optionsHtml } from '../lib/ui_common.js?v=58accaa9d1';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js?v=58accaa9d1';
import { portfolioItem, METRIC_LABEL, SEGMENT_METRICS, PROFIT_PRIORITY, fmtAmount } from '../lib/chartdata.js?v=58accaa9d1';

const PAGE_SIZE = 12;
const PERIODS = ['最新期', '1期前', '2期前', '3期前', '4期前'];
const METRIC_OPTIONS = [['auto', '自動（利益優先フォールバック）'], ...SEGMENT_METRICS.filter((m) => m.key !== 'revenue').map((m) => [m.key, m.label])];

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const offset = Math.min(4, Math.max(0, parseInt(params.get('p') || '0', 10) || 0));
  const mt = METRIC_OPTIONS.some(([k]) => k === params.get('mt')) ? params.get('mt') : 'auto';
  const preferred = mt === 'auto' ? null : mt;

  root.innerHTML = `
    <h1 class="page-title">業界ポートフォリオ</h1>
    <p class="page-lead">会社ごとの、事業セグメント別の利益を Treemap で並べます。事業の構成を、会社どうしで見比べられます。</p>
    <div id="banner"></div>
    <div id="selector"></div>
    <details class="panel" open><summary>表示設定</summary><div class="panel-body" id="ctl"></div></details>
    <div id="head"></div>
    <div id="grid" class="chart-grid"><p class="loading">読み込み中…</p></div>
    <div id="pager"></div>
    <div id="extra"></div>`;

  // ── 対象
  const sel = renderSelector(root.querySelector('#selector'), ctx, { defaultMode: 'preset' });
  const targetSet = new Set(sel.list.map((c) => c.e));
  const base = periodRows(data, 0).filter((r) => targetSet.has(r.e));
  const filtered = applyFilters(base, params);
  renderFilterBanner(root.querySelector('#banner'), ctx, filtered.length, base.length);
  const order = new Map(sel.list.map((c, i) => [c.e, i]));
  const companies = filtered.map((r) => data.byE.get(r.e)).sort((a, b) => order.get(a.e) - order.get(b.e));
  const withSeg = companies.filter((c) => c.g);
  const noSeg = companies.filter((c) => !c.g);

  // ── 表示設定
  const ctl = root.querySelector('#ctl');
  ctl.innerHTML = `
    <div class="ctl-row">
      <div><label for="c-p">期</label><select id="c-p">${optionsHtml(PERIODS.map((l, i) => [i, l]), offset)}</select></div>
      <div><label for="c-mt">セグメント指標</label><select id="c-mt">${optionsHtml(METRIC_OPTIONS, mt)}</select></div>
    </div>
    <p class="tag-note">自動の優先順：${PROFIT_PRIORITY.map((k) => METRIC_LABEL[k]).join(' → ')}。
      セグメント利益の定義は会社により異なります（営業利益ベース／親会社帰属利益ベース）。各図のサブタイトルで確認してください。</p>`;
  ctl.querySelector('#c-p').addEventListener('change', (e) => ctx.update({ p: e.target.value === '0' ? '' : e.target.value, pg: '' }));
  ctl.querySelector('#c-mt').addEventListener('change', (e) => ctx.update({ mt: e.target.value === 'auto' ? '' : e.target.value, pg: '' }));

  // ── ページ分け
  const pages = Math.max(1, Math.ceil(withSeg.length / PAGE_SIZE));
  const pg = Math.min(pages, Math.max(1, parseInt(params.get('pg') || '1', 10) || 1));
  const shown = withSeg.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);
  const head = root.querySelector('#head');
  if (!withSeg.length) {
    head.innerHTML = '';
    root.querySelector('#grid').innerHTML = '<div class="empty">表示できる会社がありません。対象の選び方や条件を変えてください。</div>';
    return;
  }
  head.innerHTML = `<p class="tag-note" style="margin-top:1.4rem">${withSeg.length}社中 ${(pg - 1) * PAGE_SIZE + 1}〜${(pg - 1) * PAGE_SIZE + shown.length}社を表示${noSeg.length ? `（セグメント情報がない ${noSeg.length}社は除外）` : ''}</p>`;
  const pager = root.querySelector('#pager');
  pager.innerHTML = pages > 1 ? `<div class="pager">
      <button class="btn" data-pg="${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>← 前へ</button>
      <span class="muted small">${pg}/${pages}ページ</span>
      <button class="btn" data-pg="${pg + 1}" ${pg >= pages ? 'disabled' : ''}>次へ →</button></div>` : '';
  pager.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { ctx.update({ pg: b.dataset.pg === '1' ? '' : b.dataset.pg }); window.scrollTo(0, 0); }));

  // ── セグメントを読み込んで描く
  const segs = await Promise.all(shown.map((c) => loadSegments(data, c.e)));
  const grid = root.querySelector('#grid');
  grid.innerHTML = '';
  const tc = themeColors();
  const tableRows = [];
  shown.forEach((c, i) => {
    const item = portfolioItem(segs[i], offset, preferred);
    const card = document.createElement('div');
    card.className = 'chart-card';
    if (!item) {
      card.innerHTML = `<h3>${esc(c.n)}</h3><p class="sub">データなし</p>`;
      grid.appendChild(card);
      return;
    }
    const metricJa = item.metric ? METRIC_LABEL[item.metric] || item.metric : '—';
    card.innerHTML = `<h3>${esc(c.n)}</h3><p class="sub">${esc((item.fy || '').slice(0, 7))}（${esc(c.a)}）— 指標：${esc(metricJa)}</p><div class="tm"></div>`;
    grid.appendChild(card);
    const tm = card.querySelector('.tm');
    if (!item.rows.length) {
      tm.innerHTML = '<p class="muted small">正の値を持つセグメントがありません。</p>';
    } else {
      const total = item.rows.reduce((a, r) => a + r.value, 0);
      mountChart(tm, {
        tooltip: { formatter: (p) => `${esc(p.name)}<br>${fmtAmount(p.value)}<br>構成比 ${((p.value / total) * 100).toFixed(1)}%` },
        series: [{
          type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%', left: 0, top: 0, right: 0, bottom: 0,
          label: { show: true, color: '#fff', fontSize: 11, formatter: (p) => `${p.name}\n${fmtAmount(p.value)}\n(${((p.value / total) * 100).toFixed(1)}%)` },
          itemStyle: { borderColor: tc.bg, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
          data: item.rows.map((r) => ({ name: r.name, value: r.value })),
        }],
      }, { height: 280 });
    }
    if (item.negatives.length) {
      const p = document.createElement('p');
      p.className = 'neg-note';
      p.textContent = `⚠ マイナス値（図の外）：${item.negatives.map((r) => `${r.name} ${fmtAmount(r.value)}`).join('・')}`;
      card.appendChild(p);
    }
    [...item.rows, ...item.negatives].forEach((r) => tableRows.push({ company: c.n, fy: item.fy, metric: metricJa, name: r.name, value: r.value }));
  });

  // ── 数値一覧・セグメントのない会社
  const extra = root.querySelector('#extra');
  extra.innerHTML = `
    <details class="panel"><summary>セグメント別利益の数値一覧（表示中の会社）</summary><div class="panel-body">
      <div class="table-wrap"><table class="data"><thead><tr><th class="l">会社</th><th class="l">FY</th><th class="l">指標</th><th class="l">セグメント</th><th>値（億円）</th></tr></thead><tbody>
      ${tableRows.map((r) => `<tr><td class="l name">${esc(r.company)}</td><td class="l">${esc(r.fy.slice(0, 7))}</td><td class="l">${esc(r.metric)}</td><td class="l">${esc(r.name)}</td><td class="${r.value < 0 ? 'neg' : ''}">${(r.value / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}</td></tr>`).join('')}
      </tbody></table></div></div></details>
    ${noSeg.length ? `<details class="panel"><summary>セグメント情報がない会社（${noSeg.length}社）</summary><div class="panel-body"><p class="small">${noSeg.map((c) => esc(c.n)).join('、')}</p>
      <p class="tag-note">事業が単一、またはセグメントの記載形式が異なる会社です。</p></div></details>` : ''}`;
}
