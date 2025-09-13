// audit-manager.js
// 全スプレッドシート対応監査ログ管理システム

class AuditManager {
  constructor() {
    this.storageKey = 'AUDIT_LOGS';
    this.maxLogs = 5000; // 最大ログ数を増加
    this.isEnabled = true;
    this.autoSync = true;
    this.syncInterval = 10000; // 10秒間隔
    this.syncTimer = null;
    this.pendingLogs = [];
    this.lastSyncTime = 0;
    
    this.initialize();
  }

  initialize() {
    try {
      // 既存のログを読み込み
      this.logs = this.loadLogs();
      this.cleanupOldLogs();
      
      // 自動同期を開始
      if (this.autoSync) {
        this.startAutoSync();
      }
      
      console.log('[AuditManager] 初期化完了');
    } catch (error) {
      console.warn('[AuditManager] 初期化エラー:', error);
      this.logs = [];
    }
  }

  // 詳細な監査ログを記録
  async log(operation, details = {}) {
    if (!this.isEnabled) return;

    try {
      const logEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: operation,
        spreadsheetId: details.spreadsheetId || this.getCurrentSpreadsheetId(),
        group: details.group || this.getCurrentGroup(),
        day: details.day || this.getCurrentDay(),
        timeslot: details.timeslot || this.getCurrentTimeslot(),
        mode: this.getCurrentMode(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        deviceInfo: this.getDeviceInfo(),
        details: details,
        beforeData: details.beforeData || null,
        afterData: details.afterData || null,
        error: details.error || null,
        stackTrace: details.stackTrace || null
      };

      this.logs.unshift(logEntry);
      this.cleanupOldLogs();
      this.saveLogs();
      
      // 同期待ちのログに追加
      if (this.autoSync) {
        this.pendingLogs.push(logEntry);
      }
      
      // デバッグログ
      if (window.DEBUG_MODE) {
        console.log('[AuditManager]', logEntry);
      }
    } catch (error) {
      console.warn('[AuditManager] ログ記録エラー:', error);
    }
  }

  // 現在のスプレッドシートIDを取得
  getCurrentSpreadsheetId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const group = urlParams.get('group') || '見本演劇';
      const day = urlParams.get('day') || '1';
      const timeslot = urlParams.get('timeslot') || 'A';
      
      // SpreadsheetIds.gsの関数を呼び出し
      if (window.getSeatSheetId) {
        return window.getSeatSheetId(group, day, timeslot);
      }
      
