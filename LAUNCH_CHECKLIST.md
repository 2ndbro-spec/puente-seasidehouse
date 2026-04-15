# PUENTE seaside house リリースチェックリスト

最終更新: 2026-04-15

---

## 現状: 約75〜80%完成

---

## STEP 1: コンテンツの穴を埋める（オーナー対応）

### 1-1. スタッフ情報を入れる【必須】
- **対象:** `owner.html` 93〜114行目
- **現状:** 4名分すべて「スタッフ名」「一言コメントが入ります」のまま
- **必要な情報（4名分）:**
  - [ ] スタッフ名
  - [ ] 一言コメント
  - [ ] Instagram URL（あれば）

### 1-2. 予約用 Google フォームを作成【必須】
- **対象:** `reserve.html` 61行目
- **現状:** `YOUR_FORM_ID` のプレースホルダーのまま（コメントアウト）
- **やること:**
  - [ ] Google フォームを作成（名前・日付・人数・メニューなど）
  - [ ] フォームの埋め込み URL を取得
  - [ ] Claude に URL を共有 → HTMLに反映

### 1-3. LINE 公式アカウントの設定【必須】
- **対象:** `reserve.html` 69行目、全ページのフッター
- **現状:** `https://line.me/` の汎用リンクのまま
- **やること:**
  - [ ] LINE 公式アカウントを開設
  - [ ] 友だち追加 URL を取得
  - [ ] QR コード画像を `images/` に保存
  - [ ] Claude に共有 → 全5ファイルに反映

### 1-4. SNS・地図リンクの設定【必須】
- **対象:** 全5ファイルのフッター（`index.html` `story.html` `amenity.html` `owner.html` `reserve.html`）
- **現状:** Instagram / Google Maps がすべて汎用 URL
- **必要な情報:**
  - [ ] Instagram プロフィール URL（例: `https://www.instagram.com/puente_seasidehouse/`）
  - [ ] Google Maps の URL（例: `https://maps.app.goo.gl/xxxxx`）

### 1-5. クラウドファンディングのリンク（任意）
- **対象:** `story.html` 242行目
- **現状:** 「クラウドファンディングページへのリンクはオープン後に掲載予定」の注記
- **やること:**
  - [ ] CAMPFIRE 等のページが公開されたら URL を共有

---

## STEP 2: 技術的な修正（Claude 対応可）

### 2-1. CSS アニメーション追加
- **対象:** `css/style.css`
- **内容:** JS が付与する `.reveal` `.revealed` `.scrolled` クラスに対応する CSS が未定義
- **影響:** スクロール時のフェードインアニメーションが動作していない
- [ ] 対応済み

### 2-2. favicon の追加
- **対象:** 全5ファイルの `<head>`
- **現状:** favicon の指定なし（ブラウザタブにアイコンが出ない）
- **やること:**
  - [ ] favicon 画像を用意（ロゴ等）
  - [ ] 全ページに `<link rel="icon">` を追加

### 2-3. OGP 画像の作成（SNS シェア用）
- **対象:** `images/ogp-top.jpg` 他5ファイル分
- **現状:** HTMLでは参照しているがファイルが存在しない
- **必要なファイル（各 1200x630px）:**
  - [ ] `images/ogp-top.jpg`
  - [ ] `images/ogp-story.jpg`
  - [ ] `images/ogp-amenity.jpg`
  - [ ] `images/ogp-owner.jpg`
  - [ ] `images/ogp-reserve.jpg`
- **影響:** SNS でシェアしたときにサムネイルが表示されない

### 2-4. SEO ファイルの作成
- [ ] `robots.txt` — 検索エンジンのクロール許可設定
- [ ] `sitemap.xml` — 全5ページのURL一覧（Google に認識してもらう）

---

## STEP 3: 集客インフラの整備（オーナー対応）

### 3-1. Google Analytics (GA4) の設定
- **対象:** `index.html` 21行目（コメントアウト中）
- **やること:**
  - [ ] Google Analytics でプロパティを作成
  - [ ] 測定 ID（`G-XXXXXXXXXX`）を取得
  - [ ] Claude に共有 → 全ページに反映・コメントアウト解除

### 3-2. Google Search Console への登録
- **やること:**
  - [ ] サイト公開後に Google Search Console に URL を登録
  - [ ] sitemap.xml を送信
  - [ ] 検索結果への表示を確認

### 3-3. 独自ドメインの取得（任意）
- **やること:**
  - [ ] ドメインを取得（例: `puente-seasidehouse.com`）
  - [ ] デプロイ先（Netlify / Vercel）で DNS 設定
  - [ ] SSL 証明書の確認（通常は自動）

---

## STEP 4: デプロイ・公開（Claude 対応可）

### 4-1. ホスティングサービスにデプロイ
- **候補:** Netlify / Vercel（どちらも無料プランあり）
- **やること:**
  - [ ] デプロイ設定ファイルの作成
  - [ ] Git リポジトリと連携
  - [ ] 初回デプロイ・動作確認
  - [ ] 独自ドメインの紐付け（取得済みの場合）

### 4-2. 公開前の最終チェック
- [ ] 全ページの表示確認（スマホ・PC）
- [ ] 全リンクの動作確認
- [ ] 予約フォームのテスト送信
- [ ] OGP 画像の表示確認（SNS シェアテスト）
- [ ] Google PageSpeed Insights でパフォーマンス確認

---

## 対応の優先順位まとめ

```
【最優先】STEP 1（コンテンツ） → STEP 2（技術修正） → STEP 4（デプロイ）
【並行可】STEP 3（集客インフラ）は公開後でもOK
```

STEP 1 の情報が揃い次第、STEP 2〜4 は Claude がまとめて対応可能。
