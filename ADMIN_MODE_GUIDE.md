# 管理者モード完全操作ガイド

## 目次
1. [システム概要](#システム概要)
2. [管理者モードの種類](#管理者モードの種類)
3. [アクセス方法](#アクセス方法)
4. [基本操作](#基本操作)
5. [オフライン同期システム](#オフライン同期システム)
6. [競合解決と通知システム](#競合解決と通知システム)
7. [エラー対応とトラブルシューティング](#エラー対応とトラブルシューティング)
8. [システム設定とカスタマイズ](#システム設定とカスタマイズ)
9. [パフォーマンス最適化](#パフォーマンス最適化)
10. [セキュリティとバックアップ](#セキュリティとバックアップ)

---

## システム概要

### チケット管理システムの構成
- **フロントエンド**: HTML5 + JavaScript (PWA対応)
- **バックエンド**: Google Apps Script (GAS)
- **データベース**: Google スプレッドシート
- **オフライン対応**: Service Worker + IndexedDB
- **同期システム**: リアルタイム + バックグラウンド同期

### 主要機能
- 座席予約管理
- 当日券割り当て
- チェックイン処理
- オフライン操作対応
- 複数端末同期
- 競合解決システム

---

## 管理者モードの種類

### 1. 最高管理者モード (Super Admin)
**権限**: 全機能アクセス + システム設定変更

**特徴**:
- 全スプレッドシートへのアクセス
- 競合通知の受信
- システム設定の変更
- 他管理者の権限管理
- ログの閲覧・削除

**識別方法**:
```javascript
// ブラウザコンソールで確認
console.log('Current Mode:', window.currentMode);
// 出力: "superadmin"
```

### 2. 一般管理者モード (Admin)
**権限**: 基本管理機能 + 限定された設定変更

**特徴**:
- 指定されたスプレッドシートへのアクセス
- 座席管理・予約管理
- 当日券割り当て
- 基本レポート生成

**識別方法**:
```javascript
console.log('Current Mode:', window.currentMode);
// 出力: "admin"
```

### 3. オペレーターモード (Operator)
**権限**: 基本操作のみ

**特徴**:
- 座席予約の確認
- チェックイン処理
- 当日券の基本操作

---

## アクセス方法

### 最高管理者モードへのアクセス

1. **URLパラメータ方式**:
   ```
   https://your-domain.com/index.html?mode=superadmin&key=YOUR_SECRET_KEY
   ```

2. **設定ファイル方式**:
   `config.js` を編集:
   ```javascript
   const ADMIN_CONFIG = {
     MODE: 'superadmin',
     SECRET_KEY: 'your-secret-key',
     ENABLE_DEBUG: true
   };
   ```

3. **ローカルストレージ方式**:
   ```javascript
   // ブラウザコンソールで実行
   localStorage.setItem('admin_mode', 'superadmin');
   localStorage.setItem('admin_key', 'your-secret-key');
   location.reload();
   ```

### 認証の確認
```javascript
// 現在の認証状態を確認
if (window.currentMode === 'superadmin') {
  console.log('最高管理者モードで動作中');
} else {
  console.log('一般モードで動作中');
}
```

---

## 基本操作

### 座席データの管理

#### 座席データの取得
```javascript
// 特定の座席データを取得
const seatData = await GasAPI.getSeatDataMinimal(group, day, timeslot);

// 全座席データを取得
const allSeats = await GasAPI.getAllSeatData();
```

#### 座席の予約
```javascript
// 座席を予約
const result = await GasAPI.reserveSeats(group, day, timeslot, seatNumbers, customerInfo);

if (result.success) {
  console.log('予約成功:', result.data);
} else {
  console.error('予約失敗:', result.error);
}
```

#### チェックイン処理
```javascript
// 複数座席のチェックイン
const checkInResult = await GasAPI.checkInMultipleSeats(group, day, timeslot, seatNumbers);

if (checkInResult.success) {
  console.log('チェックイン完了');
} else {
  console.error('チェックイン失敗:', checkInResult.error);
}
```

### 当日券の管理

#### 当日券の割り当て
```javascript
// 連続座席の割り当て
const walkinResult = await GasAPI.assignWalkInConsecutiveSeats(
  group, day, timeslot, seatCount, customerInfo
);

// 個別座席の割り当て
const individualResult = await GasAPI.assignWalkInSeats(
  group, day, timeslot, seatNumbers, customerInfo
);
```

### データの確認と検索

#### 予約状況の確認
```javascript
// 特定時間帯の予約状況
const reservations = await GasAPI.getReservationsByTimeSlot(group, day, timeslot);

// 顧客情報での検索
const customerReservations = await GasAPI.searchReservationsByCustomer(customerName);
```

#### レポートの生成
```javascript
// 日次レポート
const dailyReport = await GasAPI.generateDailyReport(date);

// 売上レポート
const salesReport = await GasAPI.generateSalesReport(startDate, endDate);
```

---

## オフライン同期システム

### システムの動作原理

#### オンライン時
1. **リアルタイム同期**: 操作は即座にサーバーに送信
2. **バックグラウンド同期**: 15秒間隔で未同期データをチェック
3. **データプリフェッチ**: 座席データを事前取得・キャッシュ

#### オフライン時
1. **ローカル操作**: 操作はローカルキューに保存
2. **キャッシュ利用**: 事前取得されたデータで表示
3. **自動同期**: オンライン復帰時に自動同期

### 同期状態の確認

#### 同期状況の表示
```javascript
// 同期状態を確認
const syncState = offlineOperationManager.getSyncState();
console.log('同期状態:', syncState);

// 未同期操作の確認
const pendingOps = offlineOperationManager.readOperationQueue();
console.log('未同期操作数:', pendingOps.length);
```

#### 手動同期の実行
```javascript
// 手動で同期を実行
await offlineOperationManager.performSync();

// 特定の操作のみ同期
await offlineOperationManager.syncSpecificOperations(operationIds);
```

### オフライン操作の管理

#### 操作の追加
```javascript
// 座席予約操作を追加
const operation = {
  type: 'reserveSeats',
  group: 'A',
  day: '2024-01-15',
  timeslot: '10:00',
  seatNumbers: ['A1', 'A2'],
  customerInfo: {
    name: '田中太郎',
    phone: '090-1234-5678'
  }
};

offlineOperationManager.addOperation(operation);
```

#### 操作の確認と編集
```javascript
// 操作キューを表示
const queue = offlineOperationManager.readOperationQueue();
console.table(queue);

// 特定の操作を削除
offlineOperationManager.removeOperation(operationId);

// 操作の優先度を変更
offlineOperationManager.updateOperationPriority(operationId, newPriority);
```

---

## 競合解決と通知システム

### 競合の種類と原因

#### 1. データ競合
**原因**: 複数端末で同じ座席を同時に操作
**例**: 端末Aと端末Bで同じ座席を予約

#### 2. バージョン競合
**原因**: データの更新タイミングのずれ
**例**: 座席データが更新される前に古いデータで操作

#### 3. ネットワーク競合
**原因**: オフライン操作の同期タイミング
**例**: オフラインで操作したデータが同期時に競合

### 競合解決の流れ

#### 自動解決
1. **競合検出**: 同期時に競合を自動検出
2. **優先度判定**: 操作の優先度で解決方法を決定
3. **データ統合**: 最新データを基準に統合
4. **通知送信**: 管理者に競合発生を通知

#### 手動解決
```javascript
// 競合を手動で解決
const conflicts = await offlineOperationManager.getConflicts();
for (const conflict of conflicts) {
  const resolution = await offlineOperationManager.resolveConflict(conflict);
  console.log('競合解決結果:', resolution);
}
```

### 通知システム

#### 競合通知の受信
最高管理者モードでは、競合発生時に以下の通知を受信:

1. **画面上の通知**: 右上に警告カードが表示
2. **サーバー通知**: 他の管理者端末にも配信
3. **ログ記録**: 操作ログに詳細を記録

#### 通知の設定
```javascript
// 通知設定の確認
const noticeConfig = offlineOperationManager.getNoticeConfig();
console.log('通知設定:', noticeConfig);

// 通知の有効/無効
offlineOperationManager.setNoticeEnabled(true);
offlineOperationManager.setNoticeSoundEnabled(false);
```

---

## エラー対応とトラブルシューティング

### よくあるエラーと解決方法

#### 1. 接続エラー
**症状**: "GasAPI未準備" エラーが表示される

**原因**:
- ネットワーク接続の問題
- GASスクリプトの実行エラー
- 認証の問題

**解決方法**:
```javascript
// 接続状態を確認
console.log('オンライン状態:', navigator.onLine);

// GAS接続をテスト
try {
  const testResult = await GasAPI.testApi();
  console.log('GAS接続テスト:', testResult);
} catch (error) {
  console.error('GAS接続エラー:', error);
}

// 手動で再接続
await offlineOperationManager.reconnectGasAPI();
```

#### 2. 同期エラー
**症状**: オフライン操作が同期されない

**原因**:
- データの競合
- ネットワークの不安定
- サーバー側のエラー

**解決方法**:
```javascript
// 同期状態を確認
const syncState = offlineOperationManager.getSyncState();
console.log('同期状態:', syncState);

// エラーログを確認
const errorLog = offlineOperationManager.getErrorLog();
console.log('エラーログ:', errorLog);

// 手動で同期を再試行
await offlineOperationManager.retrySync();
```

#### 3. データ不整合
**症状**: 表示されるデータが正しくない

**原因**:
- キャッシュの問題
- 同期の失敗
- データベースの破損

**解決方法**:
```javascript
// キャッシュをクリア
offlineOperationManager.clearCache();

// データを再取得
await offlineOperationManager.refreshAllData();

// データの整合性をチェック
const integrityCheck = await offlineOperationManager.checkDataIntegrity();
console.log('データ整合性:', integrityCheck);
```

#### 4. メモリ不足エラー (iOS)
**症状**: アプリが重くなる、クラッシュする

**原因**:
- 大量のデータキャッシュ
- メモリリーク
- iOSのメモリ制限

**解決方法**:
```javascript
// メモリクリーンアップを実行
offlineOperationManager.performMemoryCleanup();

// キャッシュサイズを確認
const cacheSize = offlineOperationManager.getCacheSize();
console.log('キャッシュサイズ:', cacheSize);

// 古いデータを削除
offlineOperationManager.cleanOldData();
```

### デバッグモードの有効化

#### デバッグログの有効化
```javascript
// デバッグモードを有効化
localStorage.setItem('debug_mode', 'true');
localStorage.setItem('debug_level', 'verbose');

// ページを再読み込み
location.reload();
```

#### ログの確認
```javascript
// 詳細ログを確認
const debugLog = offlineOperationManager.getDebugLog();
console.log('デバッグログ:', debugLog);

// 特定の操作のログを確認
const operationLog = offlineOperationManager.getOperationLog(operationId);
console.log('操作ログ:', operationLog);
```

### 緊急時の対応

#### システムのリセット
```javascript
// 全データをリセット（注意: データが失われます）
if (confirm('本当に全データをリセットしますか？')) {
  await offlineOperationManager.resetAllData();
  location.reload();
}
```

#### バックアップからの復元
```javascript
// バックアップデータを復元
const backupData = JSON.parse(localStorage.getItem('backup_data'));
await offlineOperationManager.restoreFromBackup(backupData);
```

---

## システム設定とカスタマイズ

### 基本設定

#### 同期間隔の調整
```javascript
// 同期間隔を変更（ミリ秒）
offlineOperationManager.setSyncInterval(10000); // 10秒

// バックグラウンド同期間隔を変更
offlineOperationManager.setBackgroundSyncInterval(15000); // 15秒
```

#### キャッシュ設定
```javascript
// キャッシュ有効期限を変更（ミリ秒）
offlineOperationManager.setCacheExpiry(300000); // 5分

// 最大キャッシュサイズを変更
offlineOperationManager.setMaxCacheSize(100); // 100件
```

### 通知設定

#### 通知のカスタマイズ
```javascript
// 通知の表示時間を変更
offlineOperationManager.setNotificationDuration(5000); // 5秒

// 通知音の有効/無効
offlineOperationManager.setNotificationSound(false);

// 通知の位置を変更
offlineOperationManager.setNotificationPosition('top-left');
```

### 権限設定

#### 管理者権限の管理
```javascript
// 新しい管理者を追加
const newAdmin = {
  id: 'admin_001',
  name: '管理者A',
  permissions: ['read', 'write', 'delete'],
  spreadsheetAccess: ['sheet1', 'sheet2']
};

await offlineOperationManager.addAdmin(newAdmin);

// 管理者権限を更新
await offlineOperationManager.updateAdminPermissions('admin_001', {
  permissions: ['read', 'write'],
  spreadsheetAccess: ['sheet1']
});
```

---

## パフォーマンス最適化

### メモリ使用量の最適化

#### キャッシュの最適化
```javascript
// 不要なキャッシュを削除
offlineOperationManager.cleanUnusedCache();

// キャッシュサイズを監視
setInterval(() => {
  const cacheSize = offlineOperationManager.getCacheSize();
  if (cacheSize > 1000) {
    offlineOperationManager.performMemoryCleanup();
  }
}, 60000); // 1分ごと
```

#### データの圧縮
```javascript
// データを圧縮して保存
offlineOperationManager.enableDataCompression(true);

// 圧縮レベルを設定
offlineOperationManager.setCompressionLevel(6); // 1-9の範囲
```

### ネットワーク最適化

#### バッチ処理の設定
```javascript
// バッチサイズを調整
offlineOperationManager.setBatchSize(5); // 5件ずつ処理

// バッチ間隔を調整
offlineOperationManager.setBatchInterval(2000); // 2秒間隔
```

#### プリフェッチの設定
```javascript
// プリフェッチを有効化
offlineOperationManager.enablePrefetch(true);

// プリフェッチ対象を設定
offlineOperationManager.setPrefetchTargets(['seats', 'reservations']);
```

---

## セキュリティとバックアップ

### データの保護

#### 暗号化の設定
```javascript
// データの暗号化を有効化
offlineOperationManager.enableEncryption(true);

// 暗号化キーを設定
offlineOperationManager.setEncryptionKey('your-encryption-key');
```

#### アクセス制御
```javascript
// IPアドレス制限を設定
offlineOperationManager.setAllowedIPs(['192.168.1.0/24', '10.0.0.0/8']);

// セッションタイムアウトを設定
offlineOperationManager.setSessionTimeout(3600000); // 1時間
```

### バックアップシステム

#### 自動バックアップの設定
```javascript
// 自動バックアップを有効化
offlineOperationManager.enableAutoBackup(true);

// バックアップ間隔を設定
offlineOperationManager.setBackupInterval(3600000); // 1時間ごと

// バックアップ保持期間を設定
offlineOperationManager.setBackupRetention(7); // 7日間保持
```

#### 手動バックアップ
```javascript
// 現在のデータをバックアップ
const backupData = await offlineOperationManager.createBackup();
console.log('バックアップデータ:', backupData);

// バックアップをダウンロード
offlineOperationManager.downloadBackup(backupData, 'backup_' + new Date().toISOString() + '.json');
```

#### バックアップからの復元
```javascript
// バックアップファイルをアップロード
const fileInput = document.getElementById('backup-file');
const file = fileInput.files[0];
const backupData = JSON.parse(await file.text());

// バックアップから復元
await offlineOperationManager.restoreFromBackup(backupData);
```

---

## 監視とログ

### システム監視

#### パフォーマンス監視
```javascript
// システムパフォーマンスを監視
const performance = offlineOperationManager.getPerformanceMetrics();
console.log('パフォーマンス:', performance);

// メモリ使用量を監視
const memoryUsage = offlineOperationManager.getMemoryUsage();
console.log('メモリ使用量:', memoryUsage);
```

#### エラー監視
```javascript
// エラー率を監視
const errorRate = offlineOperationManager.getErrorRate();
console.log('エラー率:', errorRate);

// エラーの詳細を確認
const errors = offlineOperationManager.getRecentErrors(10);
console.log('最近のエラー:', errors);
```

### ログ管理

#### ログの確認
```javascript
// 全ログを確認
const allLogs = offlineOperationManager.getAllLogs();
console.log('全ログ:', allLogs);

// 特定の期間のログを確認
const logs = offlineOperationManager.getLogsByDateRange(startDate, endDate);
console.log('期間ログ:', logs);
```

#### ログのエクスポート
```javascript
// ログをCSV形式でエクスポート
const csvLogs = offlineOperationManager.exportLogsAsCSV();
console.log('CSVログ:', csvLogs);

// ログをJSON形式でエクスポート
const jsonLogs = offlineOperationManager.exportLogsAsJSON();
console.log('JSONログ:', jsonLogs);
```

---

## 緊急時対応手順

### システムダウン時の対応

1. **状況確認**
   ```javascript
   // システム状態を確認
   const systemStatus = offlineOperationManager.getSystemStatus();
   console.log('システム状態:', systemStatus);
   ```

2. **緊急モードの有効化**
   ```javascript
   // 緊急モードを有効化
   offlineOperationManager.enableEmergencyMode(true);
   ```

3. **手動同期の実行**
   ```javascript
   // 手動で同期を実行
   await offlineOperationManager.performSync();
   ```

### データ復旧手順

1. **バックアップの確認**
   ```javascript
   // 利用可能なバックアップを確認
   const backups = offlineOperationManager.getAvailableBackups();
   console.log('利用可能なバックアップ:', backups);
   ```

2. **最新バックアップからの復元**
   ```javascript
   // 最新のバックアップを取得
   const latestBackup = await offlineOperationManager.getLatestBackup();
   
   // バックアップから復元
   await offlineOperationManager.restoreFromBackup(latestBackup);
   ```

3. **データの整合性確認**
   ```javascript
   // 復元後のデータ整合性を確認
   const integrityCheck = await offlineOperationManager.checkDataIntegrity();
   console.log('データ整合性:', integrityCheck);
   ```

---

## よくある質問 (FAQ)

### Q: オフライン操作が同期されない
**A**: 以下の手順で確認してください:
1. ネットワーク接続を確認
2. 同期状態を確認: `offlineOperationManager.getSyncState()`
3. 手動同期を実行: `await offlineOperationManager.performSync()`

### Q: 競合通知が表示されない
**A**: 以下を確認してください:
1. 最高管理者モードでログインしているか
2. 通知設定が有効になっているか
3. ブラウザの通知許可が有効になっているか

### Q: システムが重くなる
**A**: 以下の最適化を実行してください:
1. メモリクリーンアップ: `offlineOperationManager.performMemoryCleanup()`
2. キャッシュサイズの確認: `offlineOperationManager.getCacheSize()`
3. 不要なデータの削除: `offlineOperationManager.cleanOldData()`

### Q: データが正しく表示されない
**A**: 以下の手順で修正してください:
1. キャッシュをクリア: `offlineOperationManager.clearCache()`
2. データを再取得: `await offlineOperationManager.refreshAllData()`
3. ページを再読み込み

---

## サポートと連絡先

### 技術サポート
- **緊急時**: システム管理者に直接連絡
- **通常時**: メールでサポートチームに連絡
- **ドキュメント**: このガイドを参照

### 更新履歴
- **v2.0**: iOS対応、パフォーマンス最適化
- **v1.5**: 競合解決システム追加
- **v1.0**: 初回リリース

---

**注意**: このガイドは管理者向けの詳細な操作手順書です。システムの変更や設定変更を行う前に、必ずバックアップを取得してください。