      return null;
    } catch (error) {
      console.warn('[AuditManager] スプレッドシートID取得エラー:', error);
      return null;
    }
  }

  // 現在のグループを取得
  getCurrentGroup() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('group') || '見本演劇';
    } catch (error) {
      return '見本演劇';
    }
  }

  // 現在の日を取得
  getCurrentDay() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('day') || '1';
    } catch (error) {
      return '1';
    }
  }

  // 現在の時間帯を取得
  getCurrentTimeslot() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('timeslot') || 'A';
    } catch (error) {
      return 'A';
    }
  }

  // 現在のモードを取得
  getCurrentMode() {
    try {
      const currentMode = localStorage.getItem('currentMode') || 'normal';
      const isDemo = localStorage.getItem('DEMO_MODE_ACTIVE') === 'true';
      return {
        mode: currentMode,
        isDemo: isDemo,
        demoGroup: isDemo ? '見本演劇' : null
      };
    } catch (error) {
      return { mode: 'unknown', isDemo: false, demoGroup: null };
    }
  }

  // デバイス情報を取得
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString()
    };
  }

  // ログを読み込み
  loadLogs() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('[AuditManager] ログ読み込みエラー:', error);
      return [];
    }
  }

  // ログを保存
  saveLogs() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.logs = this.logs.slice(0, Math.floor(this.maxLogs / 2));
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (e) {
          console.warn('[AuditManager] ストレージ容量不足:', e);
        }
      }
    }
  }

  // 古いログをクリーンアップ
  cleanupOldLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
  }

  // ユニークID生成
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 自動同期を開始
  startAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(() => {
      this.syncToSpreadsheet();
    }, this.syncInterval);
  }

  // 自動同期を停止
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // スプレッドシートに同期
  async syncToSpreadsheet() {
    if (!this.autoSync || this.pendingLogs.length === 0) {
      return;
    }

    try {
      const logsToSync = [...this.pendingLogs];
      this.pendingLogs = [];

      // スプレッドシートID別にグループ化
      const logsBySpreadsheet = this.groupLogsBySpreadsheet(logsToSync);
      
      // 各スプレッドシートに同期
      for (const [spreadsheetId, logs] of Object.entries(logsBySpreadsheet)) {
        if (spreadsheetId && logs.length > 0) {
          const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', [spreadsheetId, logs]);
          
          if (result.success) {
            console.log(`[AuditManager] スプレッドシート ${spreadsheetId} に ${logs.length}件のログを同期`);
          } else {
            console.warn(`[AuditManager] スプレッドシート ${spreadsheetId} への同期失敗:`, result.message);
            // 失敗したログを同期待ちに戻す
            this.pendingLogs.unshift(...logs);
          }
        }
      }

      this.lastSyncTime = Date.now();
    } catch (error) {
      console.warn('[AuditManager] 同期エラー:', error);
    }
  }

  // ログをスプレッドシートID別にグループ化
  groupLogsBySpreadsheet(logs) {
    const grouped = {};
    
    logs.forEach(log => {
      const spreadsheetId = log.spreadsheetId;
      if (!grouped[spreadsheetId]) {
        grouped[spreadsheetId] = [];
      }
      grouped[spreadsheetId].push(log);
    });
    
    return grouped;
  }

  // 手動で同期を実行
  async manualSync() {
    if (!this.autoSync) {
      return { success: false, message: '自動同期が無効です' };
    }

    try {
      const logsToSync = [...this.pendingLogs];
      if (logsToSync.length === 0) {
        return { success: true, message: '同期するログがありません' };
      }

      this.pendingLogs = [];
      const logsBySpreadsheet = this.groupLogsBySpreadsheet(logsToSync);
      let totalSynced = 0;
      const errors = [];

      for (const [spreadsheetId, logs] of Object.entries(logsBySpreadsheet)) {
        if (spreadsheetId && logs.length > 0) {
          const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', [spreadsheetId, logs]);
          
          if (result.success) {
            totalSynced += logs.length;
          } else {
            errors.push(`スプレッドシート ${spreadsheetId}: ${result.message}`);
            this.pendingLogs.unshift(...logs);
          }
        }
      }

      this.lastSyncTime = Date.now();
      
      if (errors.length > 0) {
        return { 
          success: false, 
          message: `一部の同期に失敗しました: ${errors.join(', ')}`,
          syncedCount: totalSynced
        };
      } else {
        return { 
          success: true, 
          message: `${totalSynced}件のログを同期しました`,
          syncedCount: totalSynced
        };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // スプレッドシートからログを取得
  async getLogsFromSpreadsheet(spreadsheetId, limit = 100, offset = 0) {
    try {
      const result = await this.callGASAPI('getAuditLogsFromSpreadsheet', [spreadsheetId, limit, offset]);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // スプレッドシートから統計を取得
  async getStatsFromSpreadsheet(spreadsheetId) {
    try {
      const result = await this.callGASAPI('getAuditLogStatsFromSpreadsheet', [spreadsheetId]);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // GAS APIを呼び出す
  async callGASAPI(functionName, params = []) {
    try {
      const apiUrls = window.GAS_API_URLS || [
        "https://script.google.com/macros/s/AKfycbzEKu8evZEihhPQaDTbVUKr2ffR0aDYHcIa5kIOg6fvl_f4YOJEspmV41He3aKi4Ru9/exec"
      ];
      
      const apiUrl = apiUrls[0];
      const callback = 'auditManagerCallback';
      
      const encodedParams = params.map(param => encodeURIComponent(JSON.stringify(param)));
      const queryString = `func=${functionName}&params=${encodedParams.join('&params=')}&callback=${callback}`;
      
      return new Promise((resolve, reject) => {
        window[callback] = (response) => {
          delete window[callback];
          resolve(response);
        };
        
        const script = document.createElement('script');
        script.src = `${apiUrl}?${queryString}`;
        script.onerror = () => {
          delete window[callback];
          reject(new Error('API呼び出しに失敗しました'));
        };
        
        document.head.appendChild(script);
        
        setTimeout(() => {
          if (window[callback]) {
            delete window[callback];
            document.head.removeChild(script);
            reject(new Error('API呼び出しがタイムアウトしました'));
          }
        }, 15000);
      });
    } catch (error) {
      throw new Error(`GAS API呼び出しエラー: ${error.message}`);
    }
  }

  // ログを取得（フィルタリング対応）
  getLogs(filter = {}) {
    let filteredLogs = [...this.logs];

    if (filter.operation) {
      filteredLogs = filteredLogs.filter(log => log.operation === filter.operation);
    }
    if (filter.spreadsheetId) {
      filteredLogs = filteredLogs.filter(log => log.spreadsheetId === filter.spreadsheetId);
    }
    if (filter.group) {
      filteredLogs = filteredLogs.filter(log => log.group === filter.group);
    }
    if (filter.mode) {
      filteredLogs = filteredLogs.filter(log => log.mode.mode === filter.mode);
    }
    if (filter.isDemo !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.mode.isDemo === filter.isDemo);
    }
    if (filter.dateFrom) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(filter.dateFrom));
    }
    if (filter.dateTo) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(filter.dateTo));
    }

    return filteredLogs;
  }

  // 統計情報を取得
  getStats() {
    const logs = this.logs;
    const stats = {
      total: logs.length,
      byOperation: {},
      bySpreadsheet: {},
      byGroup: {},
      byMode: {},
      byDate: {},
      demoOperations: 0,
      normalOperations: 0,
      errorCount: 0
    };

    logs.forEach(log => {
      // 操作別統計
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      
      // スプレッドシート別統計
      if (log.spreadsheetId) {
        stats.bySpreadsheet[log.spreadsheetId] = (stats.bySpreadsheet[log.spreadsheetId] || 0) + 1;
      }
      
      // グループ別統計
      if (log.group) {
        stats.byGroup[log.group] = (stats.byGroup[log.group] || 0) + 1;
      }
      
      // モード別統計
      const mode = log.mode.mode;
      stats.byMode[mode] = (stats.byMode[mode] || 0) + 1;
      
      // DEMO/通常別統計
      if (log.mode.isDemo) {
        stats.demoOperations++;
      } else {
        stats.normalOperations++;
      }
      
      // エラー統計
      if (log.error) {
        stats.errorCount++;
      }
      
      // 日付別統計
      const date = log.timestamp.split('T')[0];
      stats.byDate[date] = (stats.byDate[date] || 0) + 1;
    });

    return stats;
  }

  // ログをクリア
  clearLogs() {
    try {
      this.logs = [];
      this.pendingLogs = [];
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.warn('[AuditManager] クリアエラー:', error);
      return false;
    }
  }

  // 設定を取得
  getConfig() {
    return {
      isEnabled: this.isEnabled,
      autoSync: this.autoSync,
      syncInterval: this.syncInterval,
      maxLogs: this.maxLogs,
      pendingLogs: this.pendingLogs.length,
      lastSyncTime: this.lastSyncTime
    };
  }

  // 設定を更新
  setConfig(config) {
    if (config.isEnabled !== undefined) {
      this.isEnabled = config.isEnabled;
    }
    if (config.autoSync !== undefined) {
      this.autoSync = config.autoSync;
      if (this.autoSync) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }
    }
    if (config.syncInterval !== undefined) {
      this.syncInterval = config.syncInterval;
      if (this.autoSync) {
        this.startAutoSync();
      }
    }
    if (config.maxLogs !== undefined) {
      this.maxLogs = config.maxLogs;
      this.cleanupOldLogs();
    }
  }
}

// グローバルインスタンス
const auditManager = new AuditManager();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.AuditManager = {
    log: (operation, details) => auditManager.log(operation, details),
    getLogs: (filter) => auditManager.getLogs(filter),
    getStats: () => auditManager.getStats(),
    manualSync: () => auditManager.manualSync(),
    getLogsFromSpreadsheet: (spreadsheetId, limit, offset) => auditManager.getLogsFromSpreadsheet(spreadsheetId, limit, offset),
    getStatsFromSpreadsheet: (spreadsheetId) => auditManager.getStatsFromSpreadsheet(spreadsheetId),
    clearLogs: () => auditManager.clearLogs(),
    getConfig: () => auditManager.getConfig(),
    setConfig: (config) => auditManager.setConfig(config),
    getCurrentSpreadsheetId: () => auditManager.getCurrentSpreadsheetId()
  };
}

export { auditManager, AuditManager };
