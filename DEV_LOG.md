# PUENTE seaside house — 開発記録

> 開発者: Claude Sonnet 4.6 / オーナー: Katsuhiko Tanaka  
> リポジトリ: https://github.com/2ndbro-spec/puente-seasidehouse  
> 本番URL: https://puente-seasidehouse.com

---

## 2026-05-09（Session 1）

### 概要
予約システムの方針決定 → Phase 0・1 の実装完了

---

### 現状確認

既存サイトは Eleventy（11ty）製の静的サイト5ページ構成。予約ページにはGoogleフォームの仮置きがある状態。現時点でオーナーのInstagramアカウントで予約受付しており、抜け漏れ・属人化が課題。

---

### 🔴 オーナーの判断・決断

#### ① RESERVA 却下 → フルカスタム実装を選択
- **背景**: 予約管理ツールとして RESERVA を候補に挙げたが、調査の結果 webhook 非対応が判明
- **判断**: webhook なしでは n8n との連携・LINE通知が実現できないため却下
- **決断**: Netlify Functions + Supabase によるフルカスタム実装に切り替え

#### ② 自動化ツールに既存の n8n を使う
- **背景**: Make / Zapier を提案したが
- **判断**: Hostinger で既にセルフホスト Docker の n8n を運用中。新しいツールを増やすより既存資産を使う
- **決断**: n8n（Hostinger）を採用

#### ③ BBQ・ロッカーシャワーの料金・仕様決定
| 項目 | BBQ | ロッカーシャワー |
|------|-----|----------------|
| 料金 | ¥8,000/人（税込） | ¥2,000/人（税込） |
| 最小人数 | 2名 | 1名 |
| 最大人数 | 100名 | 30名（ロッカー数は70） |
| 1日定員 | 50名（同時間帯での上限） | 30名/日 |
| 時間制 | 2時間制、30分刻みスロット | 1日単位 |
| 営業時間 | 11:00〜20:00 | — |
| 飲み放題 | あり（1種類、価格は後日設定） | なし |

- **備考**: 在庫モデルの違いを明確化。BBQ は「同時間帯に被らなければ複数組OK」。L/S は「1日単位の上限管理」

#### ④ 決済は現地払いに統一
- オンライン決済は不要。当日スタッフに支払う形式

#### ⑤ 本予約・仮予約の両対応
- 仮予約は3日以内に本予約へ変更する運用

#### ⑥ CMS のスマホ対応はそのまま
- Decap CMS のスマホ対応改善を提案したが「そのままでいい」と判断

---

### 実装内容

#### Phase 0 — 基盤整備
- **CMS管理者追加**: `hayato19811008@gmail.com` を Netlify Identity で招待
- **Supabaseプロジェクト作成**: 東京リージョン（$10/月プラン、オーナーOK）
  - プロジェクトID: `rwptdctdiubxjqklogza`
- **DBスキーマ設計・マイグレーション実行**:
  - `menus` — メニューマスタ（BBQ / ロッカーシャワー）
  - `menu_addons` — オプション（飲み放題）
  - `inventory` — 日別・スロット別在庫
  - `reservations` — 予約データ
  - `reservation_addons` — 予約とオプションの中間テーブル
- **初期データ投入**:
  - BBQ: ¥8,000、2〜100名、11:00〜20:00、スロット120分・30分刻み、デフォルト50名
  - ロッカーシャワー: ¥2,000、1〜30名、スロットなし（1日単位）、デフォルト30名
  - 飲み放題アドオン: ¥0（価格未定につき仮置き）

#### Phase 1 — 予約システムMVP
- **Netlify Functions 3本**:
  - `/api/menus` — アクティブなメニュー一覧をアドオン付きで返す
  - `/api/availability` — 日付・メニューごとの残枠チェック（BBQはスロット別、L/Sは日別）
  - `/api/reserve` — 予約登録（在庫チェック → 挿入 → 予約番号返却）
- **予約フォームUI** (`src/js/reservation.js`):
  - メニュータブ切り替え（BBQ / ロッカーシャワー）
  - 日付選択 → リアルタイム残枠表示
  - BBQ: 時間帯スロット選択・人数・オプション
  - L/S: 男女別人数・チェックイン予定時間
  - 本予約 / 仮予約ラジオボタン
  - 確認画面 → 送信 → 完了画面
  - QRコード生成（QRCode.js）
- **Netlify デプロイ**:
  - `netlify.toml` に Functions 設定追加
  - `package.json` に `@supabase/supabase-js` 追加
  - Netlify 環境変数設定: `SUPABASE_URL`、`SUPABASE_ANON_KEY`

---

## 2026-05-10（Session 2）

### 概要
バグ修正 → UIブラッシュアップ → ドメイン設定 → Phase 2（LINE通知）完了

