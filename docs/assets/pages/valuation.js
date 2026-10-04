// バリュエーション散布図: 財務指標を2軸でプロット。業種などで色分け、中央値の十字線、外れ値の除外、強調表示。
import { FIELD, esc, fmtValue, isNum, splitCsv } from '../lib/fields.js?v=87b5bdf733';
import { periodRows } from '../lib/data.js?v=87b5bdf733';
import { applyFilters } from '../lib/filters.js?v=87b5bdf733';
import { renderSelector } from '../lib/selector_ui.js?v=87b5bdf733';
import { renderPicker, renderFilterBanner, optionsHtml } from '../lib/ui_common.js?v=87b5bdf733';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js?v=87b5bdf733';
import { clipBounds, markerSizes, categoryPalette, quantile } from '../lib/chartdata.js?v=87b5bdf733';

const AXIS_KEYS = ['roe', 'per', 'equity_ratio', 'eps', 'dps', 'bps', 'net_sales', 'net_income', 'gross_profit', 'total_assets', 'net_assets', 'operating_cf'];
const SIZE_KEYS = ['none', 'net_sales', 'net_income', 'total_assets', 'gross_profit'];
const COLOR_BY = [['industry', '業種'], ['std', '会計基準'], ['group', '商社・石油']];
const PERIODS = ['最新期', '1期前', '2期前', '3期前', '4期前'];
const GROUP_COLOR = { 商社: '#1f77b4', 石油: '#d62728', その他: '#b0b0b0' };
const STD_COLOR = { JP: '#1f77b4', IFRS: '#ff7f0e', US: '#2ca02c' };

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const offset = Math.min(4, Math.max(0, parseInt(params.get('p') || '0', 10) || 0));
  const xk = pick(params.get('x'), AXIS_KEYS, 'roe');
  const yk = pick(params.get('y'), AXIS_KEYS, 'per');
  const sk = pick(params.get('sz'), SIZE_KEYS, 'none');
  const cb = pick(params.get('cb'), COLOR_BY.map((c) => c[0]), 'industry');
  const showMedian = params.get('med') !== '0';
  const clip = params.get('clip') !== '0';

  root.innerHTML = `
    <h1 class="page-title">バリュエーション散布図</h1>
    <p class="page-lead">会社の財務指標を、好きな2軸でプロットします。業種などで色分けし、中央値の十字線、外れ値の除外、会社の強調ができます。</p>
    <div id="banner"></div>
    <div id="selector"></div>
    <details class="panel" open><summary>表示設定</summary><div class="panel-body" id="ctl"></div></details>
    <div id="chart" class="chart"></div>
    <div id="notes"></div>
    <div id="next"></div>
    <details class="panel"><summary>データテーブル</summary><div class="panel-body" id="table"></div></details>`;

  // ── 対象
  const sel = renderSelector(root.querySelector('#selector'), ctx, { defaultMode: 'all' });
  const targetSet = new Set(sel.list.map((c) => c.e));
  const base = periodRows(data, offset).filter((r) => targetSet.has(r.e));
  const rows = applyFilters(base, params);
  renderFilterBanner(root.querySelector('#banner'), ctx, rows.length, base.length);

  const pts = rows.filter((r) => isNum(r[xk]) && isNum(r[yk]));
  const fx = FIELD[xk]; const fy = FIELD[yk];
  const catOf = (r) => (cb === 'industry' ? r.industry || '（不明）' : cb === 'std' ? r.std || '（不明）' : r.group || 'その他');
  const labelDefault = pts.length <= 40;
  const showLabel = params.get('lab') ? params.get('lab') === '1' : labelDefault;
  const hl = new Set(splitCsv(params.get('hl')));

  // ── 表示設定
  const ctl = root.querySelector('#ctl');
  ctl.innerHTML = `
    <div class="ctl-row">
      <div><label for="c-p">期</label><select id="c-p">${optionsHtml(PERIODS.map((l, i) => [i, l]), offset)}</select></div>
      <div><label for="c-x">X軸</label><select id="c-x">${optionsHtml(AXIS_KEYS.map((k) => [k, FIELD[k].label]), xk)}</select></div>
      <div><label for="c-y">Y軸</label><select id="c-y">${optionsHtml(AXIS_KEYS.map((k) => [k, FIELD[k].label]), yk)}</select></div>
      <div><label for="c-s">マーカーの大きさ</label><select id="c-s">${optionsHtml(SIZE_KEYS.map((k) => [k, k === 'none' ? 'なし' : FIELD[k].label]), sk)}</select></div>
      <div><label for="c-cb">色分け</label><select id="c-cb">${optionsHtml(COLOR_BY, cb)}</select></div>
    </div>
    <div style="margin-top:.8rem">
      <label class="check"><input type="checkbox" id="c-med" ${showMedian ? 'checked' : ''}>中央値の十字線</label>
      <label class="check" title="極端な値で、ほとんどの点が1か所に固まるのを防ぎます（1〜99%点の範囲）"><input type="checkbox" id="c-clip" ${clip ? 'checked' : ''}>外れ値を除いて表示</label>
      <label class="check"><input type="checkbox" id="c-lab" ${showLabel ? 'checked' : ''}>会社名ラベル</label>
    </div>
    <div style="margin-top:.8rem" id="picker"></div>`;
  const on = (id, ev, fn) => ctl.querySelector(id).addEventListener(ev, fn);
  on('#c-p', 'change', (e) => ctx.update({ p: e.target.value === '0' ? '' : e.target.value }));
  on('#c-x', 'change', (e) => ctx.update({ x: e.target.value }));
  on('#c-y', 'change', (e) => ctx.update({ y: e.target.value }));
  on('#c-s', 'change', (e) => ctx.update({ sz: e.target.value === 'none' ? '' : e.target.value }));
  on('#c-cb', 'change', (e) => ctx.update({ cb: e.target.value === 'industry' ? '' : e.target.value }));
  on('#c-med', 'change', (e) => ctx.update({ med: e.target.checked ? '' : '0' }));
  on('#c-clip', 'change', (e) => ctx.update({ clip: e.target.checked ? '' : '0' }));
  on('#c-lab', 'change', (e) => ctx.update({ lab: e.target.checked ? '1' : '0' }));
  renderPicker(ctl.querySelector('#picker'), ctx, { param: 'hl', label: '強調表示する会社', pool: pts.map((r) => data.byE.get(r.e)) });

  // ── 図
  const chartEl = root.querySelector('#chart');
  if (!pts.length) {
    chartEl.innerHTML = '<div class="empty">表示できる会社がありません。対象の選び方や条件を変えてください。</div>';
  } else {
    const X = pts.map((r) => r[xk] * fx.scale);
    const Y = pts.map((r) => r[yk] * fy.scale);
    const sizes = sk === 'none' ? pts.map(() => (pts.length > 40 ? 8 : 14)) : markerSizes(pts.map((r) => r[sk]));
    const cats = [...new Set(pts.map(catOf))].sort((a, b) => a.localeCompare(b, 'ja'));
    const pal = categoryPalette(cats.length);
    const colorOf = (c, i) => (cb === 'group' ? GROUP_COLOR[c] || '#b0b0b0' : cb === 'std' ? STD_COLOR[c] || '#888' : pal[i]);
    const tc = themeColors();

    const tip = (p) => {
      const r = p.data.r;
      return `<b>${esc(r.name)}</b>（${esc(r.industry)}）<br>FY ${esc((r.fy || '').slice(0, 7))}　${esc(r.std)}${r.cons ? '' : '・個別'}`
        + `<br>${esc(fx.label)}：${fmtValue(xk, r[xk])} ${esc(fx.unit)}<br>${esc(fy.label)}：${fmtValue(yk, r[yk])} ${esc(fy.unit)}`;
    };

    const series = cats.map((c, i) => ({
      type: 'scatter', name: `${c}（${pts.filter((r) => catOf(r) === c).length}）`,
      data: pts.map((r, j) => ({ value: [X[j], Y[j]], r, symbolSize: sizes[j] })).filter((d) => catOf(d.r) === c),
      itemStyle: { color: colorOf(c, i), opacity: 0.85, borderColor: tc.bg, borderWidth: 0.6 },
      label: { show: showLabel, formatter: (p) => p.data.r.name, position: 'top', fontSize: 10, color: tc.fg },
      tooltip: { formatter: tip },
    }));

    if (showMedian && pts.length >= 2) {
      const med = (a) => quantile([...a].sort((p, q) => p - q), 0.5);
      const xm = med(X); const ym = med(Y);
      series[0].markLine = {
        silent: true, symbol: 'none', animation: false,
        lineStyle: { type: 'dashed', color: tc.muted, width: 1 },
        data: [
          { xAxis: xm, label: { formatter: `中央値 ${Number(xm.toPrecision(3))}`, color: tc.muted, position: 'end' } },
          { yAxis: ym, label: { formatter: `中央値 ${Number(ym.toPrecision(3))}`, color: tc.muted, position: 'end' } },
        ],
      };
    }
    if (hl.size) {
      series.push({
        type: 'scatter', name: '強調', silent: true, z: 10,
        data: pts.map((r, j) => ({ value: [X[j], Y[j]], r })).filter((d) => hl.has(d.r.e)),
        symbolSize: 20, itemStyle: { color: 'rgba(0,0,0,0)', borderColor: tc.fg, borderWidth: 2.5 },
        label: { show: true, formatter: (p) => p.data.r.name, position: 'top', fontSize: 12, color: tc.fg },
      });
    }

    const axis = (name, f, bounds) => ({
      type: 'value', name: `${name}（${f.unit}）`, nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: tc.muted },
      min: bounds ? bounds[0] : undefined, max: bounds ? bounds[1] : undefined, scale: true,
      axisLabel: { color: tc.muted, formatter: (v) => Number(v.toPrecision(4)).toLocaleString('ja-JP') },
      splitLine: { lineStyle: { color: tc.line } }, axisLine: { lineStyle: { color: tc.line } },
    });
    const bx = clip && pts.length >= 20 ? clipBounds(X) : null;
    const by = clip && pts.length >= 20 ? clipBounds(Y) : null;
    const hidden = bx && by ? pts.filter((r, j) => X[j] < bx[0] || X[j] > bx[1] || Y[j] < by[0] || Y[j] > by[1]).length : 0;

    mountChart(chartEl, {
      legend: { type: 'scroll', top: 0, textStyle: { color: tc.fg, fontSize: 11 }, pageTextStyle: { color: tc.muted } },
      grid: { left: 64, right: 24, top: 56, bottom: 56, containLabel: false },
      xAxis: axis(fx.label, fx, bx), yAxis: axis(fy.label, fy, by),
      tooltip: { trigger: 'item' },
      series,
    }, { height: window.innerWidth < 640 ? 480 : 640 });

    const notes = [];
    if (hidden) notes.push(`外れ値として、図の範囲外にした会社：${hidden}社（表には含まれます）`);
    const lacking = rows.length - pts.length;
    if (lacking) notes.push(`${fx.label}または${fy.label}の値がなく、図に出ていない会社：${lacking}社`);
    const nc = pts.filter((r) => !r.cons).length;
    if (nc) notes.push(`個別財務諸表のみの会社が ${nc}社含まれます（連結の会社とは基準が異なります）`);
    root.querySelector('#notes').innerHTML = notes.map((n) => `<p class="tag-note">⚠ ${esc(n)}</p>`).join('');
  }

  // ── 強調した会社を、比較ページで開く
  const marked = [...hl].filter((e) => data.byE.has(e));
  if (marked.length) {
    const used = marked.slice(0, 5);
    // 1社だけのときは、同じ業種の会社を2社足す（比較ページが1列だけにならないように）
    if (used.length === 1) {
      const ind = data.byE.get(used[0]).i;
      used.push(...data.companies.filter((c) => c.i === ind && c.e !== used[0]).sort((x, y) => x.s.localeCompare(y.s)).slice(0, 2).map((c) => c.e));
    }
    root.querySelector('#next').innerHTML = `<p style="margin:1rem 0"><a class="btn" href="${ctx.link('compare', { cc: used.join(',') })}">${marked.length > 5
      ? `強調した${marked.length}社のうち、先頭の5社を比べる →` : (marked.length === 1 ? '強調した会社を、同じ業種の会社と比べる →' : `強調した${marked.length}社を比べる →`)}</a></p>`;
  }

  // ── 表
  const tbl = [...rows].sort((a, b) => a.sec.localeCompare(b.sec));
  root.querySelector('#table').innerHTML = `
    <div class="table-wrap"><table class="data"><thead><tr>
      <th class="l">会社</th><th class="l">業種</th><th class="l">FY</th><th class="l">基準</th>
      <th>${esc(fx.label)}（${esc(fx.unit)}）</th><th>${esc(fy.label)}（${esc(fy.unit)}）</th></tr></thead>
      <tbody>${tbl.map((r) => `<tr><td class="l name">${esc(r.name)}<span class="sec">${esc(r.sec)}</span></td><td class="l">${esc(r.industry)}</td>
        <td class="l">${esc((r.fy || '').slice(0, 7))}</td><td class="l">${esc(r.std)}</td><td>${fmtValue(xk, r[xk])}</td><td>${fmtValue(yk, r[yk])}</td></tr>`).join('')}</tbody></table></div>`;
}
