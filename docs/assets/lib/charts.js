// ECharts の読み込みと、図の作成・片付け。ライブラリは docs/assets/vendor/ に同梱（外部の CDN には依存しない）。

import { mergeChartOption } from './chartdata.js?v=60a1ba03e6';

let loading = null;
const instances = new Set();

export function loadECharts() {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'assets/vendor/echarts.min.js';
      s.onload = () => resolve(window.echarts);
      s.onerror = () => { loading = null; reject(new Error('図のライブラリを読み込めませんでした')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 現在のテーマ（ライト／ダーク）の色。 */
export function themeColors() {
  return { fg: css('--fg'), muted: css('--muted'), line: css('--line'), bg: css('--bg'), surface: css('--surface'), accent: css('--accent'), warn: css('--warn') };
}

/** すべての図に共通の設定（文字・ツールチップの色）。 */
export function baseOption() {
  const c = themeColors();
  return {
    textStyle: { fontFamily: '"Noto Sans JP", system-ui, sans-serif', color: c.fg },
    tooltip: { confine: true, backgroundColor: c.surface, borderColor: c.line, textStyle: { color: c.fg, fontSize: 12 } },
    // 凡例が長くてページ送りになるときの、矢印・ページ番号の色
    legend: { pageTextStyle: { color: c.muted }, pageIconColor: c.fg, pageIconInactiveColor: c.line },
    animation: false,
  };
}

/** el に図を作る。ページを描き直すときは disposeAll() で片付ける。 */
export function mountChart(el, option, { height = 420 } = {}) {
  el.style.height = `${height}px`;
  const chart = window.echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption(mergeChartOption(baseOption(), option));
  instances.add(chart);
  return chart;
}

export function disposeAll() {
  instances.forEach((c) => c.dispose());
  instances.clear();
}

window.addEventListener('resize', () => instances.forEach((c) => c.resize()));