---

### バグ修正

#### ① `/api/*` ルーティングエラー（優先度: 高）
- **原因**: `netlify.toml` に `/api/*` → `/.netlify/functions/:splat` のリダイレクトルールが未設定
- **発覚**: デプロイ後に「メニュー情報を読み込めませんでした」エラー
- **修正**: `netlify.toml` に `[[redirects]]` 追加

#### ② `.hidden` クラス未定義（優先度: 高）
- **原因**: `style.css` に `.hidden { display: none }` が定義されておらず、BBQ/L/Sフィールドの表示切り替えが機能しない
- **発覚**: ロッカーシャワータブ選択中にBBQフィールドが表示される
- **修正**: `style.css` 冒頭に `.hidden { display: none !important; }` 追加

---

### 🔴 オーナーの判断・決断

#### ⑦ LINE ID 入力欄を「通知方法選択」UIに変更
- **背景**: LINE ID を直接入力させる UI だったが
- **提案内容**: ① LINE ID 入力のまま、② 友だち追加ボタンのみ、③ 通知方法選択（LINE/メール）
- **判断・要望**:
  - 「基本的にはLINEに集めたいというのが理想」
  - LINEを選んだら友だち追加ボタンを表示する形にしたい
- **決断**: 通知方法ラジオボタン（LINE推奨 / メールのみ）+ LINE選択時に友だち追加CTAボックスを表示

#### ⑧ LINE公式アカウントURLの確定
- `https://lin.ee/7boYnzG`
- `site.json` に設定 → サイト全体のLINEボタンに反映

#### ⑨ ドメインを puente-seasidehouse.com に決定
- **管理**: エックスサーバー（お名前.com での取得試みがエラー → エックスサーバーで取得）
- **DNS設定**: Xserver で A レコード・CNAME レコードを設定、Netlify 側でカスタムドメイン登録

---

### 実装内容

#### UIブラッシュアップ
- LINE ID 入力欄 → 通知方法選択（LINE推奨 / メールのみ）
- LINE 選択時: 緑の「LINE 友だち追加 →」ボタン＋説明文 (`line-cta-box`)
- 予約完了画面: LINE 選択者にのみ友だち追加 CTA を再表示
- `notif_channel` カラムを `reservations` テーブルに追加（`'line'` or `'email'`）

#### ドメイン設定
- `puente-seasidehouse.com` → Netlify Edge で配信確認
- `www.puente-seasidehouse.com` → `puente-seasidehouse.com` に 301 リダイレクト

#### 確認メール送信（Resend）
- `resend` パッケージを `package.json` に追加
- `reserve.js` に `buildConfirmationEmail()` 関数追加
- 予約完了後に自動送信（件名・予約番号・仮予約期限・LINE CTA を含む HTML メール）
- **注記**: Resend ドメイン認証（DNS反映）完了まで送信は待機状態

#### プライバシーポリシー・利用規約ページ
- LINE Messaging API 登録に必要なため先行作成
- `/privacy.html`、`/terms.html` を追加
- フッターにリンクを追加

#### LINE Messaging API 設定
- Webhook URL: `https://puente-seasidehouse.com/api/line-webhook`
- Netlify 環境変数: `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`

#### LINE webhook 実装（`netlify/functions/line-webhook.js`）
- LINE 署名検証（`x-line-signature` ヘッダー）
- 予約番号（8桁英数字）を受信 → Supabase で検索
- 予約が見つかれば `line_user_id` を紐付け保存
- 予約内容を含む確認メッセージを返信
- **テスト結果**: 正常動作確認（予約番号 `BCD02A12` で検証）

#### n8n 前日リマインダーワークフロー
- ファイル: `n8n-workflows/puente-reminder.json`（インポート可能な JSON 形式）
- 構成（5ノード）: Schedule Trigger → Code（翌日日付計算）→ HTTP Request（Supabase）→ Code（メッセージ組み立て）→ HTTP Request（LINE Push）
- スケジュール: 毎日 UTC 0:00（= JST 9:00）
- 対象: 翌日に予約があり `line_user_id` が紐付いているすべての予約
- **オーナー作業**: n8n にインポート → Activate（完了確認済み、エラーなし）

---

---

## 2026-05-11（Session 3）

### 概要
Phase 3（仮予約フロー）完了 — 自動期限切れ・リマインダー・お客様自身での本予約変更

---

### 実装内容

#### n8n ワークフロー2本（`n8n-workflows/` に追加）

**① 仮予約自動期限切れ** (`puente-expire-pending.json`)
- Schedule: 毎日 UTC 0:00（JST 9:00）
- Supabase に PATCH リクエスト: `status=pending` かつ `provisional_expires_at < now()` → `status='expired'`
- ノード構成: Schedule → Code（現在時刻取得）→ HTTP PATCH（Supabase）→ Code（件数ログ）

