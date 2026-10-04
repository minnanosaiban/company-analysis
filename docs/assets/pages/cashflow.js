// CFパターン分類: 営業CF・投資CF・財務CF の符号で、経営フェーズを8パターンに分ける。
import { esc, fmtValue, isNum, splitCsv } from '../lib/fields.js?v=00492caca6';
import { periodRows } from '../lib/data.js?v=00492caca6';
import { applyFilters } from '../lib/filters.js?v=00492caca6';
import { PATTERNS, PATTERN_NAMES, PATTERN_COLOR } from '../lib/cf.js?v=00492caca6';
import { renderSelector } from '../lib/selector_ui.js?v=00492caca6';
import { renderPicker, renderFilterBanner } from '../lib/ui_common.js?v=00492caca6';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js?v=00492caca6';
import { clipBounds } from '../lib/chartdata.js?v=00492caca6';

const TRAIL_MAX = 30;   // 軌跡（過去期の線）を出す会社数の上限
const LABEL_MAX = 40;   // 会社名ラベルを出す会社数の上限

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const nPeriods = Math.min(5, Math.max(1, parseInt(params.get('n') || '5', 10) || 5));
  root.innerHTML = `
    <h1 class="page-title">CFパターン分類</h1>
    <p class="page-lead">営業CF・投資CF・財務CF の符号の組み合わせで、各社の経営フェーズを8つのパターンに分けます。
      最新期の分布、業種ごとの内訳、少数の会社を選んだときは5期の軌跡も見られます。</p>
    <div id="banner"></div>
    <div id="selector"></div>
    <details class="panel" open><summary>表示設定</summary><div class="panel-body" id="ctl"></div></details>
    <div id="chart" class="chart"></div>
    <div id="notes"></div>
    <div id="dist"></div>
    <div id="byind"></div>
    <details class="panel"><summary>会社別（最新期）</summary><div class="panel-body" id="table"></div></details>`;

  // ── 対象：最新期の行で絞り込み → その会社の履歴
  const sel = renderSelector(root.querySelector('#selector'), ctx, { defaultMode: 'all' });
  const targetSet = new Set(sel.list.map((c) => c.e));
  const baseLatest = periodRows(data, 0).filter((r) => targetSet.has(r.e));
  const latestRows = applyFilters(baseLatest, params);
  renderFilterBanner(root.querySelector('#banner'), ctx, latestRows.length, baseLatest.length);
  const nCompanies = latestRows.length;

  const canTrail = nCompanies <= TRAIL_MAX && nPeriods > 1;
  const trail = canTrail && params.get('trail') !== '0';
  const norm = params.get('norm') ? params.get('norm') === '1' : nCompanies > LABEL_MAX;   // 多数の会社では、規模差を消す方が読める
  const showLabel = params.get('lab') ? params.get('lab') === '1' : nCompanies <= LABEL_MAX;
  const hl = new Set(splitCsv(params.get('hl')));

  // ── 表示設定
  const ctl = root.querySelector('#ctl');
  ctl.innerHTML = `
    <div class="ctl-row">
      <div><label for="c-n">表示期数</label>
        <select id="c-n">${[1, 2, 3, 4, 5].map((i) => `<option value="${i}" ${i === nPeriods ? 'selected' : ''}>${i}期</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:.8rem">
      <label class="check" title="${TRAIL_MAX}社以下を選んだときに使えます"><input type="checkbox" id="c-trail" ${trail ? 'checked' : ''} ${canTrail ? '' : 'disabled'}>過去期も軌跡として表示（${TRAIL_MAX}社以下）</label>
      <label class="check" title="営業CF／総資産 のような比率にして、規模の差を消します"><input type="checkbox" id="c-norm" ${norm ? 'checked' : ''}>総資産で割った比率で表示</label>
      <label class="check"><input type="checkbox" id="c-lab" ${showLabel ? 'checked' : ''}>会社名ラベル</label>
    </div>
    <div style="margin-top:.8rem" id="picker"></div>`;
  const on = (id, ev, fn) => ctl.querySelector(id).addEventListener(ev, fn);
  on('#c-n', 'change', (e) => ctx.update({ n: e.target.value === '5' ? '' : e.target.value }));
  on('#c-trail', 'change', (e) => ctx.update({ trail: e.target.checked ? '' : '0' }));
  on('#c-norm', 'change', (e) => ctx.update({ norm: e.target.checked ? '1' : '0' }));
  on('#c-lab', 'change', (e) => ctx.update({ lab: e.target.checked ? '1' : '0' }));
  renderPicker(ctl.querySelector('#picker'), ctx, { param: 'hl', label: '強調表示する会社', pool: latestRows.map((r) => data.byE.get(r.e)) });

  // ── 点の組み立て（会社×期。パターンが決まるものだけ）
  const unit = norm ? '%' : '億円';
  const val = (r, k) => {
    if (!isNum(r[k])) return null;
    if (norm) return isNum(r.total_assets) && r.total_assets > 0 ? (r[k] / r.total_assets) * 100 : null;
    return r[k] * 1e-8;
  };
  const points = [];
  latestRows.forEach((lr) => {
    (data.byCompany.get(lr.e) || []).filter((r) => r.offset < nPeriods && (trail || r.offset === 0)).forEach((r) => {
      const x = val(r, 'operating_cf'); const y = val(r, 'investing_cf');
      if (r.pattern && x !== null && y !== null) points.push({ r, x, y, latest: r.offset === 0 });
    });
  });
  const latestPts = points.filter((p) => p.latest);

  const chartEl = root.querySelector('#chart');
  if (!latestPts.length) {
    chartEl.innerHTML = '<div class="empty">表示できる会社がありません。対象の選び方や条件を変えてください。</div>';
  } else {
    const tc = themeColors();
    const tip = (p) => {
      const r = p.data.r;
      return `<b>${esc(r.name)}</b>（${esc(r.industry)}）<br>FY ${esc((r.fy || '').slice(0, 7))}`
        + `<br>営業CF ${fmtValue('operating_cf', r.operating_cf)}　投資CF ${fmtValue('investing_cf', r.investing_cf)}　財務CF ${fmtValue('financing_cf', r.financing_cf)}（億円）`
        + `<br><b>${esc(r.pattern)}</b> — ${esc(PATTERNS.find((q) => q.name === r.pattern).desc)}`;
    };
    const series = [];
    if (trail) {
      const lines = [];
      latestRows.forEach((lr) => {
        const pts = points.filter((p) => p.r.e === lr.e).sort((a, b) => b.r.offset - a.r.offset).map((p) => [p.x, p.y]);
        if (pts.length > 1) lines.push({ coords: pts });
      });
      series.push({ type: 'lines', coordinateSystem: 'cartesian2d', silent: true, z: 1, data: lines, lineStyle: { color: tc.muted, opacity: 0.4, width: 1 }, tooltip: { show: false } });
    }
    PATTERNS.forEach((pt) => {
      const sub = points.filter((p) => p.r.pattern === pt.name);
      if (!sub.length) return;
      series.push({
        type: 'scatter', name: `${pt.name}（${sub.filter((p) => p.latest).length}）`,
        data: sub.map((p) => ({ value: [p.x, p.y], r: p.r, symbolSize: p.latest ? (latestPts.length <= 60 ? 14 : 8) : 7, itemStyle: { opacity: p.latest ? 0.9 : 0.4 } })),
        itemStyle: { color: PATTERN_COLOR[pt.name], borderColor: tc.bg, borderWidth: 0.6 },
        label: { show: showLabel, formatter: (q) => (q.data.r.offset === 0 ? q.data.r.name : ''), position: 'top', fontSize: 10, color: tc.fg },
        tooltip: { formatter: tip },
      });
    });
    // 0軸の十字（4象限）
    const firstScatter = series.find((s) => s.type === 'scatter');
    firstScatter.markLine = { silent: true, symbol: 'none', animation: false, lineStyle: { type: 'dashed', color: tc.muted, width: 1 }, label: { show: false }, data: [{ xAxis: 0 }, { yAxis: 0 }] };
    if (hl.size) {
      series.push({
        type: 'scatter', name: '強調', silent: true, z: 10, symbolSize: 20,
        data: latestPts.filter((p) => hl.has(p.r.e)).map((p) => ({ value: [p.x, p.y], r: p.r })),
        itemStyle: { color: 'rgba(0,0,0,0)', borderColor: tc.fg, borderWidth: 2.5 },
        label: { show: true, formatter: (q) => q.data.r.name, position: 'top', fontSize: 12, color: tc.fg },
      });
    }

    const clip = latestPts.length >= 20;
    const bx = clip ? clipBounds(points.map((p) => p.x)) : null;
    const by = clip ? clipBounds(points.map((p) => p.y)) : null;
    const hidden = bx && by ? latestPts.filter((p) => p.x < bx[0] || p.x > bx[1] || p.y < by[0] || p.y > by[1]).length : 0;
    const axis = (name, b) => ({
      type: 'value', name: `${name}${norm ? '／総資産' : ''}（${unit}）`, nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: tc.muted },
      min: b ? b[0] : undefined, max: b ? b[1] : undefined, scale: true,
      axisLabel: { color: tc.muted, formatter: (v) => Number(v.toPrecision(4)).toLocaleString('ja-JP') },
      splitLine: { lineStyle: { color: tc.line } }, axisLine: { lineStyle: { color: tc.line } },
    });
    mountChart(chartEl, {
      legend: { type: 'scroll', top: 0, textStyle: { color: tc.fg, fontSize: 11 }, pageTextStyle: { color: tc.muted } },
      grid: { left: 64, right: 24, top: 56, bottom: 56 },
      xAxis: axis('営業CF', bx), yAxis: axis('投資CF', by),
      tooltip: { trigger: 'item' },
      series,
    }, { height: window.innerWidth < 640 ? 480 : 620 });

    const notes = [`大きいマーカーが最新期${trail ? '、小さいマーカーが過去期、灰色の線が年度間の軌跡' : ''}です。0軸の十字で4象限に分け、色は財務CFを加味した8パターンです。`];
    if (hidden) notes.push(`外れ値として、図の範囲外にした会社：${hidden}社（下の表には含まれます）`);
    if (!norm) notes.push('実額（億円）では、規模の大きい会社が端に寄ります。比較には「総資産で割った比率で表示」も使えます。');
    if (latestRows.some((r) => !r.cons)) notes.push('個別財務諸表のみの会社が含まれます（連結の会社とは基準が異なります）。');
    root.querySelector('#notes').innerHTML = notes.map((n) => `<p class="tag-note">${esc(n)}</p>`).join('');
  }

  // ── 最新期のパターン分布
  const counts = {};
  latestRows.forEach((r) => { if (r.pattern) counts[r.pattern] = (counts[r.pattern] || 0) + 1; });
  const unclassified = latestRows.filter((r) => !r.pattern).length;
  root.querySelector('#dist').innerHTML = `
    <h2>最新期のパターン分布</h2>
    <div class="table-wrap"><table class="data"><thead><tr><th class="l">符号（営業/投資/財務）</th><th class="l">パターン</th><th class="l">説明</th><th>該当社数</th></tr></thead><tbody>
      ${PATTERNS.map((p) => `<tr><td class="l">${p.key.split(',').map((s) => (s === '1' ? '＋' : '－')).join(' / ')}</td>
        <td class="l"><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td><td class="l">${esc(p.desc)}</td><td>${counts[p.name] || 0}</td></tr>`).join('')}
    </tbody></table></div>
    ${unclassified ? `<p class="tag-note">分類できない会社（値の欠損など）：${unclassified}社</p>` : ''}`;

  // ── 業種別の構成（2業種以上のとき）
  const byInd = new Map();
  latestRows.filter((r) => r.pattern).forEach((r) => {
    if (!byInd.has(r.industry)) byInd.set(r.industry, {});
    byInd.get(r.industry)[r.pattern] = (byInd.get(r.industry)[r.pattern] || 0) + 1;
  });
  const indEl = root.querySelector('#byind');
  if (byInd.size >= 2) {
    indEl.innerHTML = '<h2>業種別のパターン構成（最新期・社数）</h2><div id="bar" class="chart"></div>';
    const tc = themeColors();
    const inds = [...byInd.keys()].sort((a, b) => Object.values(byInd.get(a)).reduce((x, y) => x + y, 0) - Object.values(byInd.get(b)).reduce((x, y) => x + y, 0));
    mountChart(indEl.querySelector('#bar'), {
      legend: { type: 'scroll', top: 0, textStyle: { color: tc.fg, fontSize: 11 } },
      grid: { left: 130, right: 20, top: 40, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', axisLabel: { color: tc.muted }, splitLine: { lineStyle: { color: tc.line } } },
      yAxis: { type: 'category', data: inds, axisLabel: { color: tc.fg, fontSize: 11 } },
      series: PATTERN_NAMES.filter((n) => counts[n]).map((n) => ({
        type: 'bar', name: n, stack: 'total', itemStyle: { color: PATTERN_COLOR[n] }, data: inds.map((i) => byInd.get(i)[n] || 0),
      })),
    }, { height: Math.max(260, 24 * inds.length + 90) });
  } else indEl.innerHTML = '';

  // ── 会社別の表
  const tbl = [...latestRows].sort((a, b) => a.sec.localeCompare(b.sec));
  root.querySelector('#table').innerHTML = `
    <div class="table-wrap"><table class="data"><thead><tr><th class="l">会社</th><th class="l">業種</th><th class="l">FY</th><th class="l">パターン</th>
      <th>営業CF（億円）</th><th>投資CF（億円）</th><th>財務CF（億円）</th></tr></thead><tbody>
      ${tbl.map((r) => `<tr><td class="l name">${esc(r.name)}<span class="sec">${esc(r.sec)}</span></td><td class="l">${esc(r.industry)}</td><td class="l">${esc((r.fy || '').slice(0, 7))}</td>
        <td class="l">${r.pattern ? `<span class="dot" style="background:${PATTERN_COLOR[r.pattern]}"></span> ${esc(r.pattern)}` : '<span class="muted">—</span>'}</td>
        <td>${fmtValue('operating_cf', r.operating_cf)}</td><td>${fmtValue('investing_cf', r.investing_cf)}</td><td>${fmtValue('financing_cf', r.financing_cf)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
