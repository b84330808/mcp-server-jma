# mcp-server-jma

> **気象庁（JMA）の防災情報を扱う MCP サーバー** — 天気予報、警報・注意報、地震（地域ごとの震度つき）、津波、火山の情報を返します。地名は漢字・かな・ローマ字のどれでも指定できます。API キーは不要です。

[![CI](https://github.com/b84330808/mcp-server-jma/actions/workflows/ci.yml/badge.svg)](https://github.com/b84330808/mcp-server-jma/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io)

[English](README.md) · **日本語**

---

## 何をするか

気象庁は [www.jma.go.jp/bosai](https://www.jma.go.jp/bosai/) の裏で予報・警報・地震情報を JSON で配信していますが、
6〜7 桁のエリアコードで引く必要があり、天気や警報は数値コードで、1 つの地震が複数の電文に分かれています。
このサーバーがその手間を引き受けるので、LLM は「札幌に警報は出てる？」「今朝の地震、千葉ではどのくらい揺れた？」に
ツール 1 回で答えられます。

- **どの表記の地名でも** — `渋谷区`・`しぶや`・`シブヤ`・`Shibuya`・`1311300` はすべて気象庁の `area.json` で解決します。
- **コードを読み替え** — 天気コードは気象庁自身の日本語・英語表記に、警報コードは名称・重要度・警戒レベルに変換します。
- **2026年5月28日からの新しい防災気象情報に対応** — 警報は新しいフィード（`warning/data/r8/`）と新設の「危険警報」（警戒レベル4）に移行しました。電文種別ごとの最新報をまとめて「いま発表中のもの」を返します。
- **行儀のよいクライアント** — 応答をキャッシュし（予報 10 分、警報 2 分、地震・津波一覧 1 分、エリア表 24 時間）、同時の同一リクエストは 1 回の取得にまとめ、すべてのリクエストに `User-Agent: mcp-server-jma/<version> (+https://github.com/b84330808/mcp-server-jma)` を付けます。

## ツール

| ツール | 返すもの |
|---|---|
| `jma_find_area` | 地名（漢字・かな・ローマ字）またはコードに合う気象庁エリアを順位つきで返します。階層（office = 府県予報区 / class10 = 一次細分区域 / class15 / class20 = 市区町村 / center = 地方）、上位の経路、予報・警報に使う `office_code`。 |
| `jma_get_forecast` | 今日から 3 日分の細分区域ごとの予報（天気文、英語ラベル、風、波、6 時間ごとの降水確率 %、地点ごとの最低・最高気温 °C）と週間予報（天気、降水確率 %、信頼度 A/B/C、気温と予測範囲、平年値）、予報官の天気概況。 |
| `jma_get_warnings` | 発表中の警報・注意報：名称（日・英）、重要度（`advisory` 注意報 / `warning` 警報 / `urgent_warning` 危険警報 / `emergency_warning` 特別警報）、警戒レベル 2〜5（該当するもののみ）、付加事項（竜巻・ひょう など）、対象の細分区域・市町村、気象庁の見出し文。 |
| `jma_list_earthquakes` | 最近の地震（新しい順）：発生時刻、震源（日・英、緯度経度、深さ km）、マグニチュード、最大震度、都道府県ごとの最大震度、`detail_id`。絞り込み：`min_intensity`・`min_magnitude`・`since_hours`・`limit`。 |
| `jma_get_earthquake` | 1 つの地震の詳細：震源、マグニチュード、津波に関する付加文（日・英）、都道府県 → 地域 → 市町村ごとの震度（強い順）、必要なら観測点ごとの震度と座標。 |
| `jma_get_tsunami` | 最近の事象ごとの最新の津波電文：発表中かどうか、最も高い区分（`major_warning` 大津波警報 / `warning` 津波警報 / `advisory` 津波注意報 / `forecast` 津波予報）、区分ごとの沿岸区域と予想される最大波の高さ（m）・第1波の到達時刻、観測値、震源。 |
| `jma_get_volcano_warnings` | 噴火警報フィードに載っている火山：噴火警戒レベル 1〜5、発表内容、引上げ・引下げ、対象市町村、防災対応、座標。火山名（`桜島`・`Sakurajima`）で絞り込み可。 |

応答はすべて `{ "success": true, "data": …, "note": …, "attribution": "出典：気象庁ホームページ …" }` 形式の JSON です。
エラーは `{ "success": false, "error": { "code", "message" } }` で、コードは `AREA_NOT_FOUND`、`AREA_TOO_BROAD`
（例：`北海道` — 選べる府県予報区を一覧で返します）、`EVENT_NOT_FOUND`、`NOT_FOUND`、`UPSTREAM_TIMEOUT`、`UPSTREAM_ERROR` などです。

**単位**：気温 °C ・降水確率 % ・7 日間降水量の平年値 mm ・深さ km ・津波の高さ m ・マグニチュードは気象庁マグニチュード（Mj）・震度は気象庁震度階級（`1`〜`4`、`5-` 5弱、`5+` 5強、`6-` 6弱、`6+` 6強、`7`）・時刻はすべて日本時間（`+09:00`）。

## 実際の出力

`npm run smoke`（ビルドしたサーバーを stdio で起動し、本物の気象庁エンドポイントに問い合わせる）の 2026-10-27 16:12 JST の実際の出力は [README.md の Live output](README.md#live-output) にあります。

## インストール

### Claude Desktop

`claude_desktop_config.json` に追加します
（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`、Windows：`%APPDATA%\Claude\claude_desktop_config.json`）。

```json
{
  "mcpServers": {
    "jma": {
      "command": "npx",
      "args": ["-y", "github:b84330808/mcp-server-jma"]
    }
  }
}
```

Claude Desktop を再起動してください。npm に公開された後は `"args": ["-y", "mcp-server-jma"]` でも動きます。

### Claude Code

```bash
claude mcp add jma -- npx -y github:b84330808/mcp-server-jma
```

### ソースから

```bash
git clone https://github.com/b84330808/mcp-server-jma.git
cd mcp-server-jma
npm install
npm run build
```

```json
{
  "mcpServers": {
    "jma": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-jma/dist/index.js"]
    }
  }
}
```

### 質問の例

- 「明日の札幌の天気は？」
- 「渋谷区にいま警報は出ている？」
- 「今朝の地震、千葉ではどのくらい揺れた？」
- 「津波警報は出ている？」
- 「桜島の噴火警戒レベルは？」

## データの出典と利用条件

- **出典：気象庁ホームページ**（[www.jma.go.jp](https://www.jma.go.jp/)）。すべての応答にこの出典表示と、対応する気象庁ページの `source_url` が入っています。データを表示・再配布するときは出典を残してください。
- 気象庁のコンテンツは [気象庁ホームページ利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html)（政府標準利用規約 第2.0版に準拠、CC BY 4.0 互換）に従って提供されています。加工した場合はその旨を示し、気象庁が作成したものであるかのように見せないでください。
- **非公式のエンドポイントで、SLA はありません。** `bosai` の JSON は気象庁のウェブページ自身が読み込んでいるファイルで、公開されていますが文書化された API ではありません。予告なく変更・廃止されることがあります（警報は 2026年5月28日に変わりました）。ツールが `NOT_FOUND` や空のデータを返すようになったら、気象庁の該当ページを確認し、issue を立ててください。
- このサーバーは気象庁とは無関係で、気象庁が認めたものでもありません。命に関わる判断は、気象庁・自治体・放送の情報に直接従ってください。

使っているエンドポイントとキャッシュ時間は [README.md](README.md#data-source-and-terms) を参照してください。

## 開発

```bash
npm install
npm run lint     # 型チェック
npm test         # 記録済みフィクスチャ（tests/fixtures、2026-10-27 記録）での単体テスト
npm run build
npm run smoke    # 気象庁への実際の問い合わせ（ネットワーク使用）
```

## ライセンス

MIT — [LICENSE](LICENSE) を参照。データの権利は気象庁にあります（上の「データの出典と利用条件」を参照）。
