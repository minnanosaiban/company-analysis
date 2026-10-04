// セグメント推移: 1社を選び、セグメントごとの推移を小さなグラフで並べる。
import { esc } from '../lib/fields.js?v=87b5bdf733';
import { loadSegments } from '../lib/data.js?v=87b5bdf733';
import { optionsHtml } from '../lib/ui_common.js?v=87b5bdf733';
import { loadECharts, mountChart, themeColors } from '../lib/charts.js?v=87b5bdf733';
import { availableMetrics, segmentSeries, METRIC_LABEL } from '../lib/chartdata.js?v=87b5bdf733';
import { searchCompanies } from '../lib/selection.js?v=87b5bdf733';

const DEFAULT_COMPANY = 'E02529';   // 三菱商事（初期表示）

export async function render(root, ctx) {
  const { data, params } = ctx;
  await loadECharts();

  const pool = data.companies.filter((c) => c.g);
  const ed = pool.some((c) => c.e === params.get('sc')) ? params.get('sc')
    : (pool.some((c) => c.e === DEFAULT_COMPANY) ? DEFAULT_COMPANY : pool[0].e);
  const company = data.byE.get(ed);
  const sind = params.get('sind') || '';
  const nPeriods = Math.min(8, Math.max(2, parseInt(params.get('n') || '5', 10) || 5));
  const kind = params.get('kind') === 'line' ? 'line' : 'bar';
  const sortBy = params.get('ss') === 'name' ? 'name' : 'latest';

  const segData = await loadSegments(data, ed);
  const avail = availableMetrics(segData);
  const metric = avail.includes(params.get('mt')) ? params.get('mt') : avail[0];

  const industries = [...new Set(pool.map((c) => c.i))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
  const listed = (sind ? pool.filter((c) => c.i === sind) : pool).sort((a, b) => a.s.localeCompare(b.s));

  root.innerHTML = `
    <h1 class="page-title">セグメント推移</h1>
    <p class="page-lead">1社を選ぶと、その会社の事業セグメントごとの推移を、小さなグラフで並べます。事業の構成の変化が見えます。</p>
    <section class="selector">
      <h3 class="bar-title">会社を選ぶ</h3>
      <div class="ctl-row">
        <div><label for="s-ind">業種で絞り込み</label>
          <select id="s-ind"><option value="">すべて（${pool.length}社）</option>${industries.map((i) => `<option value="${esc(i)}" ${i === sind ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></div>
        <div><label for="s-co">会社（${listed.length}社）</label>
          <select id="s-co" style="width:min(22rem,100%)">${listed.map((c) => `<option value="${esc(c.e)}" ${c.e === ed ? 'selected' : ''}>${esc(c.n)}（${esc(c.s)}）</option>`).join('')}</select></div>
        <div style="flex:1;min-width:14rem"><label for="s-q">名前・コードで検索</label>
          <input id="s-q" type="search" placeholder="例: 三井物産 / 8031" autocomplete="off" style="width:min(22rem,100%)">
          <ul class="suggest" id="s-sug" hidden></ul></div>
      </div>
      <p class="selected-count">${esc(company.n)}（${esc(company.s)}）／ ${esc(company.i)} ／ ${esc(company.a)} ／ ${company.c ? '連結' : '個別財務諸表のみ'}</p>
    </section>
    <details class="panel" open><summary>表示設定</summary><div class="panel-body" id="ctl"></div></details>
    <div id="out"></div>`;

  // ── 会社の選択
  const root$ = (s) => root.querySelector(s);
  root$('#s-ind').addEventListener('change', (e) => ctx.update({ sind: e.target.value }));
  root$('#s-co').addEventListener('change', (e) => ctx.update({ sc: e.target.value, mt: '' }));
  const q = root$('#s-q'); const sug = root$('#s-sug');
  q.addEventListener('input', () => {
    const hits = searchCompanies(data, q.value, 40).filter((c) => c.g).slice(0, 10);
    sug.innerHTML = hits.map((c) => `<li><button type="button" data-sc="${esc(c.e)}">${esc(c.n)}<span class="muted small">　${esc(c.s)}・${esc(c.i)}</span></button></li>`).join('');
    sug.hidden = hits.length === 0;
    sug.querySelectorAll('[data-sc]').forEach((b) => b.addEventListener('click', () => ctx.update({ sc: b.dataset.sc, mt: '', sind: '' })));
  });
  q.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const f = sug.querySelector('[data-sc]'); if (f) { ev.preventDefault(); f.click(); } } });

  const out = root$('#out');
  if (!avail.length) {
    root$('#ctl').innerHTML = '';
    out.innerHTML = '<div class="empty">この会社には、表示できるセグメント指標がありません。</div>';
    return;
  }

  // ── 表示設定
  const ctl = root$('#ctl');
  ctl.innerHTML = `
    <div class="ctl-row">
      <div><label for="c-mt">指標（この会社に値がある指標）</label><select id="c-mt">${optionsHtml(avail.map((k) => [k, METRIC_LABEL[k]]), metric)}</select></div>
      <div><label for="c-n">表示期数</label><select id="c-n">${[2, 3, 4, 5, 6, 7, 8].map((i) => `<option value="${i}" ${i === nPeriods ? 'selected' : ''}>${i}期</option>`).join('')}</select></div>
      <div><label for="c-k">チャート</label><select id="c-k">${optionsHtml([['bar', '棒グラフ'], ['line', '折れ線']], kind)}</select></div>
      <div><label for="c-s">並び順</label><select id="c-s">${optionsHtml([['latest', '最新値の大きい順'], ['name', 'セグメント名']], sortBy)}</select></div>
    </div>`;
  ctl.querySelector('#c-mt').addEventListener('change', (e) => ctx.update({ mt: e.target.value }));
  ctl.querySelector('#c-n').addEventListener('change', (e) => ctx.update({ n: e.target.value === '5' ? '' : e.target.value }));
  ctl.querySelector('#c-k').addEventListener('change', (e) => ctx.update({ kind: e.target.value === 'bar' ? '' : e.target.value }));
  ctl.querySelector('#c-s').addEventListener('change', (e) => ctx.update({ ss: e.target.value === 'latest' ? '' : e.target.value }));

  // ── 小さな図の一覧
  const res = segmentSeries(segData, metric, nPeriods, sortBy);
  const tc = themeColors();
  const noLabel = res.series.filter((s) => s.nl).length;
  out.innerHTML = `
    <h2 style="margin-top:2rem">${esc(company.n)} ― ${esc(METRIC_LABEL[metric])}（億円・${nPeriods}期）</h2>
    ${noLabel ? `<p class="tag-note">ℹ ${noLabel}件のセグメントは、日本語の名称が未整備のため、英字のキーを区切って表示しています。</p>` : ''}
    <div class="chart-sm-grid" id="grid"></div>
    <details class="panel"><summary>数値テーブル（億円）</summary><div class="panel-body"><div class="table-wrap"><table class="data"><thead><tr><th class="l">セグメント</th>
      ${res.fys.map((f) => `<th>${esc(f.slice(0, 7))}</th>`).join('')}</tr></thead><tbody>
      ${res.series.map((s) => `<tr><td class="l name">${esc(s.name)}</td>${s.values.map((v) => `<td class="${v !== null && v < 0 ? 'neg' : ''}">${v === null ? '-' : (v / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div></details>`;

  const grid = out.querySelector('#grid');
  res.series.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<h3>${esc(s.name)}</h3><div class="sm"></div>`;
    grid.appendChild(card);
    const oku = s.values.map((v) => (v === null ? null : v / 1e8));
    const hasNeg = oku.some((v) => v !== null && v < 0);
    const base = hasNeg ? tc.warn : tc.accent;
    const fmt = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('ja-JP', { maximumFractionDigits: 0 }));
    mountChart(card.querySelector('.sm'), {
      grid: { left: 52, right: 14, top: 22, bottom: 30 },
      tooltip: { trigger: 'axis', formatter: (ps) => `${esc(s.name)}<br>FY ${esc(String(ps[0].axisValue).slice(0, 7))}：${fmt(ps[0].value)}億円` },
      xAxis: { type: 'category', data: res.fys.map((f) => f.slice(0, 7)), axisLabel: { color: tc.muted, fontSize: 10, rotate: 30 }, axisLine: { lineStyle: { color: tc.line } } },
      yAxis: { type: 'value', axisLabel: { color: tc.muted, fontSize: 10, formatter: (v) => v.toLocaleString('ja-JP') }, splitLine: { lineStyle: { color: tc.line } } },
      series: [kind === 'bar'
        ? { type: 'bar', data: oku.map((v) => ({ value: v, itemStyle: { color: v !== null && v < 0 ? tc.warn : tc.accent } })), label: { show: true, position: 'top', fontSize: 10, color: tc.fg, formatter: (p) => fmt(p.value) }, barCategoryGap: '30%' }
        : { type: 'line', data: oku, symbolSize: 7, itemStyle: { color: base }, lineStyle: { color: base, width: 2 }, markLine: { silent: true, symbol: 'none', lineStyle: { color: tc.muted, opacity: 0.4, width: 0.7 }, label: { show: false }, data: [{ yAxis: 0 }] } }],
    }, { height: 200 });
  });

  // ── 次に見る
  const peers = pool.filter((c) => c.i === company.i && c.e !== ed).sort((a, b) => a.s.localeCompare(b.s)).slice(0, 2).map((c) => c.e);
  const next = document.createElement('section');
  next.innerHTML = `<h3 class="bar-title" style="margin-top:2rem">次に見る</h3>
    <ul>
      <li><a href="${ctx.link('trend', { tc: ed })}">${esc(company.n)}の財務（売上・利益・CF など）の推移を見る →</a></li>
      <li><a href="${ctx.link('compare', { cc: [ed, ...peers].join(',') })}">${esc(company.n)}を、${peers.length ? '同じ業種の会社と' : '他の会社と'}比べる →</a></li>
    </ul>`;
  out.appendChild(next);
}
