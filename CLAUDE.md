# PUENTE seaside house — Claude Code ルール

## プロジェクト概要
逗子海岸の美容特化海の家「PUENTE seaside house」の公式サイト。
HTML / CSS / JavaScript の静的サイト（5ページ構成）。

## ファイル構成
```
index.html     — TOPページ
story.html     — PUENTEの想い（ブランドストーリー）
amenity.html   — アメニティ＆スポンサー
owner.html     — オーナー＆スタッフ
reserve.html   — 予約・料金・アクセス
css/style.css  — 全ページ共通スタイル
js/main.js     — 共通JavaScript
images/        — 写真素材
```

## コンテンツ更新ルール

### 編集ポイントの見つけ方
HTML内の `<!-- EDIT: ○○ -->` コメントが編集箇所の目印。
詳細は `CONTENT_GUIDE.md` を参照。

### 写真の扱い
- 写真は `images/` フォルダに配置
- ファイル名にスペースが含まれる場合、HTMLの src では `%20` にエンコードする
- 写真の使用状況は `CONTENT_GUIDE.md` の「写真素材マップ」を参照
- 写真を差し替えたら `CONTENT_GUIDE.md` の写真マップも更新する

### ヘッダー・フッターの変更
ヘッダーとフッターは4ページすべてに同じ内容がある。
変更時は **全5ファイルを同時に更新** すること。

### カラーパレット
CSS変数で管理（`css/style.css` 冒頭の `:root`）。
変更する場合は変数値を変えるだけで全体に反映される。

## デザイン仕様
- Mobile First レスポンシブ（768px / 1024px ブレークポイント）
- 最大コンテンツ幅 1200px
- フォント: Playfair Display / Noto Serif JP / Noto Sans JP / Cormorant Garamond
- 角丸: カード 12px / ボタン 8px / バッジ 4px

## デプロイ
静的サイト。ローカルプレビューは `python3 -m http.server 8080` で確認可能。
本番は Vercel または Netlify にデプロイ予定。

## ⚠️ デザイン修正の必須ワークフロー

**デザイン・CSS・HTML・JSの変更は、コミット＆プッシュの前に必ずローカルdevサーバーで確認すること。**

### 手順（この順番を守ること）
1. ファイルを編集
2. `npm run build` でビルド
3. `python3 -m http.server 8080 --directory _site` でdevサーバー起動（バックグラウンド）
4. `http://localhost:8080` で該当ページを実際に目視確認
5. 問題なければ `git commit` → `git push`
6. Netlifyへの手動デプロイ（自動デプロイが機能しない場合）

### devサーバー起動コマンド
```bash
# バックグラウンド起動
python3 -m http.server 8080 --directory _site &

# 停止
kill $(lsof -ti:8080)
```

> この手順を省略してコミット・プッシュしてはならない。
