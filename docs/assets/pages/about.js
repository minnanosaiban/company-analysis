// データと注意（出典・加工・制約）。
import { esc } from '../lib/fields.js';

export async function render(root, ctx) {
  const { meta, companies } = ctx.data;
  const nonCons = companies.filter((c) => !c.c).length;
  const noSeg = companies.filter((c) => !c.g).length;
  root.innerHTML = `
    <h1 class="page-title">データと注意</h1>
    <p class="page-lead">このサイトのデータの出どころと、見るときの注意です。</p>

    <h2>データの出どころ</h2>
    <p>金融庁の <a href="https://disclosure2.edinet-fsa.go.jp/" target="_blank" rel="noopener">EDINET</a> に提出された有価証券報告書です。
      対象は東証の主要企業 ${companies.length.toLocaleString()}社、データの更新日は ${esc(meta.updated)} です。有報は年1回なので、更新は年に数回です。</p>

    <h2>加工について</h2>
    <p>有価証券報告書（XBRL）から、財務指標と事業セグメントを抽出・変換し、集計・分類・図表化しています（加工者：minnanosaiban）。
      政府が作成した情報そのものではなく、元の提出書類と異なる場合があります。正確な内容は、各社の有価証券報告書をご確認ください。</p>
    <p class="muted small">出典の表記：
      <a href="https://disclosure2.edinet-fsa.go.jp/" target="_blank" rel="noopener">EDINET閲覧（提出）サイト</a>、
      <a href="https://www.digital.go.jp/resources/open_data/public_data_license_v1.0" target="_blank" rel="noopener">公共データ利用規約（第1.0版）</a>。
      <a href="https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html" target="_blank" rel="noopener">EDINET 利用規約</a>。</p>

    <h2>見るときの注意</h2>
    <ul>
      <li><b>連結と個別</b>：連結財務諸表を作らない会社（${nonCons}社）は、個別財務諸表の数値です。連結の会社とは基準が異なるため、「個別」と表示しています。</li>
      <li><b>金融業</b>：銀行・保険・証券は、売上の定義が一般の会社と異なり、「売上」が空欄になります。</li>
      <li><b>会計基準</b>：日本基準・IFRS・米国基準が混在します。項目の定義が少しずつ異なるため、比べるときは基準にも注意してください。</li>
      <li><b>決算期</b>：決算期は会社ごとに異なります（3月決算が多数）。「最新期」は、会社ごとの直近の有報です。</li>
      <li><b>セグメント</b>：セグメント情報がない会社が ${noSeg}社あります。名称の日本語ラベルが整っていない会社は、英字のキーを区切って表示します。</li>
      <li><b>PER・ROE・自己資本比率など</b>は、有報の「主要な経営指標等」の値です。株価から計算した値ではありません。</li>
    </ul>

    <h2>ご注意</h2>
    <p>投資の助言ではありません。投資判断はご自身の責任でお願いします。このサイトは、株価データを使っていません。</p>

    <h2>コードとデータ</h2>
    <p>コード（MIT ライセンス）とデータは、<a href="https://github.com/minnanosaiban/company-analysis" target="_blank" rel="noopener">GitHub</a> で公開しています。
      ブログ連載「<a href="https://minnanosaiban.github.io/tomo/blog/" target="_blank" rel="noopener">株価分析</a>」の関連サイトです。</p>`;
}
