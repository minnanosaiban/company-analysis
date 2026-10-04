// 会社の比較: 最大5社の最新期を、並べた表と棒グラフで比べる。
import { esc, splitCsv, isNum } from '../lib/fields.js';
import { renderPicker } from '../lib/ui_common.js';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js';
import { COMPARE_ROWS, compareValues, bestIndexes, standardChange } from '../lib/chartdata.js';

const DEFAULT_COMPANIES = ['E02529', 'E02513'];   // 三菱商事・三井物産（初期表示）
const MAX_COMPANIES = 5;
const COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626'];
const BAR_METRICS = ['op_margin', 'roe', 'equity_ratio', 'rev_growth'];

const ym = (fy) => `${fy.slice(0, 4)}/${fy.slice(5, 7)}`;
const fmt = (m, v) => (isNum(v) ? (v * m.scale).toLocaleString('ja-JP', { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }) : '—');

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const fromUrl = splitCsv(params.get('cc')).filter((e) => data.byCompany.has(e));
  const codes = (fromUrl.length ? fromUrl : DEFAULT_COMPANIES).slice(0, MAX_COMPANIES);
  const companies = codes.map((e) => data.byE.get(e));
  const cmp = codes.map((e) => compareValues(data.byCompany.get(e)));

  root.innerHTML = `
    <h1 class="page-title">会社を比べる</h1>
    <p class="page-lead">会社を最大${MAX_COMPANIES}社まで選び、最新の有価証券報告書の数値を並べて比べます。各行で最も良い値（利益率・ROE・自己資本比率・売上の伸び）は、色を付けています。</p>
    <section class="selector">
      <h3 class="bar-title">比べる会社</h3>
      <div id="picker"></div>
    </section>
    <div id="notes"></div>
    <div id="out"></div>`;
  renderPicker(root.querySelector('#picker'), ctx, {
    param: 'cc', label: `会社（最大${MAX_COMPANIES}社・名前やコードで検索）`, max: MAX_COMPANIES, fallback: DEFAULT_COMPANIES, noneText: '会社を選んでください',
  });

  // ── 注記
  const notes = [];
  const fys = new Set(cmp.map((c) => c.fy));
  if (fys.size > 1) notes.push('決算期が会社によって異なります。列の見出しの「FY」で確認してください。');
  const stds = new Set(cmp.map((c) => c.std));
  if (stds.size > 1) notes.push(`会計基準が異なる会社を含みます（${[...stds].join('・')}）。利益などの定義が、少し異なる場合があります。`);
  companies.forEach((c, i) => {
    if (!c.c) notes.push(`${c.n}：個別財務諸表のみの会社です（連結の会社とは基準が異なります）。`);
    if (cmp[i].revSrc && cmp[i].revSrc !== '売上') notes.push(`${c.n}：「売上・収益」は${cmp[i].revSrc}です（金融業は、売上の代わりに別の収益で報告します）。利益率は、これに対する比率です。`);
  });
  root.querySelector('#notes').innerHTML = notes.map((t) => `<p class="tag-note">ℹ ${esc(t)}</p>`).join('');

  const out = root.querySelector('#out');

  // ── 棒グラフ（比率）
  const tc = themeColors();
  const barSec = document.createElement('section');
  barSec.innerHTML = '<h3 class="bar-title" style="margin-top:2rem">比率で比べる</h3><div class="chart-sm-grid"></div>';
  out.appendChild(barSec);
  const grid = barSec.querySelector('.chart-sm-grid');
  BAR_METRICS.forEach((k) => {
    const m = COMPARE_ROWS.find((r) => r.key === k);
    const vals = cmp.map((c) => (isNum(c.values[k]) ? c.values[k] * m.scale : null));
    if (!vals.some((v) => v !== null)) return;
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<h3>${esc(m.label)}<span class="muted small">（${esc(m.unit)}）</span></h3><div class="sm"></div>`;
    grid.appendChild(card);
    mountChart(card.querySelector('.sm'), {
      grid: { left: 50, right: 14, top: 18, bottom: 56 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(m.digits)} ${m.unit}`) },
      xAxis: { type: 'category', data: companies.map((c) => c.n), axisLabel: { color: tc.muted, fontSize: 10, interval: 0, width: 64, overflow: 'break' }, axisLine: { lineStyle: { color: tc.line } } },
      yAxis: { type: 'value', axisLabel: { color: tc.muted, fontSize: 10 }, splitLine: { lineStyle: { color: tc.line } } },
      series: [{ type: 'bar', barCategoryGap: '40%', data: vals.map((v, i) => ({ value: v, itemStyle: { color: COLORS[i] } })) }],
    }, { height: 230 });
  });

  // ── 表
  const head = companies.map((c, i) => `<th><span style="color:${COLORS[i]}">●</span> ${esc(c.n)}
    <span class="sec">${esc(c.s)}・${esc(c.i)}<br>FY ${ym(cmp[i].fy)}・${esc(cmp[i].std)}<br><a href="${ctx.link('trend', { tc: c.e })}">推移を見る →</a></span></th>`).join('');
  let lastGroup = '';
  const body = COMPARE_ROWS.map((m) => {
    const vals = cmp.map((c) => c.values[m.key]);
    if (!vals.some((v) => isNum(v))) return '';
    const best = bestIndexes(vals, m.better);
    const groupRow = m.group !== lastGroup ? `<tr class="group-row"><th class="l" colspan="${codes.length + 1}">${esc(m.group)}</th></tr>` : '';
    lastGroup = m.group;
    return `${groupRow}<tr><td class="l name sticky-col">${esc(m.label)}<span class="sec">${esc(m.unit)}</span></td>${vals.map((v, i) =>
      `<td class="${isNum(v) && v < 0 ? 'neg' : ''}${best.includes(i) ? ' best' : ''}">${fmt(m, v)}</td>`).join('')}</tr>`;
  }).join('');
  const patternRow = `<tr class="group-row"><th class="l" colspan="${codes.length + 1}">経営フェーズ</th></tr>
    <tr><td class="l name sticky-col">CFパターン</td>${cmp.map((c) => `<td>${esc(c.pattern || '—')}</td>`).join('')}</tr>`;

  const tbl = document.createElement('section');
  tbl.innerHTML = `<h3 class="bar-title" style="margin-top:2rem">数値の比較（最新期）</h3>
    <div class="table-wrap"><table class="data compare"><thead><tr><th class="l sticky-col">指標</th>${head}</tr></thead><tbody>${body}${patternRow}</tbody></table></div>
    <p class="muted small">売上の前期比は、前期の有価証券報告書が公開データにあり、同じ区分の収益で比べられるときだけ表示します。</p>
    <h3 class="bar-title" style="margin-top:2rem">次に見る</h3>
    <ul>
      <li><a href="${ctx.link('trend', { tc: codes.join(',') })}">この${codes.length}社の財務の推移を、重ねて見る →</a></li>
      <li><a href="${ctx.link('valuation', { m: 'co', co: codes.join(','), x: 'roe', y: 'per', lab: '1' })}">ROE と PER の散布図で、この${codes.length}社の位置を見る →</a></li>
      <li><a href="${ctx.link('', {})}">条件から、比べる会社を探し直す →</a></li>
    </ul>`;
  out.appendChild(tbl);

  // ── 関連する連載記事（ブログ）
  const BLOG = 'https://minnanosaiban.github.io/tomo/blog/posts/';
  const articles = [
    ['01-03_xbrl_to_json', '決算 XBRL を JSON に変換', '有報の数値を JSON にして、元売3社を比べた回（ROE・自己資本比率）'],
    ['02-02_multifactor_scoreboard', 'マルチファクタースコア', '7軸で「全方位の優等生」を探す回（財務の軸）'],
    ['02-03_accrual_analysis', 'アクルーアル分析', '利益にキャッシュの裏付けがあるかを見る回（純利益率と営業CF）'],
    ['02-01_garp_peg_roe', '4象限で GARP を見る', 'ROE と PER で、成長と割安の両立を探す回'],
    ['02-05_segment_analysis', 'セグメント分析', '連結に埋もれた強い事業を、セグメントで探す回'],
    ['02-06_segment_core_stocks', 'コングロマリット・ディスカウント', '総合商社・ＥＮＥＯＳを、セグメントで読み解く回'],
    ['02-08_enterprise_value', 'EVで見る「会社の値段」', '株価に借金を足した会社の値段を、営業CF・FCFと見比べる回'],
  ];
  const rel = document.createElement('section');
  rel.innerHTML = `<h3 class="bar-title" style="margin-top:2rem">連載記事で、数値の読み方を知る</h3>
    <p class="muted small">利益率・ROE・自己資本比率の見方や、会社どうしの比べ方を、ブログ連載「株価分析」で解説しています。</p>
    <ul>${articles.map(([slug, t, d]) => `<li><a href="${BLOG}${slug}/" target="_blank" rel="noopener">「${esc(t)}」を読む →</a><span class="muted small">　${esc(d)}</span></li>`).join('')}</ul>`;
  out.appendChild(rel);
}