**② 仮予約期限3日前リマインダー** (`puente-pending-reminder.json`)
- Schedule: 毎日 UTC 0:00（JST 9:00）
- JST で「3日後」の日付範囲を計算し、その範囲内に `provisional_expires_at` がある `pending` 予約を取得
- `line_user_id` があるものに `/confirm.html` の URL 付きで LINE Push 送信
- ノード構成: Schedule → Code（日付範囲計算）→ HTTP GET（Supabase）→ Code（メッセージ組み立て）→ HTTP POST（LINE Push）

#### `/api/confirm-reservation`（`netlify/functions/confirm-reservation.js`）
- POST: `{ reservation_code, email }` → 予約コード+メールで認証
- ステータスチェック: 既に `confirmed` / `expired` / `cancelled` の場合は適切なエラーを返す
- `status='confirmed'`、`provisional_expires_at=null` に更新
- 本予約確定メール（Resend）を自動送信

#### `/confirm.html`（`src/confirm.njk`）
- 予約番号（8文字）＋メールアドレス入力フォーム
- クライアントサイドバリデーション（8文字チェック・メール形式チェック）
- API 呼び出し → 成功時は予約番号・名前・日付・メニューを表示する完了画面に切り替え
- エラー時はインラインでエラーメッセージを表示

### 動作確認
- `/confirm.html` UI: バリデーションエラー表示を確認済み
- n8n: 2ワークフローともインポート・Activate 完了（オーナー確認済み）
- Netlify: git push → 自動デプロイ済み

---

---

## 2026-05-11（Session 4）

### 概要
Phase 4（スタッフ管理画面）完了

---

### 実装内容

#### Supabase マイグレーション
- `reservations` テーブルに `checked_in_at timestamptz` カラム追加

#### Netlify Functions（3本追加）

**`staff-reservations.js`** → `/api/staff-reservations`
- GET `?date=YYYY-MM-DD` + `x-staff-password` ヘッダー認証
- confirmed/pending 予約を時刻順で返却、BBQ/L/S 別合計人数をサマリーに含める

**`staff-capacity.js`** → `/api/staff-capacity`
- GET: 指定日の在庫一覧（メニュー + inventory テーブル）
- POST: 定員を upsert（在庫テーブルに日別上書き）

**`staff-checkin.js`** → `/api/staff-checkin`
- POST `{ reservation_code }` + パスワード認証
- 当日チェック・二重チェックイン防止・仮予約ガード
- `checked_in_at` を現在時刻に更新

#### `/staff.html`（`src/staff.njk`）スタッフ管理 SPA
- **ログイン画面**: パスワード入力 → API 認証 → sessionStorage に保持
- **予約一覧タブ**: 日付ナビゲーション（‹ 今日 ›）、BBQ/L/S/合計サマリー、予約カード（本予約・仮予約・CI済 を左ボーダー色で識別、LINE連携状態表示）
- **残枠調整タブ**: メニューごとに定員を数値入力 → 保存ボタンで即時更新
- **チェックインタブ**: jsQR でカメラ QR スキャン（バックカメラ優先）+ 予約番号手入力の2WAY、結果をカード表示（✅/❌/⚠️）
- `noindex,nofollow` メタタグ設定（検索エンジン除外）
- モバイルファースト CSS（グローバルナビなし、スタッフ専用 UI）

#### Netlify 環境変数
- `STAFF_PASSWORD` を Netlify に設定済み（functions スコープ、シークレット）

---

## 次回以降の予定

### 残タスク
- Resend ドメイン認証完了確認（DNS反映待ち）
- 飲み放題の料金設定（DB: menu_addons の price が ¥0 仮置き）
- APIキーのローテーション（LINE / Resend がセッション中にチャットへ露出）

### 残タスク
- Resend ドメイン認証完了確認（DNS反映待ち）
- 飲み放題の料金設定
- Resend / LINE / Netlify の API キーのローテーション（チャットに露出したため）

---

## 環境・認証情報メモ（概要のみ）

| サービス | 用途 | 備考 |
|---------|------|------|
| Netlify | ホスティング・Functions | サイトID: `1e7c8c16-...` |
| Supabase | DB | プロジェクトID: `rwptdctdiubxjqklogza`（東京） |
| Resend | メール配信 | ドメイン認証DNS反映待ち |
| LINE Messaging API | プッシュ通知・webhook | Channel ID: `2010037132` |
| n8n | 自動化 | Hostinger セルフホスト |
| エックスサーバー | DNS管理 | `puente-seasidehouse.com` |

> ⚠️ 実際のAPIキー・トークン類はセッション中にチャットへ入力されています。動作確認後に各サービスでローテーションを推奨します。
