// ===============================================================
// オフライン同期システム v2.0 - 完全再設計版
// ===============================================================

// 定数定義
const OFFLINE_CONFIG = {
  ENABLED: true,
  SYNC_INTERVAL_MS: 15000, // 15秒
  MAX_RETRY_COUNT: 3, // リトライ回数を減らす
  RETRY_DELAY_MS: 5000, // リトライ間隔を延長
  MAX_QUEUE_SIZE: 1000,
  SYNC_TIMEOUT_MS: 30000, // 同期タイムアウトを30秒に短縮
  BACKGROUND_SYNC_INTERVAL: 60000, // バックグラウンド同期間隔を延長（60秒）
  CACHE_EXPIRY_MS: 300000 // 5分
};

// ストレージキー
const STORAGE_KEYS = {
  OPERATION_QUEUE: 'offlineOperationQueue_v2',
  OPERATION_LOG: 'offlineOperationLog_v2',
  CACHE_DATA: 'offlineCacheData_v2',
  SYNC_STATE: 'offlineSyncState_v2',
  CONFLICT_RESOLUTION: 'offlineConflictResolution_v2'
};

// 操作タイプ定義
const OPERATION_TYPES = {
  RESERVE_SEATS: 'reserveSeats',
  CHECK_IN_SEATS: 'checkInMultipleSeats',
  UPDATE_SEAT_DATA: 'updateSeatData',
  ASSIGN_WALKIN: 'assignWalkInSeats',
  ASSIGN_WALKIN_CONSECUTIVE: 'assignWalkInConsecutiveSeats'
};

// 操作の優先度
const OPERATION_PRIORITY = {
  [OPERATION_TYPES.RESERVE_SEATS]: 1, // 最高優先度
  [OPERATION_TYPES.CHECK_IN_SEATS]: 2,
  [OPERATION_TYPES.UPDATE_SEAT_DATA]: 3,
  [OPERATION_TYPES.ASSIGN_WALKIN]: 4,
  [OPERATION_TYPES.ASSIGN_WALKIN_CONSECUTIVE]: 4
};

/**
 * オフライン操作管理クラス
 */
class OfflineOperationManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncState = this.loadSyncState();
    this.backgroundSyncInterval = null;
    this.retryTimeout = null;
    this.operationCounter = 0;
    
    this.initializeEventListeners();
    this.startBackgroundSync();
  }

  /**
   * イベントリスナーの初期化
   */
  initializeEventListeners() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    window.addEventListener('beforeunload', () => this.handleBeforeUnload());
    
    // 定期的な接続状態チェック
    setInterval(() => this.checkConnectionStatus(), 5000);
    
    // ページ可視性の変更を監視
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
  }

  /**
   * オンライン復帰時の処理
   */
  async handleOnline() {
    if (this.isOnline) return;
    
    console.log('[OfflineSync] オンライン復帰を検知');
    this.isOnline = true;
    this.syncState.lastOnlineTime = Date.now();
    this.saveSyncState();
    
    // 即座に同期を開始
    await this.performSync();
    
    // バックグラウンド同期を再開
    this.startBackgroundSync();
  }

  /**
   * オフライン状態の処理
   */
  async handleOffline() {
    if (!this.isOnline) return;
    
    console.log('[OfflineSync] オフライン状態を検知');
    this.isOnline = false;
    this.syncState.lastOfflineTime = Date.now();
    this.saveSyncState();
    
    // バックグラウンド同期を停止
    this.stopBackgroundSync();
    
    // オフライン操作モードに切り替え
    await this.installOfflineOverrides();
  }

  /**
   * 接続状態のチェック
   */
  checkConnectionStatus() {
    const currentOnline = navigator.onLine;
    if (currentOnline !== this.isOnline) {
      if (currentOnline) {
        this.handleOnline();
      } else {
        this.handleOffline();
      }
    }
  }

  /**
   * ページ可視性の変更を処理
   */
  handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this.isOnline) {
      // ページが表示された時に同期を実行
      this.performSync();
    }
  }

  /**
   * ページ離脱時の処理
   */
  handleBeforeUnload() {
    // 同期状態を保存
    this.saveSyncState();
    
    // 未同期の操作がある場合は警告
    const queue = this.readOperationQueue();
    if (queue.length > 0) {
      return 'オフライン操作が未同期です。ページを離れますか？';
    }
  }

  /**
   * オフライン操作をキューに追加
   */
  addOperation(operation) {
    const queue = this.readOperationQueue();
    
    // キューサイズの制限チェック
    if (queue.length >= OFFLINE_CONFIG.MAX_QUEUE_SIZE) {
      console.warn('[OfflineSync] キューが最大サイズに達しました。古い操作を削除します。');
      queue.splice(0, Math.floor(queue.length / 2)); // 古い操作を半分削除
    }
    
    const operationWithMeta = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: Date.now(),
      retryCount: 0,
      priority: OPERATION_PRIORITY[operation.type] || 5,
      status: 'pending',
      precondition: this.capturePrecondition(operation)
    };
    
    queue.push(operationWithMeta);
    
    // 優先度順にソート
    queue.sort((a, b) => a.priority - b.priority);
    
    this.writeOperationQueue(queue);
    this.logOperation(operationWithMeta);
    
    console.log(`[OfflineSync] オフライン操作を追加: ${operation.type} (ID: ${operationWithMeta.id})`);
    
    // オンライン時は即座に同期を試行
    if (this.isOnline && !this.syncInProgress) {
      this.performSync();
    }
    
    return operationWithMeta.id;
  }

  /**
   * 操作の前提条件をキャプチャ
   */
  capturePrecondition(operation) {
    try {
      const { group, day, timeslot } = this.extractContext(operation.args);
      if (group && day && timeslot) {
        const cache = this.readCache(group, day, timeslot);
        return cache ? { timestamp: cache.cachedAt, version: cache.version } : null;
      }
    } catch (error) {
      console.warn('[OfflineSync] 前提条件のキャプチャに失敗:', error);
    }
    return null;
  }

  /**
   * 操作IDの生成
   */
  generateOperationId() {
    this.operationCounter++;
    return `op_${Date.now()}_${this.operationCounter}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 操作のログ出力
   */
  logOperation(operation) {
    const log = this.readOperationLog();
    log.push({
      timestamp: Date.now(),
      operation: {
        id: operation.id,
        type: operation.type,
        args: operation.args,
        priority: operation.priority
      },
      queueLength: this.readOperationQueue().length
    });
    
    // ログサイズを制限
    if (log.length > 1000) {
      log.splice(0, log.length - 1000);
    }
    
    this.writeOperationLog(log);
  }

  /**
   * 同期の実行
   */
  async performSync() {
    if (this.syncInProgress) {
      console.log('[OfflineSync] 同期が既に進行中です');
      return;
    }

    const queue = this.readOperationQueue();
    if (queue.length === 0) {
      console.log('[OfflineSync] 同期する操作がありません');
      return;
    }

    console.log(`[OfflineSync] ${queue.length}件の操作を同期開始`);
    this.syncInProgress = true;
    this.syncState.lastSyncAttempt = Date.now();
    this.saveSyncState();
    
    this.showSyncModal();

    // GasAPI readiness guard: if not ready, back off and retry
    try {
      await this.waitForGasAPI();
    } catch (e) {
      console.warn('[OfflineSync] GasAPI未準備のため、同期を後で再試行します:', e.message);
      this.syncInProgress = false;
      this.hideSyncModal();
      setTimeout(() => { this.performSync(); }, OFFLINE_CONFIG.RETRY_DELAY_MS);
      return;
    }

    // タイムアウト処理
    const timeoutId = setTimeout(() => {
      if (this.syncInProgress) {
        console.error('[OfflineSync] 同期タイムアウト');
        this.syncInProgress = false;
        this.hideSyncModal();
        // エラー通知を安全に表示
        try {
          this.showErrorNotification('同期がタイムアウトしました。手動で再試行してください。');
        } catch (error) {
          console.error('[OfflineSync] エラー通知の表示に失敗:', error);
          // フォールバック: アラートで表示
          alert('同期がタイムアウトしました。手動で再試行してください。');
        }
      }
    }, OFFLINE_CONFIG.SYNC_TIMEOUT_MS);

    try {
      console.log('[OfflineSync] 操作キューの処理開始');
      const result = await this.processOperationQueue(queue);
      clearTimeout(timeoutId);
      
      console.log('[OfflineSync] 同期完了:', result);
      
      // 成功した操作をキューから削除
      this.writeOperationQueue(result.remaining);
      
      // 同期状態を更新
      this.syncState.lastSuccessfulSync = Date.now();
      this.syncState.syncErrors = [];
      this.saveSyncState();
      
      // 成功通知を表示
      if (result.processed.length > 0) {
        this.showSuccessNotification(`${result.processed.length}件の操作を同期しました`);
      }
      
      // 競合が残っている場合は自動解決を試行
      if (result.conflictCount > 0 && Array.isArray(result.conflicts) && result.conflicts.length > 0) {
        console.log('[OfflineSync] 競合の自動解決を試行します:', result.conflicts.length);
        await this.resolveConflicts(result.conflicts);
      }
      
      // エラーが発生した操作がある場合の通知
      if (result.errorCount > 0) {
        this.showErrorNotification(`${result.errorCount}件の操作でエラーが発生しました`);
      }
      
      // キャッシュを更新
      console.log('[OfflineSync] キャッシュ更新開始');
      await this.refreshCache();
      console.log('[OfflineSync] キャッシュ更新完了');
      
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[OfflineSync] 同期エラー:', error);
      this.handleSyncError(error);
      
      // エラーが発生した場合、キューをクリアして無限ループを防ぐ
      const currentQueue = this.readOperationQueue();
      if (currentQueue.length > 0) {
        console.warn('[OfflineSync] 同期エラーのため、キューをクリアします');
        this.writeOperationQueue([]);
      }
    } finally {
      console.log('[OfflineSync] 同期処理終了');
      this.syncInProgress = false;
      this.hideSyncModal();
    }
  }

  /**
   * 操作キューの処理
   */
  async processOperationQueue(queue) {
    const remaining = [];
    const processed = [];
    const errors = [];
    const conflicts = [];

    for (const operation of queue) {
      try {
        console.log(`[OfflineSync] 処理中: ${operation.type} (ID: ${operation.id})`);
        
        // 前提条件のチェック
        if (!this.validatePrecondition(operation)) {
          conflicts.push(operation);
          console.warn(`[OfflineSync] 前提条件の競合: ${operation.type} (ID: ${operation.id})`);
          // 競合した操作は再試行のためキューに残す
          remaining.push(operation);
          continue;
        }
        
        const result = await this.executeOperation(operation);
        
        if (result.success) {
          processed.push({ ...operation, result, syncedAt: Date.now() });
          console.log(`[OfflineSync] 成功: ${operation.type} (ID: ${operation.id})`);
        } else {
          // リトライ可能なエラーの場合
          if (operation.retryCount < OFFLINE_CONFIG.MAX_RETRY_COUNT) {
            operation.retryCount++;
            operation.status = 'retry';
            remaining.push(operation);
            console.log(`[OfflineSync] リトライ予定: ${operation.type} (ID: ${operation.id}) - ${operation.retryCount}/${OFFLINE_CONFIG.MAX_RETRY_COUNT}`);
          } else {
            operation.status = 'failed';
            errors.push({ ...operation, error: result.error });
            console.error(`[OfflineSync] 失敗: ${operation.type} (ID: ${operation.id}) - 最大リトライ回数に達しました`);
            // 失敗した操作はキューから削除（再試行しない）
          }
        }
      } catch (error) {
        console.error(`[OfflineSync] エラー: ${operation.type} (ID: ${operation.id})`, error);
        // 例外が発生した操作もリトライを試行
        if (operation.retryCount < OFFLINE_CONFIG.MAX_RETRY_COUNT) {
          operation.retryCount++;
          operation.status = 'retry';
          remaining.push(operation);
          console.log(`[OfflineSync] 例外後リトライ予定: ${operation.type} (ID: ${operation.id}) - ${operation.retryCount}/${OFFLINE_CONFIG.MAX_RETRY_COUNT}`);
        } else {
          operation.status = 'failed';
          errors.push({ ...operation, error: error.message });
          console.error(`[OfflineSync] 例外後失敗: ${operation.type} (ID: ${operation.id}) - 最大リトライ回数に達しました`);
        }
      }
    }

    return {
      processed,
      remaining,
      errors,
      conflicts,
      successCount: processed.length,
      errorCount: errors.length,
      conflictCount: conflicts.length
    };
  }

  /**
   * 前提条件の検証
   */
  validatePrecondition(operation) {
    try {
      const { group, day, timeslot } = this.extractContext(operation.args);
      if (!group || !day || !timeslot) {
        console.log('[OfflineSync] 前提条件検証: コンテキスト情報が不完全');
        return true;
      }
      
      const cache = this.readCache(group, day, timeslot);
      if (!cache) {
        console.log('[OfflineSync] 前提条件検証: キャッシュが存在しない');
        return true;
      }
      
      if (!operation.precondition) {
        console.log('[OfflineSync] 前提条件検証: 操作の前提条件が存在しない');
        return true;
      }
      
      // キャッシュのバージョンが前提条件と一致するかチェック
      const isValid = cache.version === operation.precondition.version;
      console.log(`[OfflineSync] 前提条件検証: ${isValid ? '有効' : '無効'} (cache: ${cache.version}, operation: ${operation.precondition.version})`);
      
      // オフライン操作の場合は前提条件を緩和
      if (!isValid && operation.timestamp) {
        const timeDiff = Date.now() - operation.timestamp;
        if (timeDiff < 300000) { // 5分以内の操作は有効とする
          console.log('[OfflineSync] 前提条件検証: 時間ベースで有効と判定');
          return true;
        }
      }
      
      return isValid;
    } catch (error) {
      console.warn('[OfflineSync] 前提条件の検証に失敗:', error);
      return true; // エラーの場合は検証をスキップ
    }
  }

  /**
   * 個別操作の実行
   */
  async executeOperation(operation) {
    const { type, args } = operation;
    
    try {
      console.log(`[OfflineSync] GasAPI待機開始: ${type}`);
      const gasAPI = await this.waitForGasAPI();
      console.log(`[OfflineSync] GasAPI取得完了: ${type}`);
      
      console.log(`[OfflineSync] GAS API呼び出し: ${type}`, args);
      
      let result;
      switch (type) {
        case OPERATION_TYPES.RESERVE_SEATS:
          console.log(`[OfflineSync] reserveSeats呼び出し開始(オリジナル)`);
          result = this.originalMethods && this.originalMethods.reserveSeats
            ? await this.originalMethods.reserveSeats(...args)
            : await gasAPI.reserveSeats(...args);
          console.log(`[OfflineSync] reserveSeats呼び出し完了(オリジナル)`);
          break;
        case OPERATION_TYPES.CHECK_IN_SEATS:
          console.log(`[OfflineSync] checkInMultipleSeats呼び出し開始(オリジナル)`);
          result = this.originalMethods && this.originalMethods.checkInMultipleSeats
            ? await this.originalMethods.checkInMultipleSeats(...args)
            : await gasAPI.checkInMultipleSeats(...args);
          console.log(`[OfflineSync] checkInMultipleSeats呼び出し完了(オリジナル)`);
          break;
        case OPERATION_TYPES.UPDATE_SEAT_DATA:
          console.log(`[OfflineSync] updateSeatData呼び出し開始(オリジナル)`);
          result = this.originalMethods && this.originalMethods.updateSeatData
            ? await this.originalMethods.updateSeatData(...args)
            : await gasAPI.updateSeatData(...args);
          console.log(`[OfflineSync] updateSeatData呼び出し完了(オリジナル)`);
          break;
        case OPERATION_TYPES.ASSIGN_WALKIN:
          console.log(`[OfflineSync] assignWalkInSeats呼び出し開始(オリジナル)`);
          result = this.originalMethods && this.originalMethods.assignWalkInSeats
            ? await this.originalMethods.assignWalkInSeats(...args)
            : await gasAPI.assignWalkInSeats(...args);
          console.log(`[OfflineSync] assignWalkInSeats呼び出し完了(オリジナル)`);
          break;
        case OPERATION_TYPES.ASSIGN_WALKIN_CONSECUTIVE:
          console.log(`[OfflineSync] assignWalkInConsecutiveSeats呼び出し開始(オリジナル)`);
          result = this.originalMethods && this.originalMethods.assignWalkInConsecutiveSeats
            ? await this.originalMethods.assignWalkInConsecutiveSeats(...args)
            : await gasAPI.assignWalkInConsecutiveSeats(...args);
          console.log(`[OfflineSync] assignWalkInConsecutiveSeats呼び出し完了(オリジナル)`);
          break;
        default:
          result = { success: false, error: `未知の操作タイプ: ${type}` };
      }
      
      console.log(`[OfflineSync] GAS API応答: ${type}`, result);
      return result;
    } catch (error) {
      console.error(`[OfflineSync] 操作実行エラー: ${type}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 競合解決の実行
   */
  async resolveConflicts(conflicts) {
    console.log(`[OfflineSync] ${conflicts.length}件の競合を解決中...`);
    
    for (const conflict of conflicts) {
      try {
        // 最新のデータを取得
        const { group, day, timeslot } = this.extractContext(conflict.args);
        if (group && day && timeslot) {
          const gasAPI = await this.waitForGasAPI();
          const freshData = await gasAPI.getSeatDataMinimal(group, day, timeslot, false);
          
          if (freshData && freshData.success) {
            // キャッシュを更新
            this.writeCache(group, day, timeslot, freshData);
            
            // 操作を再試行
            const result = await this.executeOperation(conflict);
            if (result.success) {
              console.log(`[OfflineSync] 競合解決成功: ${conflict.type} (ID: ${conflict.id})`);
            }
          }
        }
      } catch (error) {
        console.error(`[OfflineSync] 競合解決エラー: ${conflict.type} (ID: ${conflict.id})`, error);
      }
    }
  }

  /**
   * キャッシュの更新
   */
  async refreshCache() {
    try {
      const { group, day, timeslot } = this.getCurrentContext();
      if (group && day && timeslot) {
        console.log('[OfflineSync] キャッシュを更新中...');
        const gasAPI = await this.waitForGasAPI();
        const freshData = await gasAPI.getSeatDataMinimal(group, day, timeslot, false);
        
        if (freshData && freshData.success) {
          this.writeCache(group, day, timeslot, freshData);
          console.log('[OfflineSync] キャッシュ更新完了');
        }
      }
    } catch (error) {
      console.error('[OfflineSync] キャッシュ更新エラー:', error);
    }
  }

  /**
   * エラーハンドリング
   */
  handleSyncError(error) {
    this.syncState.syncErrors.push({
      timestamp: Date.now(),
      error: error.message,
      retryCount: this.syncState.retryCount || 0
    });
    
    // 連続エラーが多すぎる場合は同期を停止
    const recentErrors = this.syncState.syncErrors.filter(
      e => Date.now() - e.timestamp < 300000 // 5分以内のエラー
    );
    
    if (recentErrors.length > 10) {
      console.error('[OfflineSync] 連続エラーが多すぎるため、同期を停止します');
      this.stopBackgroundSync();
      this.notifySyncFailure();
      return;
    }
    
    if (this.syncState.retryCount < OFFLINE_CONFIG.MAX_RETRY_COUNT) {
      this.syncState.retryCount++;
      console.log(`[OfflineSync] リトライ ${this.syncState.retryCount}/${OFFLINE_CONFIG.MAX_RETRY_COUNT} を ${OFFLINE_CONFIG.RETRY_DELAY_MS}ms後に実行`);
      
      this.retryTimeout = setTimeout(() => {
        this.performSync();
      }, OFFLINE_CONFIG.RETRY_DELAY_MS);
    } else {
      console.error('[OfflineSync] 最大リトライ回数に達しました');
      this.notifySyncFailure();
    }
    
    this.saveSyncState();
  }

  /**
   * 同期失敗の通知
   */
  notifySyncFailure() {
    const notification = document.createElement('div');
    notification.className = 'sync-failure-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <h4>同期エラー</h4>
        <p>オフライン操作の同期に失敗しました。手動で同期を試してください。</p>
        <button onclick="OfflineSyncV2.retrySync()">再試行</button>
        <button onclick="OfflineSyncV2.showQueueStatus()">詳細表示</button>
        <button onclick="this.parentElement.parentElement.remove()">閉じる</button>
      </div>
    `;
    
    document.body.appendChild(notification);
  }

  /**
   * バックグラウンド同期の開始
   */
  startBackgroundSync() {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
    }
    
    this.backgroundSyncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress && this.readOperationQueue().length > 0) {
        this.performSync();
      }
    }, OFFLINE_CONFIG.BACKGROUND_SYNC_INTERVAL);
  }

  /**
   * バックグラウンド同期の停止
   */
  stopBackgroundSync() {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }
  }

  /**
   * オフラインオーバーライドのインストール
   */
  async installOfflineOverrides() {
    if (!OFFLINE_CONFIG.ENABLED) return;
    
    try {
      // GasAPIの待機を短時間で試行
      const gasAPI = await Promise.race([
        this.waitForGasAPI(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GasAPI待機タイムアウト')), 5000)
        )
      ]);
      
      if (!gasAPI) {
        console.warn('[OfflineSync] GasAPIが利用できません。オフラインオーバーライドをスキップします。');
        return;
      }
      
      console.log('[OfflineSync] オフライン操作モードに切り替え');
      
      // 元のメソッドを保存
      const originalMethods = {
        reserveSeats: gasAPI.reserveSeats.bind(gasAPI),
        checkInMultipleSeats: gasAPI.checkInMultipleSeats.bind(gasAPI),
        updateSeatData: gasAPI.updateSeatData.bind(gasAPI),
        assignWalkInSeats: gasAPI.assignWalkInSeats.bind(gasAPI),
        assignWalkInConsecutiveSeats: gasAPI.assignWalkInConsecutiveSeats.bind(gasAPI)
      };
      // インスタンスに保持（同期時にオリジナルを使用）
      this.originalMethods = originalMethods;

      // 予約のオフライン対応
      gasAPI.reserveSeats = async (...args) => {
        if (this.isOnline) {
          try {
            return await originalMethods.reserveSeats(...args);
          } catch (error) {
            console.log('[OfflineSync] オンライン予約失敗、オフライン操作として処理');
            const operationId = this.addOperation({ type: OPERATION_TYPES.RESERVE_SEATS, args });
            return { 
              success: true, 
              message: 'オフラインで予約を受け付けました', 
              offline: true, 
              operationId 
            };
          }
        } else {
          const operationId = this.addOperation({ type: OPERATION_TYPES.RESERVE_SEATS, args });
          return { 
            success: true, 
            message: 'オフラインで予約を受け付けました', 
            offline: true, 
            operationId 
          };
        }
      };

      // チェックインのオフライン対応
      gasAPI.checkInMultipleSeats = async (...args) => {
        if (this.isOnline) {
          try {
            return await originalMethods.checkInMultipleSeats(...args);
          } catch (error) {
            console.log('[OfflineSync] オンラインチェックイン失敗、オフライン操作として処理');
            const operationId = this.addOperation({ type: OPERATION_TYPES.CHECK_IN_SEATS, args });
            return { 
              success: true, 
              message: 'オフラインでチェックインを受け付けました', 
              offline: true, 
              operationId 
            };
          }
        } else {
          const operationId = this.addOperation({ type: OPERATION_TYPES.CHECK_IN_SEATS, args });
          return { 
            success: true, 
            message: 'オフラインでチェックインを受け付けました', 
            offline: true, 
            operationId 
          };
        }
      };

      // 座席データ更新のオフライン対応
      gasAPI.updateSeatData = async (...args) => {
        if (this.isOnline) {
          try {
            return await originalMethods.updateSeatData(...args);
          } catch (error) {
            console.log('[OfflineSync] オンライン更新失敗、オフライン操作として処理');
            const operationId = this.addOperation({ type: OPERATION_TYPES.UPDATE_SEAT_DATA, args });
            return { 
              success: true, 
              message: 'オフラインで更新を受け付けました', 
              offline: true, 
              operationId 
            };
          }
        } else {
          const operationId = this.addOperation({ type: OPERATION_TYPES.UPDATE_SEAT_DATA, args });
          return { 
            success: true, 
            message: 'オフラインで更新を受け付けました', 
            offline: true, 
            operationId 
          };
        }
      };

      // 当日券発行のオフライン対応
      gasAPI.assignWalkInSeats = async (...args) => {
        if (this.isOnline) {
          try {
            return await originalMethods.assignWalkInSeats(...args);
          } catch (error) {
            console.log('[OfflineSync] オンライン当日券発行失敗、オフライン操作として処理');
            const operationId = this.addOperation({ type: OPERATION_TYPES.ASSIGN_WALKIN, args });
            return { 
              success: true, 
              message: 'オフラインで当日券発行を受け付けました', 
              offline: true, 
              operationId 
            };
          }
        } else {
          const operationId = this.addOperation({ type: OPERATION_TYPES.ASSIGN_WALKIN, args });
          return { 
            success: true, 
            message: 'オフラインで当日券発行を受け付けました', 
            offline: true, 
            operationId 
          };
        }
      };

      gasAPI.assignWalkInConsecutiveSeats = async (...args) => {
        if (this.isOnline) {
          try {
            return await originalMethods.assignWalkInConsecutiveSeats(...args);
          } catch (error) {
            console.log('[OfflineSync] オンライン連続席発行失敗、オフライン操作として処理');
            const operationId = this.addOperation({ type: OPERATION_TYPES.ASSIGN_WALKIN_CONSECUTIVE, args });
            return { 
              success: true, 
              message: 'オフラインで連続席発行を受け付けました', 
              offline: true, 
              operationId 
            };
          }
        } else {
          const operationId = this.addOperation({ type: OPERATION_TYPES.ASSIGN_WALKIN_CONSECUTIVE, args });
          return { 
            success: true, 
            message: 'オフラインで連続席発行を受け付けました', 
            offline: true, 
            operationId 
          };
        }
      };
      
    } catch (error) {
      console.error('[OfflineSync] オフラインオーバーライドのインストールに失敗:', error);
    }
  }

  /**
   * 同期モーダルの表示
   */
  showSyncModal() {
    try {
      const existing = document.getElementById('sync-modal-v2');
      if (existing) existing.remove();

      const modalHTML = `
        <div id="sync-modal-v2" class="modal" style="display: block; z-index: 10000;">
          <div class="modal-content" style="text-align: center; max-width: 450px;">
            <div class="spinner"></div>
            <h3>オフライン操作を同期中...</h3>
            <p>しばらくお待ちください。操作はできません。</p>
            <div class="sync-progress">
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
            </div>
            <div class="sync-status">
              <p>同期状況: <span id="sync-status-text">処理中...</span></p>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      console.log('[OfflineSync] 同期モーダルを表示');
    } catch (error) {
      console.error('[OfflineSync] モーダル表示エラー:', error);
    }
  }

  /**
   * 同期モーダルの非表示
   */
  hideSyncModal() {
    try {
      const modal = document.getElementById('sync-modal-v2');
      if (modal) {
        modal.remove();
        console.log('[OfflineSync] 同期モーダルを非表示');
      }
    } catch (error) {
      console.error('[OfflineSync] モーダル非表示エラー:', error);
    }
  }

  /**
   * 成功通知の表示
   */
  showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">✓</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 4000);
  }

  /**
   * GasAPIの待機
   */
  async waitForGasAPI() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('GasAPIの待機がタイムアウトしました'));
      }, 10000); // 10秒でタイムアウト
      
      const checkAPI = () => {
        if (window.GasAPI) {
          clearTimeout(timeout);
          resolve(window.GasAPI);
        } else {
          setTimeout(checkAPI, 100);
        }
      };
      checkAPI();
    });
  }

  /**
   * 現在のコンテキストを取得
   */
  getCurrentContext() {
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        group: params.get('group'),
        day: params.get('day'),
        timeslot: params.get('timeslot')
      };
    } catch (error) {
      console.error('[OfflineSync] コンテキスト取得エラー:', error);
      return {};
    }
  }

  /**
   * 操作のコンテキストを抽出
   */
  extractContext(args) {
    try {
      if (Array.isArray(args) && args.length >= 3) {
        return {
          group: args[0],
          day: args[1],
          timeslot: args[2]
        };
      }
    } catch (error) {
      console.warn('[OfflineSync] コンテキスト抽出エラー:', error);
    }
    return {};
  }

  /**
   * 操作キューの読み取り
   */
  readOperationQueue() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OPERATION_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[OfflineSync] キュー読み取りエラー:', error);
      return [];
    }
  }

  /**
   * 操作キューの書き込み
   */
  writeOperationQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEYS.OPERATION_QUEUE, JSON.stringify(queue));
    } catch (error) {
      console.error('[OfflineSync] キュー書き込みエラー:', error);
    }
  }

  /**
   * 操作ログの読み取り
   */
  readOperationLog() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OPERATION_LOG);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[OfflineSync] ログ読み取りエラー:', error);
      return [];
    }
  }

  /**
   * 操作ログの書き込み
   */
  writeOperationLog(log) {
    try {
      localStorage.setItem(STORAGE_KEYS.OPERATION_LOG, JSON.stringify(log));
    } catch (error) {
      console.error('[OfflineSync] ログ書き込みエラー:', error);
    }
  }

  /**
   * キャッシュの読み取り
   */
  readCache(group, day, timeslot) {
    try {
      const key = `${STORAGE_KEYS.CACHE_DATA}_${group}-${day}-${timeslot}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      
      const cache = JSON.parse(data);
      
      // キャッシュの有効期限チェック
      if (cache.cachedAt && (Date.now() - cache.cachedAt) > OFFLINE_CONFIG.CACHE_EXPIRY_MS) {
        localStorage.removeItem(key);
        return null;
      }
      
      return cache;
    } catch (error) {
      console.error('[OfflineSync] キャッシュ読み取りエラー:', error);
      return null;
    }
  }

  /**
   * キャッシュの書き込み
   */
  writeCache(group, day, timeslot, data) {
    try {
      const key = `${STORAGE_KEYS.CACHE_DATA}_${group}-${day}-${timeslot}`;
      const cacheData = {
        ...data,
        cachedAt: Date.now(),
        version: Date.now().toString() // バージョン管理
      };
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[OfflineSync] キャッシュ書き込みエラー:', error);
    }
  }

  /**
   * 同期状態の読み取り
   */
  loadSyncState() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
      return data ? JSON.parse(data) : {
        retryCount: 0,
        lastSyncAttempt: 0,
        lastSuccessfulSync: 0,
        lastOnlineTime: 0,
        lastOfflineTime: 0,
        syncErrors: []
      };
    } catch (error) {
      console.error('[OfflineSync] 同期状態読み取りエラー:', error);
      return {
        retryCount: 0,
        lastSyncAttempt: 0,
        lastSuccessfulSync: 0,
        lastOnlineTime: 0,
        lastOfflineTime: 0,
        syncErrors: []
      };
    }
  }

  /**
   * 同期状態の保存
   */
  saveSyncState() {
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(this.syncState));
    } catch (error) {
      console.error('[OfflineSync] 同期状態保存エラー:', error);
    }
  }

  /**
   * システムの状態を取得
   */
  getSystemStatus() {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      retryCount: this.syncState.retryCount,
      lastSyncAttempt: this.syncState.lastSyncAttempt,
      lastSuccessfulSync: this.syncState.lastSuccessfulSync,
      lastOnlineTime: this.syncState.lastOnlineTime,
      lastOfflineTime: this.syncState.lastOfflineTime,
      syncErrors: this.syncState.syncErrors,
      queueLength: this.readOperationQueue().length,
      cacheInfo: this.getCacheInfo()
    };
  }

  /**
   * キャッシュ情報の取得
   */
  getCacheInfo() {
    const { group, day, timeslot } = this.getCurrentContext();
    if (group && day && timeslot) {
      const cache = this.readCache(group, day, timeslot);
      return {
        exists: !!cache,
        cachedAt: cache ? cache.cachedAt : null,
        version: cache ? cache.version : null,
        seatCount: cache && cache.seatMap ? Object.keys(cache.seatMap).length : 0
      };
    }
    return null;
  }

  /**
   * システムの初期化
   */
  async initialize() {
    console.log('[OfflineSync] オフライン同期システム v2.0 を初期化中...');
    
    // 初回: 現在ページの座席が未キャッシュなら最低限の雛形を用意
    try {
      const { group, day, timeslot } = this.getCurrentContext();
      if (group && day && timeslot && !this.readCache(group, day, timeslot)) {
        this.writeCache(group, day, timeslot, { seatMap: {} });
      }
    } catch (error) {
      console.error('[OfflineSync] 初期化エラー:', error);
    }

    // オフラインオーバーライドを即座にインストール
    await this.installOfflineOverrides();

    // オフライン状態の確認
    if (!this.isOnline) {
      await this.handleOffline();
    }

    // どのページでも設定から同期操作できるボタン/メニューを注入
    try { this.injectGlobalSettingsEntry(); } catch (_) {}

    console.log('[OfflineSync] 初期化完了');
  }

  /**
   * 左下の設定ボタンとメニューへオフライン同期の4要素を統合
   * - 全ページで設定ボタンを表示
   * - seats.html では既存の設定パネルにオフライン同期セクションを追加
   * - その他ページでは軽量モーダルに4要素のみ表示
   */
  injectGlobalSettingsEntry() {
    if (!document.getElementById('global-settings-button')) {
      const btn = document.createElement('button');
      btn.id = 'global-settings-button';
      btn.title = '設定';
      btn.style.position = 'fixed';
      btn.style.left = '10px';
      btn.style.bottom = '10px';
      btn.style.zIndex = '10006';
      btn.style.background = '#343a40';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '20px';
      btn.style.padding = '8px 12px';
      btn.style.fontSize = '12px';
      btn.style.cursor = 'pointer';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.2)';
      btn.textContent = '設定';
      btn.onclick = () => this.openGlobalSettingsPanel();
      document.body.appendChild(btn);
    }

    // seatsページの既存設定パネルにセクションを追加（存在する場合のみ）
    this.ensureOfflineSectionInSeatSettings();
  }

  openGlobalSettingsPanel() {
    // seats.html の自動更新設定パネルがあればそこに統合
    if (document.getElementById('auto-refresh-settings-panel')) {
      try {
        // 既存のUIを開く（toggle関数があれば利用）
        try { if (window.toggleAutoRefreshSettings) { window.toggleAutoRefreshSettings(); } } catch (_) {}
        this.ensureOfflineSectionInSeatSettings(true /*focus*/);
        return;
      } catch (_) {}
    }

    // その他ページ: 軽量モーダルを表示
    const existing = document.getElementById('offline-sync-mini-modal');
    if (existing) { existing.remove(); }
    const modal = document.createElement('div');
    modal.id = 'offline-sync-mini-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = '10007';
    modal.innerHTML = `
      <div style="background:#fff;max-width:420px;width:92%;margin:8vh auto;padding:18px 16px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.3)">
        <h3 style="margin:0 0 12px 0;font-size:18px;">オフライン同期</h3>
        ${this.renderOfflineControlsHTML()}
        <div style="text-align:right;margin-top:12px;">
          <button id="offline-sync-mini-close" style="background:#6c757d;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('offline-sync-mini-close').onclick = () => modal.remove();
    this.hydrateOfflineControls();
  }

  ensureOfflineSectionInSeatSettings(scrollIntoView = false) {
    const panel = document.getElementById('auto-refresh-settings-panel');
    if (!panel) return;
    if (document.getElementById('offline-sync-settings-section')) return;

    const section = document.createElement('div');
    section.id = 'offline-sync-settings-section';
    section.style.marginTop = '12px';
    section.innerHTML = `
      <hr style="margin:10px 0;">
      <h4 style="margin:0 0 8px 0;font-size:16px;">オフライン同期</h4>
      ${this.renderOfflineControlsHTML()}`;
    panel.appendChild(section);
    this.hydrateOfflineControls();
    if (scrollIntoView) {
      try { section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }
  }

  renderOfflineControlsHTML() {
    const status = this.getSystemStatus();
    const isOnline = status.isOnline;
    const inProgress = status.syncInProgress;
    const queueLen = status.queueLength;
    const disabled = (!isOnline) || inProgress || queueLen === 0 ? 'disabled' : '';
    const disabledStyle = (!isOnline) || inProgress || queueLen === 0 ? 'opacity:.6;cursor:not-allowed;' : '';
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span id="sync-status-pill" style="background:#6c757d;color:#fff;border-radius:16px;padding:6px 10px;font-size:12px;">状態: ${inProgress ? '同期中' : (isOnline ? 'オンライン' : 'オフライン')}</span>
        <span id="sync-queue-pill" style="background:#6c757d;color:#fff;border-radius:16px;padding:6px 10px;font-size:12px;">キュー: ${queueLen}</span>
        <button id="sync-now-btn" ${disabled} style="${disabledStyle}background:#007bff;color:#fff;border:none;border-radius:16px;padding:6px 10px;font-size:12px;">今すぐ同期</button>
        <button id="sync-detail-btn" style="background:#17a2b8;color:#fff;border:none;border-radius:16px;padding:6px 10px;font-size:12px;">詳細</button>
      </div>`;
  }

  hydrateOfflineControls() {
    const syncBtn = document.getElementById('sync-now-btn');
    const detailBtn = document.getElementById('sync-detail-btn');
    if (syncBtn) syncBtn.onclick = () => { try { OfflineSyncV2.sync(); } catch (_) {} };
    if (detailBtn) detailBtn.onclick = () => { try { OfflineSyncV2.showQueueStatus(); } catch (_) {} };

    // 状態の定期更新（軽量）
    const update = () => {
      try {
        const status = this.getSystemStatus();
        const isOnline = status.isOnline;
        const inProgress = status.syncInProgress;
        const queueLen = status.queueLength;
        const statusPill = document.getElementById('sync-status-pill');
        const queuePill = document.getElementById('sync-queue-pill');
        if (statusPill) statusPill.textContent = `状態: ${inProgress ? '同期中' : (isOnline ? 'オンライン' : 'オフライン')}`;
        if (queuePill) queuePill.textContent = `キュー: ${queueLen}`;
        if (syncBtn) {
          const disabled = (!isOnline) || inProgress || queueLen === 0;
          syncBtn.disabled = disabled;
          syncBtn.style.opacity = disabled ? '0.6' : '1';
          syncBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
        }
      } catch (_) {}
    };
    update();
    // 過剰更新を避けて2秒間隔
    const intervalId = setInterval(() => {
      // DOMがなくなったら停止
      if (!document.getElementById('sync-status-pill') && !document.getElementById('offline-sync-settings-section') && !document.getElementById('offline-sync-mini-modal')) {
        clearInterval(intervalId);
        return;
      }
      update();
    }, 2000);
  }
}

// グローバルインスタンスの作成
const offlineOperationManager = new OfflineOperationManager();

// グローバル関数（設定用）
window.OfflineSyncV2 = {
  // 状態管理
  getStatus: () => offlineOperationManager.getSystemStatus(),
  
  // 同期制御
  sync: () => offlineOperationManager.performSync(),
  retrySync: () => offlineOperationManager.performSync(),
  
  // 強制同期（タイムアウトを無視）
  forceSync: async () => {
    console.log('[OfflineSyncV2] 強制同期を実行');
    const queue = offlineOperationManager.readOperationQueue();
    if (queue.length === 0) {
      console.log('[OfflineSyncV2] 同期する操作がありません');
      return;
    }
    
    // 同期状態をリセット
    offlineOperationManager.syncInProgress = false;
    
    // 同期を実行
    await offlineOperationManager.performSync();
  },
  
  // キュー管理
  getQueue: () => offlineOperationManager.readOperationQueue(),
  clearQueue: () => offlineOperationManager.writeOperationQueue([]),
  
  // キャッシュ管理
  getCache: () => offlineOperationManager.getCacheInfo(),
  clearCache: () => {
    const { group, day, timeslot } = offlineOperationManager.getCurrentContext();
    if (group && day && timeslot) {
      localStorage.removeItem(`${STORAGE_KEYS.CACHE_DATA}_${group}-${day}-${timeslot}`);
      console.log('[OfflineSyncV2] キャッシュをクリアしました');
    }
  },
  
  // 操作管理
  addOperation: (operation) => offlineOperationManager.addOperation(operation),
  
  // 競合解決
  resolveConflicts: () => offlineOperationManager.resolveConflicts([]),
  
  // キューステータスの表示
  showQueueStatus: () => {
    const queue = offlineOperationManager.readOperationQueue();
    const status = offlineOperationManager.getSystemStatus();
    
    console.log('[OfflineSyncV2] キューステータス:', {
      queueLength: queue.length,
      systemStatus: status,
      queue: queue
    });
    
    // モーダルで表示
    const modalHTML = `
      <div id="queue-status-modal" class="modal" style="display: block; z-index: 10000;">
        <div class="modal-content" style="max-width: 600px;">
          <h3>オフライン操作キュー状況</h3>
          <div class="queue-status">
            <p><strong>キュー長:</strong> ${queue.length}</p>
            <p><strong>オンライン状態:</strong> ${status.isOnline ? 'オンライン' : 'オフライン'}</p>
            <p><strong>同期状況:</strong> ${status.syncInProgress ? '同期中' : '待機中'}</p>
            <p><strong>最後の同期:</strong> ${status.lastSuccessfulSync ? new Date(status.lastSuccessfulSync).toLocaleString('ja-JP') : 'なし'}</p>
          </div>
          <div class="queue-items">
            <h4>待機中の操作 (${queue.length}件)</h4>
            ${queue.map(op => `
              <div class="queue-item">
                <strong>${op.type}</strong> - ${new Date(op.timestamp).toLocaleString('ja-JP')}
                <br>ステータス: ${op.status} (リトライ: ${op.retryCount}/${OFFLINE_CONFIG.MAX_RETRY_COUNT})
              </div>
            `).join('')}
          </div>
          <div class="modal-buttons">
            <button onclick="OfflineSyncV2.sync()">今すぐ同期</button>
            <button onclick="OfflineSyncV2.clearQueue()">キューをクリア</button>
            <button onclick="document.getElementById('queue-status-modal').remove()">閉じる</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  },
  
  // デバッグ機能
  debug: async () => {
    console.log('[OfflineSyncV2] システム状態:', offlineOperationManager.getSystemStatus());
    
    // GAS接続テスト
    try {
      const gasAPI = await offlineOperationManager.waitForGasAPI();
      const testResult = await gasAPI.testApi();
      console.log('[OfflineSyncV2] GAS接続テスト:', testResult);
    } catch (error) {
      console.error('[OfflineSyncV2] GAS接続テスト失敗:', error);
    }
    
    // 現在の座席データを取得
    try {
      const gasAPI = await offlineOperationManager.waitForGasAPI();
      const { group, day, timeslot } = offlineOperationManager.getCurrentContext();
      if (group && day && timeslot) {
        const seatData = await gasAPI.getSeatDataMinimal(group, day, timeslot, false);
        console.log('[OfflineSyncV2] 現在の座席データ:', seatData);
      }
    } catch (error) {
      console.error('[OfflineSyncV2] 座席データ取得失敗:', error);
    }
  }
};

// システムの初期化（即座に開始）
(async () => {
  // DOMContentLoadedを待たずに初期化を開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await offlineOperationManager.initialize();
    });
  } else {
    // 既にDOMが読み込まれている場合は即座に初期化
    await offlineOperationManager.initialize();
  }
})();

// 既存の関数との互換性を保つ
function isOffline() { return !offlineOperationManager.isOnline; }
async function onOnline() { await offlineOperationManager.handleOnline(); }
async function onOffline() { await offlineOperationManager.handleOffline(); }
async function flushQueue() { await offlineOperationManager.performSync(); }
function showSyncModal() { offlineOperationManager.showSyncModal(); }
function hideSyncModal() { offlineOperationManager.hideSyncModal(); }
function readQueue() { return offlineOperationManager.readOperationQueue(); }
function writeQueue(queue) { offlineOperationManager.writeOperationQueue(queue); }
function readCache(group, day, timeslot) { return offlineOperationManager.readCache(group, day, timeslot); }
function writeCache(group, day, timeslot, data) { offlineOperationManager.writeCache(group, day, timeslot, data); }
function enqueue(operation) { offlineOperationManager.addOperation(operation); }
async function installOfflineOverrides() { await offlineOperationManager.installOfflineOverrides(); }
