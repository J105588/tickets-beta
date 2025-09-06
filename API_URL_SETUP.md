# API URL 分散設定ガイド

## 概要
API通信の使用数上限を回避するため、複数のGoogle Apps Script URLを分散して使用する機能を実装しました。

## 機能
- **ランダム選択**: ページ読み込み時にランダムにURLを選択
- **定期ローテーション**: 5分間隔でURLを自動切り替え
- **フェイルオーバー**: エラー時に次のURLに自動切り替え
- **手動切り替え**: コンソールから手動でURLを変更可能

## 設定方法

### 1. 複数のGAS URLを準備
Google Apps Scriptで同じコードを複数のプロジェクトにデプロイし、それぞれのURLを取得します。

### 2. config.jsの設定
```javascript
// 複数のAPI URL（使用数上限回避のため分散）
const GAS_API_URLS = [
  "https://script.google.com/macros/s/AKfycbyxIY4S3npd0-v45_2EWqPn-uLTjwQlNlUCWUl7rztSIFjyIX2mxKERUoEM411kPHAQ/exec",
  "https://script.google.com/macros/s/AKfycbNEW_URL_1/exec",
  "https://script.google.com/macros/s/AKfycbNEW_URL_2/exec",
  "https://script.google.com/macros/s/AKfycbNEW_URL_3/exec"
];
```

### 3. ローテーション間隔の調整
```javascript
// 5分間隔でローテーション（必要に応じて調整）
this.rotationInterval = 5 * 60 * 1000; // 5分
```

## 使用方法

### 自動機能
- ページ読み込み時にランダムにURLを選択
- 5分間隔で自動的にURLをローテーション
- エラー時に次のURLに自動切り替え

### 手動操作（ブラウザコンソール）
```javascript
// 現在のURL情報を確認
SeatApp.urlInfo()

// ランダムにURLを選択
SeatApp.selectRandomUrl()

// 利用可能なURL一覧を表示
SeatApp.getAllUrls()
```

## 監視機能

### UI表示
- 画面右上に現在のURL番号を表示（例：API URL: 2/4）
- 更新ボタンで手動でURL情報を更新可能

### コンソールログ
```
[API URL Manager] 初期URL選択: 2/4
[API URL Manager] URLローテーション: 2 → 3
[API URL Manager] ランダム選択: 3 → 1
```

## トラブルシューティング

### URLが切り替わらない場合
1. コンソールで `SeatApp.urlInfo()` を実行して現在の状態を確認
2. `SeatApp.selectRandomUrl()` で手動切り替えを試行
3. ブラウザを再読み込み

### エラーが続く場合
1. `SeatApp.getAllUrls()` でURL一覧を確認
2. 各URLが正しく設定されているか確認
3. ネットワーク接続を確認

## 注意事項

### セキュリティ
- 全てのURLは同じコードベースを使用してください
- パスワードやAPIキーは各デプロイで統一してください

### パフォーマンス
- ローテーション間隔は適切に設定してください（短すぎると効果が薄い）
- 複数のURLを準備することで負荷分散効果が向上します

### メンテナンス
- 定期的にURLの有効性を確認してください
- 新しいURLを追加する際は、既存のURLも維持してください

## 推奨設定

### 本番環境
- 3-5個のURLを準備
- 5-10分間隔でローテーション
- 各URLは異なるGoogleアカウントでデプロイ

### テスト環境
- 2-3個のURLを準備
- 1-2分間隔でローテーション
- 同一アカウントでも問題なし

## 更新履歴
- 2025/09/06: 初回実装
- URL管理システムの追加
- 自動ローテーション機能の実装
- UI表示機能の追加
