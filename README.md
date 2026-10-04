# 企業分析

東証の主要企業（約500社）の**有価証券報告書**（EDINET）をもとに、企業を探し、セグメント・財務指標・キャッシュフローを比べられるアプリです。
ブログ連載「[株価分析](https://minnanosaiban.github.io/tomo/blog/)」の関連アプリです。

次の2つの版があり、**同じデータ**を使います。

| 版 | 場所 | 特徴 |
|---|---|---|
| **静的サイト版**（主） | `docs/` | サーバー不要。ブラウザだけで動き、スリープしない。スマホ対応、ダーク対応。条件を URL で共有でき、ブログに埋め込める |
| Python（Streamlit）版 | `app.py`・`views/`・`lib/` | 手元で動かしたい人向け |

## 静的サイト版の画面

| ページ | ルート | 内容 |
|---|---|---|
| 企業を探す | `#/` | 業種・会計基準・連結/個別・数値の範囲・CFの符号・CFパターンで絞り込み。並べ替え、CSV で保存。結果を各図で見られる |
| バリュエーション散布図 | `#/valuation` | 財務指標を2軸でプロット。業種で色分け、中央値、外れ値の除外、会社の強調 |
| CFパターン | `#/cashflow` | 営業・投資・財務CFの符号で8パターンに分類。業種別の構成、少数の会社なら5期の軌跡 |
| 業界ポートフォリオ | `#/portfolio` | 会社ごとのセグメント別利益を Treemap で並べる |
| セグメント推移 | `#/segments` | 1社のセグメント別の推移を、小さなグラフで並べる |
| データと注意 | `#/about` | 出典・加工・見るときの注意 |

どのページも、「対象の会社」を、**おすすめ（商社・石油13社）／業種／会社を検索して選ぶ／全社**から選べます。
選んだ内容と条件は URL に入るので、そのまま共有できます（例：`#/valuation?m=ind&ind=卸売業&x=roe&y=per`）。
`?embed=1` を付けると、ヘッダを省いた埋め込み用の表示になります（出典の表示は残ります）。

### 手元で動かす

ビルドは不要です。`docs/` を、どの Web サーバーでも配信できます。

```bash
cd docs
python -m http.server 8000
# → http://localhost:8000/ を開く
```

## Python（Streamlit）版

Python 3.10 以上が必要です。

```bash
pip install -r requirements.txt
streamlit run app.py
```

## データについて

- 元データは、金融庁の **EDINET** に提出された有価証券報告書です。
- `data/yuho/<EDINETコード>/` の JSON は、その XBRL から必要な項目（財務指標・事業セグメント）を抽出・変換したものです。
- `data/companies.csv`・`data/financials.csv.gz`、`docs/data/` の JSON は、上の JSON から作った集計です。
  会社名・業種（東証33業種）は、東証の銘柄一覧にもとづきます。
- 元の提出書類と異なる場合があります。正確な内容は各社の有価証券報告書をご確認ください。
- **個別財務諸表のみ**の会社（連結を作成しない会社）には、注記を出しています。連結の会社とは基準が異なります。
- 金融（銀行・保険・証券）は、売上の定義が一般の会社と異なるため、「売上」が空欄になります。
- セグメント名は、日本語の名称が未整備の会社では、英字のキーを区切って表示しています。

## 構成

```
docs/                  静的サイト版（GitHub Pages の公開ルート）
  assets/lib/          データ読み込み・絞り込み・CFパターン・図のデータ処理（画面に依存しない部分）
  assets/pages/        各ページ
  assets/vendor/       Apache ECharts（同梱）
  data/                会社一覧・財務指標・会社別セグメントの JSON
app.py / views/ / lib/ Python（Streamlit）版（フォルダ名を pages/ にしないこと。直接リンクで出典の表示が抜けるため）
data/                  同梱データ（有報 JSON 497社、会社一覧、財務指標）
tests/                 静的サイト版のテスト
DESIGN.md              静的サイト版の設計書
```

### テスト

絞り込み・CFパターン・選択・検索・図のデータ処理を、Python 側（pandas、Streamlit 版の実装）で別に計算した期待値と照合します。

```bash
node tests/logic.test.mjs     # 絞り込み・CFパターン・選択・検索
node tests/charts.test.mjs    # Treemap・セグメント推移・外れ値の範囲
```

期待値の作り直し：`python tests/make_expected.py`、`python tests/make_expected_charts.py`

## 出典・ライセンス

- **出典**：[EDINET閲覧（提出）サイト](https://disclosure2.edinet-fsa.go.jp/)、
  [公共データ利用規約（第1.0版）](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)
- **加工**：上記データを minnanosaiban が抽出・変換・集計・図表化しています。
  政府が作成した情報そのものではありません（[EDINET 利用規約](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html)）。
- **コード**：MIT ライセンス（[LICENSE](LICENSE)）
- **データ**（`data/`、`docs/data/`）：公共データ利用規約（第1.0版）に従います。
- **Apache ECharts**（`docs/assets/vendor/`）：Apache License 2.0（[LICENSE](docs/assets/vendor/LICENSE-echarts.txt)）

## 注意

- 投資の助言ではありません。投資判断はご自身の責任でお願いします。
- このアプリは株価データを使いません。
