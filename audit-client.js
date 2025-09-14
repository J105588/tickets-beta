// audit-client.js
// 監査ログクライアント - GASを使わない完全再設計版

class AuditClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'ws://localhost:3000';
    this.deviceId = options.deviceId || this.generateDeviceId();
    this.deviceName = options.deviceName || this.getDeviceName();
    this.isEnabled = options.enabled !== false;
    this.autoSync = options.autoSync !== false;
    this.syncInterval = options.syncInterval || 5000; // 5秒間隔
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // 状態管理
    this.isConnected = false;
    this.ws = null;
    this.reconnectTimer = null;
    this.syncTimer = null;
    this.pendingLogs = [];
    this.retryCount = 0;
    
    // IndexedDB設定
    this.dbName = 'AuditLogsDB';
    this.dbVersion = 1;
    this.db = null;
    
    // 初期化
    this.init();
  }

  // 初期化
  async init() {
    try {
      await this.initIndexedDB();
      await this.connectToServer();
      this.startAutoSync();
      this.setupErrorHandling();
      console.log('✅ 監査ログクライアントが初期化されました');
    } catch (error) {
      console.error('❌ 監査ログクライアント初期化エラー:', error);
    }
  }

  // IndexedDB初期化
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // ログストア作成
        if (!db.objectStoreNames.contains('logs')) {
          const logStore = db.createObjectStore('logs', { keyPath: 'logId' });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
          logStore.createIndex('deviceId', 'deviceId', { unique: false });
          logStore.createIndex('operation', 'operation', { unique: false });
          logStore.createIndex('synced', 'synced', { unique: false });
        }
        
        // 設定ストア作成
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // サーバー接続
  async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          console.log('🔌 サーバーに接続しました');
          this.isConnected = true;
          this.retryCount = 0;
          
          // デバイス登録
          this.registerDevice();
          
          // 未送信ログを送信
          this.syncPendingLogs();
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
          } catch (error) {
            console.error('サーバーメッセージ解析エラー:', error);
          }
        };
        
        this.ws.onclose = () => {
          console.log('🔌 サーバー接続が切断されました');
          this.isConnected = false;
          this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocketエラー:', error);
          reject(error);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // デバイス登録
  registerDevice() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'register_device',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        userAgent: navigator.userAgent,
        ipAddress: this.getClientIP()
      }));
    }
  }

  // サーバーメッセージ処理
  handleServerMessage(data) {
    switch (data.type) {
      case 'connected':
        console.log('✅ サーバー接続確認:', data.clientId);
        break;
      case 'pong':
        // 接続確認応答
        break;
      case 'new_log':
        // 他の端末からのログ（監視用）
        this.handleNewLogFromServer(data.log);
        break;
      default:
        console.log('未知のサーバーメッセージ:', data.type);
    }
  }

  // 他の端末からのログ処理
  handleNewLogFromServer(log) {
    // 監視画面での表示用（必要に応じて実装）
    if (window.auditMonitor) {
      window.auditMonitor.addLogEntry(log);
    }
  }

  // ログ記録
  async log(operation, details = {}) {
    if (!this.isEnabled) return;

    try {
      const logEntry = {
        logId: this.generateLogId(),
        timestamp: new Date().toISOString(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        operation: operation,
        spreadsheetId: details.spreadsheetId || this.getCurrentSpreadsheetId(),
        groupName: details.groupName || this.getCurrentGroup(),
        day: details.day || this.getCurrentDay(),
        timeslot: details.timeslot || this.getCurrentTimeslot(),
        mode: details.mode || this.getCurrentMode(),
        isDemo: details.isDemo || this.isDemoMode(),
        demoGroup: details.demoGroup || this.getDemoGroup(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        deviceInfo: this.getDeviceInfo(),
        details: details,
        beforeData: details.beforeData || null,
        afterData: details.afterData || null,
        error: details.error || null,
        stackTrace: details.stackTrace || null,
        ipAddress: this.getClientIP(),
        synced: false
      };

      // ローカルストレージに保存
      await this.saveLogToIndexedDB(logEntry);
      
      // サーバーに送信
      if (this.isConnected) {
        this.sendLogToServer(logEntry);
      } else {
        this.pendingLogs.push(logEntry);
      }

      console.log(`📝 ログ記録: ${operation} (${this.deviceName})`);
      
    } catch (error) {
      console.error('ログ記録エラー:', error);
    }
  }

  // IndexedDBにログ保存
  async saveLogToIndexedDB(logEntry) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['logs'], 'readwrite');
      const store = transaction.objectStore('logs');
      const request = store.add(logEntry);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // サーバーにログ送信
  sendLogToServer(logEntry) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'log_entry',
        log: logEntry
      }));
    }
  }

  // 未送信ログの同期
  async syncPendingLogs() {
    try {
      const pendingLogs = await this.getPendingLogs();
      
      for (const log of pendingLogs) {
        this.sendLogToServer(log);
        await this.markLogAsSynced(log.logId);
      }
      
      this.pendingLogs = [];
      console.log(`📤 未送信ログを同期しました: ${pendingLogs.length}件`);
      
    } catch (error) {
      console.error('ログ同期エラー:', error);
    }
  }

  // 未送信ログ取得
  async getPendingLogs() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['logs'], 'readonly');
      const store = transaction.objectStore('logs');
      const index = store.index('synced');
      const request = index.getAll(false);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ログを同期済みにマーク
  async markLogAsSynced(logId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['logs'], 'readwrite');
      const store = transaction.objectStore('logs');
      const getRequest = store.get(logId);
      
      getRequest.onsuccess = () => {
        const log = getRequest.result;
        if (log) {
          log.synced = true;
          const putRequest = store.put(log);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 自動同期開始
  startAutoSync() {
    if (this.autoSync) {
      this.syncTimer = setInterval(() => {
        this.syncPendingLogs();
      }, this.syncInterval);
    }
  }

  // 自動同期停止
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // 再接続スケジュール
  scheduleReconnect() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
      
      console.log(`${delay}ms後に再接続を試行します (${this.retryCount}/${this.maxRetries})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connectToServer().catch(error => {
          console.error('再接続エラー:', error);
        });
      }, delay);
    } else {
      console.error('最大再接続回数に達しました');
    }
  }

  // エラーハンドリング設定
  setupErrorHandling() {
    // グローバルエラーハンドラー
    window.addEventListener('error', (event) => {
      this.log('javascript_error', {
        error: event.error?.message || 'Unknown error',
        stackTrace: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Promise拒否ハンドラー
    window.addEventListener('unhandledrejection', (event) => {
      this.log('unhandled_promise_rejection', {
        error: event.reason?.message || 'Unhandled promise rejection',
        stackTrace: event.reason?.stack
      });
    });
  }

  // ユーティリティ関数
  generateDeviceId() {
    return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateLogId() {
    return 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getDeviceName() {
    // モバイルデバイスの詳細な識別
    const userAgent = navigator.userAgent;
    let deviceName = navigator.platform;
    
    // iOS デバイスの詳細識別
    if (/iPad/.test(userAgent)) {
      deviceName = 'iPad';
    } else if (/iPhone/.test(userAgent)) {
      deviceName = 'iPhone';
    } else if (/iPod/.test(userAgent)) {
      deviceName = 'iPod Touch';
    } else if (/Android/.test(userAgent)) {
      if (/Mobile/.test(userAgent)) {
        deviceName = 'Android Phone';
      } else {
        deviceName = 'Android Tablet';
      }
    }
    
    // 画面サイズ情報を追加
    const screenInfo = `${screen.width}x${screen.height}`;
    return `${deviceName} (${screenInfo})`;
  }

  getDeviceInfo() {
    return {
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: screen.width,
      screenHeight: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      pixelRatio: window.devicePixelRatio || 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      orientation: screen.orientation ? screen.orientation.type : 'unknown',
      connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
      memory: navigator.deviceMemory || 'unknown'
    };
  }

  getClientIP() {
    // 実際のIPアドレス取得はサーバーサイドで行う
    return 'unknown';
  }

  getCurrentSpreadsheetId() {
    // 現在のスプレッドシートIDを取得（実装に応じて）
    return window.currentSpreadsheetId || 'unknown';
  }

  getCurrentGroup() {
    return window.currentGroup || 'unknown';
  }

  getCurrentDay() {
    return window.currentDay || 'unknown';
  }

  getCurrentTimeslot() {
    return window.currentTimeslot || 'unknown';
  }

  getCurrentMode() {
    return window.currentMode || 'unknown';
  }

  isDemoMode() {
    return window.isDemoMode || false;
  }

  getDemoGroup() {
    return window.demoGroup || null;
  }

  // 設定管理
  async setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);
      
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 統計取得
  async getStats() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['logs'], 'readonly');
      const store = transaction.objectStore('logs');
      const request = store.getAll();
      
      request.onsuccess = () => {
        const logs = request.result;
        const stats = {
          total: logs.length,
          synced: logs.filter(log => log.synced).length,
          pending: logs.filter(log => !log.synced).length,
          byOperation: {},
          byDevice: {},
          errors: logs.filter(log => log.error).length
        };
        
        logs.forEach(log => {
          stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
          stats.byDevice[log.deviceId] = (stats.byDevice[log.deviceId] || 0) + 1;
        });
        
        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 接続状態確認
  isServerConnected() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 手動同期
  async forceSync() {
    await this.syncPendingLogs();
  }

  // クリーンアップ
  destroy() {
    this.stopAutoSync();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.ws) {
      this.ws.close();
    }
    
    console.log('🔌 監査ログクライアントが終了しました');
  }
}

// グローバルインスタンス作成
window.auditClient = new AuditClient({
  serverUrl: 'ws://localhost:3000',
  enabled: true,
  autoSync: true
});

// 既存のauditManagerとの互換性を保つ
window.auditManager = {
  log: (operation, details) => window.auditClient.log(operation, details),
  isEnabled: () => window.auditClient.isEnabled,
  setEnabled: (enabled) => { window.auditClient.isEnabled = enabled; }
};

console.log('✅ 監査ログクライアントが読み込まれました');
