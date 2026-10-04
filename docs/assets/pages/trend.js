// 財務の推移: 会社ごとの時系列。1社は指標ごとの小さなグラフ、複数社（最大5社）は重ねて比べる。
import { esc, splitCsv, isNum } from '../lib/fields.js';
import { renderPicker, optionsHtml } from '../lib/ui_common.js';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js';
import { TREND_METRICS, TREND_GROUPS, trendData, indexSeries, hasValues, standardChange } from '../lib/chartdata.js';

const DEFAULT_COMPANY = 'E02529';   // 三菱商事（初期表示）
const MAX_COMPANIES = 5;
const COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626'];
const INDEXABLE = new Set(['rev', 'total_assets', 'net_assets', 'operating_income', 'ordinary_income', 'net_income']);
const PERIOD_OPTIONS = [['', 'すべての期'], ['5', '直近5期'], ['8', '直近8期'], ['10', '直近10期']];

const ym = (fy) => `${fy.slice(0, 4)}/${fy.slice(5, 7)}`;
const fmt = (m, v) => (v === null || v === undefined ? '—' : (v * m.scale).toLocaleString('ja-JP', { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }));
const axisFmt = (v) => Number(v.toPrecision(4)).toLocaleString('ja-JP');

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const fromUrl = splitCsv(params.get('tc')).filter((e) => data.byCompany.has(e));
  const codes = (fromUrl.length ? fromUrl : [DEFAULT_COMPANY]).slice(0, MAX_COMPANIES);
  const n = [5, 8, 10].includes(parseInt(params.get('n'), 10)) ? parseInt(params.get('n'), 10) : null;
  const multi = codes.length > 1;
  const indexed = multi && params.get('idx') === '1';

  root.innerHTML = `
    <h1 class="page-title">財務の推移</h1>
    <p class="page-lead">会社ごとの財務を、期を追って見られます。売上・利益・ROE・自己資本比率・1株の指標・キャッシュフローを、小さなグラフで並べます。
      会社を最大5社まで選ぶと、重ねて比べられます。</p>
    <section class="selector">
      <h3 class="bar-title">会社を選ぶ</h3>
      <div id="picker"></div>
    </section>
    <details class="panel" open><summary>表示設定</summary><div class="panel-body" id="ctl"></div></details>
    <div id="notes"></div>
    <div id="out"></div>
    <details class="panel"><summary>数値の表</summary><div class="panel-body" id="table"></div></details>`;

  renderPicker(root.querySelector('#picker'), ctx, {
    param: 'tc', label: `会社（最大${MAX_COMPANIES}社・名前やコードで検索）`, max: MAX_COMPANIES, fallback: [DEFAULT_COMPANY], noneText: '会社を選んでください',
  });

  const ctl = root.querySelector('#ctl');
  ctl.innerHTML = `
    <div class="ctl-row">
      <div><label for="c-n">期間</label><select id="c-n">${optionsHtml(PERIOD_OPTIONS, n ?? '')}</select></div>
    </div>
    <div style="margin-top:.8rem">
      <label class="check" title="最初の期を100として、金額の伸びを比べます（会社の規模の差を消せます）"><input type="checkbox" id="c-idx" ${indexed ? 'checked' : ''} ${multi ? '' : 'disabled'}>最初の期を100として比べる（複数社のとき・金額の指標）</label>
    </div>`;
  ctl.querySelector('#c-n').addEventListener('change', (e) => ctx.update({ n: e.target.value }));
  ctl.querySelector('#c-idx').addEventListener('change', (e) => ctx.update({ idx: e.target.checked ? '1' : '' }));

  // ── データ
  const companies = codes.map((e) => data.byE.get(e));
  const tds = codes.map((e) => trendData(data.byCompany.get(e), n));
  const tc = themeColors();

  // ── 注記
  const notes = [];
  companies.forEach((c, i) => {
    const sc = standardChange(tds[i].fys, tds[i].std);
    if (sc) notes.push(`${c.n}：会計基準が途中で変わっています（${sc}）。項目の定義が、少し異なる場合があります。`);
    if (!c.c) notes.push(`${c.n}：個別財務諸表のみの会社です（連結の会社とは基準が異なります）。`);
    const srcs = [...new Set(tds[i].revSrc.filter(Boolean))].filter((s) => s !== '売上');
    if (srcs.length) notes.push(`${c.n}：「売上・収益」は、${srcs.join('・')}です（金融業は、売上の代わりに別の収益で報告します）。`);
    if (tds[i].fys.length < 5) notes.push(`${c.n}：有価証券報告書が少ない（${tds[i].fys.length}期）ため、短い推移です。`);
  });
  root.querySelector('#notes').innerHTML = notes.map((t) => `<p class="tag-note">ℹ ${esc(t)}</p>`).join('');

  // ── グラフ
  const out = root.querySelector('#out');
  const title = multi
    ? companies.map((c) => c.n).join(' ／ ')
    : `${companies[0].n}（${companies[0].s}）／ ${companies[0].i} ／ ${companies[0].a} ／ ${companies[0].c ? '連結' : '個別財務諸表のみ'}`;
  out.innerHTML = `<h2 style="margin-top:2rem">${esc(title)}</h2>`;

  const tooltipSingle = (m, td, key) => (ps) => {
    const i = ps[0].dataIndex;
    const v = td.series[key][i];
    const src = key === 'rev' && td.revSrc[i] ? `（${td.revSrc[i]}）` : '';
    return `FY ${ym(td.fys[i])}（${esc(td.std[i] || '')}）<br>${esc(m.label)}${src}：<b>${fmt(m, v)}</b> ${esc(m.unit)}`;
  };

  function singleOption(key) {
    const m = TREND_METRICS[key]; const td = tds[0];
    const vals = td.series[key].map((v) => (v === null ? null : v * m.scale));
    const cats = td.fys.map(ym);
    const series = m.kind === 'bar'
      ? { type: 'bar', barCategoryGap: '35%', data: vals.map((v) => ({ value: v, itemStyle: { color: v !== null && v < 0 ? tc.warn : tc.accent } })) }
      : { type: 'line', data: vals, symbolSize: 6, itemStyle: { color: tc.accent }, lineStyle: { color: tc.accent, width: 2 } };
    if (m.kind === 'line' && (key === 'roe' || key === 'equity_ratio')) series.markLine = { silent: true, symbol: 'none', lineStyle: { color: tc.muted, opacity: 0.4, width: 0.8 }, label: { show: false }, data: [{ yAxis: 0 }] };
    return {
      grid: { left: 58, right: 14, top: 18, bottom: cats.length > 7 ? 46 : 32 },
      tooltip: { trigger: 'axis', formatter: tooltipSingle(m, td, key) },
      xAxis: { type: 'category', data: cats, axisLabel: { color: tc.muted, fontSize: 10, rotate: cats.length > 7 ? 40 : 0 }, axisLine: { lineStyle: { color: tc.line } } },
      yAxis: { type: 'value', scale: m.kind === 'line', axisLabel: { color: tc.muted, fontSize: 10, formatter: axisFmt }, splitLine: { lineStyle: { color: tc.line } } },
      series: [series],
    };
  }

  function multiOption(key) {
    const m = TREND_METRICS[key];
    const useIdx = indexed && INDEXABLE.has(key);
    const series = codes.map((e, i) => {
      const td = tds[i];
      const raw = td.series[key];
      const vals = useIdx ? indexSeries(raw) : raw.map((v) => (v === null ? null : v * m.scale));
      return {
        type: 'line', name: companies[i].n, connectNulls: true, symbolSize: 6,
        itemStyle: { color: COLORS[i] }, lineStyle: { color: COLORS[i], width: 2 },
        data: td.fys.map((fy, j) => [fy, vals[j]]).filter(([, v]) => v !== null),
      };
    }).filter((s) => s.data.length);
    return {
      grid: { left: 58, right: 14, top: 18, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps) => {
          const head = ps.length ? `FY ${ym(ps[0].value[0].slice(0, 10))}` : '';
          return `${head}<br>${ps.map((p) => `<span style="color:${p.color}">●</span> ${esc(p.seriesName)}：<b>${useIdx ? Number(p.value[1]).toFixed(1) : Number(p.value[1]).toLocaleString('ja-JP', { maximumFractionDigits: m.digits })}</b>`).join('<br>')}`;
        },
      },
      xAxis: { type: 'time', axisLabel: { color: tc.muted, fontSize: 10, formatter: (v) => String(new Date(v).getFullYear()) }, axisLine: { lineStyle: { color: tc.line } }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: tc.muted, fontSize: 10, formatter: axisFmt }, splitLine: { lineStyle: { color: tc.line } } },
      series,
    };
  }

  let anyChart = false;
  TREND_GROUPS.forEach((g) => {
    const keys = g.metrics.filter((k) => tds.some((td) => hasValues(td.series[k])));
    if (!keys.length) return;
    const sec = document.createElement('section');
    sec.innerHTML = `<h3 class="bar-title" style="margin-top:2rem">${esc(g.title)}</h3><div class="chart-sm-grid"></div>`;
    out.appendChild(sec);
    const grid = sec.querySelector('.chart-sm-grid');
    keys.forEach((k) => {
      const m = TREND_METRICS[k];
      const unit = indexed && INDEXABLE.has(k) && multi ? '最初の期=100' : m.unit;
      const card = document.createElement('div');
      card.className = 'chart-card';
      card.innerHTML = `<h3>${esc(m.label)}<span class="muted small">（${esc(unit)}）</span></h3><div class="sm"></div>`;
      grid.appendChild(card);
      mountChart(card.querySelector('.sm'), multi ? multiOption(k) : singleOption(k), { height: multi ? 230 : 200 });
      anyChart = true;
    });
  });
  if (multi && anyChart) {
    const legend = document.createElement('p');
    legend.className = 'tag-note';
    legend.innerHTML = codes.map((e, i) => `<span style="color:${COLORS[i]}">●</span> ${esc(companies[i].n)}`).join('　');
    out.insertBefore(legend, out.children[1]);
  }
  if (!anyChart) out.innerHTML += '<div class="empty">表示できる財務の値がありません。</div>';

  // ── 数値の表（会社ごと）
  root.querySelector('#table').innerHTML = companies.map((c, i) => {
    const td = tds[i];
    const keys = Object.keys(TREND_METRICS).filter((k) => hasValues(td.series[k]));
    return `<h4 style="margin:1rem 0 .3rem">${esc(c.n)}（${esc(c.s)}）</h4>
      <div class="table-wrap"><table class="data"><thead><tr><th class="l sticky-col">指標</th>${td.fys.map((f) => `<th>${ym(f)}</th>`).join('')}</tr></thead><tbody>
      ${keys.map((k) => { const m = TREND_METRICS[k]; return `<tr><td class="l name sticky-col">${esc(m.label)}<span class="sec">${esc(m.unit)}</span></td>${td.series[k].map((v) => `<td class="${isNum(v) && v < 0 ? 'neg' : ''}">${fmt(m, v)}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>`;
  }).join('');
}
