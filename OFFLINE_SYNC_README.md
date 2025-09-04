# オフライン同期システム v2.0 - 完全再設計版

## 概要

オフライン同期システム v2.0は、座席管理システムのオフライン操作を確実にGAS（Google Apps Script）に同期するための堅牢なシステムです。

## 主な特徴

### 1. 確実な同期保証
- オフライン時の操作をローカルストレージに永続化
- オンライン復帰時に自動的にGASに同期
- 操作の順序性と整合性を保証
- 競合状態の自動解決

### 2. 高度なエラーハンドリング
- 最大5回のリトライ機能
- 詳細なエラーログとデバッグ情報
- ユーザーフレンドリーなエラー通知
- 部分的な同期失敗時の適切な処理

### 3. スマートな同期戦略
- 操作の優先度付け（予約 > チェックイン > 更新）
- バックグラウンド同期による自動処理
- ページ可視性に応じた同期タイミング
- 前提条件の検証による競合防止

### 4. リアルタイム状態表示
- オンライン/オフライン状態の視覚的表示
- 同期進行状況のリアルタイム表示
- キューの状況と操作の詳細表示
- 成功/失敗通知の自動表示

## システム構成

### ファイル構成
```
offline-sync-v2.js      # メインのオフライン同期システム
offline-sync-v2.css     # オフライン同期用のスタイル
seats.html             # 座席管理ページ（統合済み）
seats-main.js          # 座席管理のメインロジック（統合済み）
```

### クラス構成
- `OfflineOperationManager`: オフライン操作の管理
- 操作キューの管理
- 同期状態の管理
- エラーハンドリング

## 使用方法

### 1. 基本的な使用方法
システムは自動的に動作し、ユーザーの操作を監視します：

```javascript
// オフライン時の操作は自動的にキューに追加されます
const response = await GasAPI.reserveSeats(group, day, timeslot, seats);
// オフライン時は { success: true, message: 'オフラインで予約を受け付けました', offline: true } が返されます
```

### 2. 手動同期
必要に応じて手動で同期を実行できます：

```javascript
// 今すぐ同期を実行
OfflineSyncV2.sync();

// キューの状況を確認
OfflineSyncV2.showQueueStatus();

// システム状態を確認
const status = OfflineSyncV2.getStatus();
```

### 3. デバッグ機能
開発者向けのデバッグ機能を提供：

```javascript
// システム状態の詳細表示
OfflineSyncV2.debug();

// キューの内容を確認
const queue = OfflineSyncV2.getQueue();

// キャッシュ情報を確認
const cache = OfflineSyncV2.getCache();
```

## 設定

### 設定可能なパラメータ
```javascript
const OFFLINE_CONFIG = {
  ENABLED: true,                    // オフライン機能の有効/無効
  SYNC_INTERVAL_MS: 15000,         // 同期間隔（15秒）
  MAX_RETRY_COUNT: 5,              // 最大リトライ回数
  RETRY_DELAY_MS: 3000,            // リトライ間隔（3秒）
  MAX_QUEUE_SIZE: 1000,            // キュー最大サイズ
  SYNC_TIMEOUT_MS: 60000,          // 同期タイムアウト（60秒）
  BACKGROUND_SYNC_INTERVAL: 30000, // バックグラウンド同期間隔（30秒）
  CACHE_EXPIRY_MS: 300000         // キャッシュ有効期限（5分）
};
```

## 対応操作

### 1. 座席予約
- `reserveSeats`: 座席の予約
- 最高優先度で処理

### 2. チェックイン
- `checkInMultipleSeats`: 複数座席のチェックイン
- 高優先度で処理

### 3. 座席データ更新
- `updateSeatData`: 座席データの更新
- 中優先度で処理

### 4. 当日券発行
- `assignWalkInSeats`: 当日券の座席割り当て
- `assignWalkInConsecutiveSeats`: 連続席の当日券割り当て
- 低優先度で処理

## エラーハンドリング

### 1. ネットワークエラー
- 自動リトライ（最大5回）
- 指数バックオフによるリトライ間隔調整
- ユーザーへの適切な通知

### 2. 競合状態
- 前提条件の検証
- 最新データの自動取得
- 競合解決後の再試行

### 3. 部分的な失敗
- 成功した操作の確定
- 失敗した操作の再試行
- 詳細なエラー情報の提供

## パフォーマンス最適化

### 1. 効率的な同期
- 操作のバッチ処理
- 優先度に基づく処理順序
- 不要な同期の回避

### 2. メモリ管理
- キューサイズの制限
- 古い操作の自動削除
- キャッシュの有効期限管理

### 3. ネットワーク最適化
- 最小限のデータ転送
- 接続状態の監視
- 適切なタイミングでの同期

## セキュリティ

### 1. データ保護
- ローカルストレージの暗号化（必要に応じて）
- 機密情報の適切な処理
- セッション管理

### 2. 操作の検証
- 操作の整合性チェック
- 不正な操作の防止
- ログによる監査

## トラブルシューティング

### 1. よくある問題

#### 同期が完了しない
```javascript
// キューの状況を確認
OfflineSyncV2.showQueueStatus();

// 手動で同期を実行
OfflineSyncV2.sync();
```

#### オフライン操作が反映されない
```javascript
// システム状態を確認
const status = OfflineSyncV2.getStatus();
console.log('同期状態:', status);

// キャッシュをクリア
OfflineSyncV2.clearCache();
```

#### エラーが頻繁に発生する
```javascript
// 詳細なデバッグ情報を確認
OfflineSyncV2.debug();

// ネットワーク接続を確認
console.log('オンライン状態:', navigator.onLine);
```

### 2. ログの確認
ブラウザの開発者ツールのコンソールで詳細なログを確認できます：

```
[OfflineSync] オフライン同期システム v2.0 を初期化中...
[OfflineSync] 初期化完了
[OfflineSync] オフライン操作を追加: reserveSeats (ID: op_1234567890_abc123)
[OfflineSync] 3件の操作を同期開始
[OfflineSync] 成功: reserveSeats (ID: op_1234567890_abc123)
[OfflineSync] 同期完了: {processed: 3, remaining: 0, errors: 0, conflicts: 0}
```

## 今後の拡張予定

### 1. 機能拡張
- 複数デバイス間の同期
- オフライン時の高度な検証
- リアルタイム通知システム

### 2. パフォーマンス向上
- Web Workers による並列処理
- IndexedDB による大容量データ対応
- Service Worker によるバックグラウンド同期

### 3. ユーザビリティ向上
- 同期状況の詳細表示
- 操作履歴の管理
- カスタマイズ可能な設定

## 技術仕様

### 1. 対応ブラウザ
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### 2. 必要な機能
- localStorage 対応
- Promise 対応
- async/await 対応
- ES6+ 対応

### 3. 依存関係
- GasAPI（Google Apps Script API）
- 設定ファイル（config.js）

## ライセンス

このシステムは既存のプロジェクトの一部として提供されています。

## サポート

問題や質問がある場合は、開発チームまでお問い合わせください。
