// audit-logger.js
// 監査ログ管理システム

class AuditLogger {
  constructor() {
    this.storageKey = 'AUDIT_LOGS';
    this.maxLogs = 1000; // 最大ログ数
    this.isEnabled = true;
    this.syncEnabled = true; // スプレッドシート同期機能
    this.syncInterval = 30000; // 30秒間隔で同期
    this.lastSyncTime = 0;
    this.pendingLogs = []; // 同期待ちのログ
    this.initialize();
  }

  initialize() {
    try {
      // 既存のログを読み込み
      this.logs = this.loadLogs();
      // 古いログをクリーンアップ
      this.cleanupOldLogs();
      
      // 同期機能を開始
      if (this.syncEnabled) {
        this.startSyncTimer();
      }
      
      // 同期マネージャーも初期化（存在する場合）
      if (typeof window !== 'undefined' && window.auditSyncManager) {
        console.log('[AuditLogger] 同期マネージャーと連携を開始');
      }
    } catch (error) {
      console.warn('[AuditLogger] 初期化エラー:', error);
      this.logs = [];
    }
  }

  // ログを記録（非同期、エラーを無視）
  async log(operation, details = {}) {
    if (!this.isEnabled) return;

    try {
      const logEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: operation,
        mode: this.getCurrentMode(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        details: details,
        beforeData: details.beforeData || null,
        afterData: details.afterData || null
      };

      this.logs.unshift(logEntry);
      this.cleanupOldLogs();
      this.saveLogs();
      
      // 同期待ちのログに追加
      if (this.syncEnabled) {
        this.pendingLogs.push(logEntry);
      }
      
      // デバッグログ（本番では無効化推奨）
      if (window.DEBUG_MODE) {
        console.log('[AuditLogger]', logEntry);
      }
    } catch (error) {
      // エラーを無視して主要機能を妨げない
      console.warn('[AuditLogger] ログ記録エラー（無視）:', error);
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
    } catch (_) {
      return { mode: 'unknown', isDemo: false, demoGroup: null };
    }
  }

  // ログを読み込み
  loadLogs() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  }

  // ログを保存
  saveLogs() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (error) {
      // ストレージ容量不足の場合は古いログを削除して再試行
      if (error.name === 'QuotaExceededError') {
        this.logs = this.logs.slice(0, Math.floor(this.maxLogs / 2));
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (_) {
          // それでも失敗した場合は諦める
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

  // ログを取得
  getLogs(filter = {}) {
    let filteredLogs = [...this.logs];

    if (filter.operation) {
      filteredLogs = filteredLogs.filter(log => log.operation === filter.operation);
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

  // ログをエクスポート
  exportLogs(format = 'json') {
    try {
      const data = this.getLogs();
      if (format === 'json') {
        return JSON.stringify(data, null, 2);
      } else if (format === 'csv') {
        return this.convertToCSV(data);
      }
      return data;
    } catch (error) {
      console.warn('[AuditLogger] エクスポートエラー:', error);
      return null;
    }
  }

  // CSV形式に変換
  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = ['ID', 'Timestamp', 'Operation', 'Mode', 'IsDemo', 'DemoGroup', 'URL', 'Details'];
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.operation,
      log.mode.mode,
      log.mode.isDemo,
      log.mode.demoGroup || '',
      log.url,
      JSON.stringify(log.details)
    ]);

    return [headers, ...rows].map(row => 
      row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  }

  // ログをクリア
  clearLogs() {
    try {
      this.logs = [];
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.warn('[AuditLogger] クリアエラー:', error);
      return false;
    }
  }

  // ログ機能の有効/無効切り替え
  setEnabled(enabled) {
    this.isEnabled = enabled;
    localStorage.setItem('AUDIT_LOGGER_ENABLED', enabled.toString());
  }

  // 統計情報を取得
  getStats() {
    const logs = this.logs;
    const stats = {
      total: logs.length,
      byOperation: {},
      byMode: {},
      byDate: {},
      demoOperations: 0,
      normalOperations: 0
    };

    logs.forEach(log => {
      // 操作別統計
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      
      // モード別統計
      const mode = log.mode.mode;
      stats.byMode[mode] = (stats.byMode[mode] || 0) + 1;
      
      // DEMO/通常別統計
      if (log.mode.isDemo) {
        stats.demoOperations++;
      } else {
        stats.normalOperations++;
      }
      
      // 日付別統計
      const date = log.timestamp.split('T')[0];
      stats.byDate[date] = (stats.byDate[date] || 0) + 1;
    });

    return stats;
  }

  // 同期タイマーを開始
  startSyncTimer() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(() => {
      this.syncToSpreadsheet();
    }, this.syncInterval);
  }

  // 同期タイマーを停止
  stopSyncTimer() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // スプレッドシートに同期
  async syncToSpreadsheet() {
    if (!this.syncEnabled || this.pendingLogs.length === 0) {
      return;
    }

    try {
      const logsToSync = [...this.pendingLogs];
      this.pendingLogs = [];

      // 現在のモード情報を取得
      const currentMode = this.getCurrentMode();
      const group = currentMode.demoGroup || '見本演劇';
      const day = '1'; // デフォルト値
      const timeslot = 'A'; // デフォルト値

      // GAS APIを呼び出して同期
      const result = await this.callGASAPI('syncAuditLogs', [logsToSync, group, day, timeslot]);
      
      if (result.success) {
        this.lastSyncTime = Date.now();
        console.log(`[AuditLogger] 同期完了: ${result.syncedCount}件のログを同期`);
      } else {
        // 同期に失敗した場合は同期待ちに戻す
        this.pendingLogs.unshift(...logsToSync);
        console.warn('[AuditLogger] 同期失敗:', result.message);
      }
    } catch (error) {
      console.warn('[AuditLogger] 同期エラー:', error);
    }
  }

  // 手動で同期を実行
  async manualSync() {
    if (!this.syncEnabled) {
      return { success: false, message: '同期機能が無効です' };
    }

    try {
      const logsToSync = [...this.pendingLogs];
      if (logsToSync.length === 0) {
        return { success: true, message: '同期するログがありません' };
      }

      this.pendingLogs = [];

      const currentMode = this.getCurrentMode();
      const group = currentMode.demoGroup || '見本演劇';
      const day = '1';
      const timeslot = 'A';

      const result = await this.callGASAPI('syncAuditLogs', [logsToSync, group, day, timeslot]);
      
      if (result.success) {
        this.lastSyncTime = Date.now();
        return { success: true, message: `${result.syncedCount}件のログを同期しました` };
      } else {
        this.pendingLogs.unshift(...logsToSync);
        return { success: false, message: result.message };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // スプレッドシートからログを取得
  async getLogsFromSpreadsheet(group = '見本演劇', day = '1', timeslot = 'A', limit = 100, offset = 0) {
    try {
      const result = await this.callGASAPI('getAuditLogs', [group, day, timeslot, limit, offset]);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // スプレッドシートから統計を取得
  async getStatsFromSpreadsheet(group = '見本演劇', day = '1', timeslot = 'A') {
    try {
      const result = await this.callGASAPI('getAuditLogStats', [group, day, timeslot]);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // スプレッドシートからログをエクスポート
  async exportLogsFromSpreadsheet(group = '見本演劇', day = '1', timeslot = 'A', format = 'json') {
    try {
      const result = await this.callGASAPI('exportAuditLogs', [group, day, timeslot, format]);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // GAS APIを呼び出す
  async callGASAPI(functionName, params = []) {
    try {
      // config.jsからAPI URLを取得
      const apiUrls = window.GAS_API_URLS || [
        "https://script.google.com/macros/s/AKfycbzEKu8evZEihhPQaDTbVUKr2ffR0aDYHcIa5kIOg6fvl_f4YOJEspmV41He3aKi4Ru9/exec"
      ];
      
      const apiUrl = apiUrls[0]; // 最初のURLを使用
      const callback = 'auditLoggerCallback';
      
      // パラメータをエンコード
      const encodedParams = params.map(param => encodeURIComponent(JSON.stringify(param)));
      const queryString = `func=${functionName}&params=${encodedParams.join('&params=')}&callback=${callback}`;
      
      return new Promise((resolve, reject) => {
        // コールバック関数をグローバルに設定
        window[callback] = (response) => {
          delete window[callback];
          resolve(response);
        };
        
        // スクリプトタグを作成してAPIを呼び出し
        const script = document.createElement('script');
        script.src = `${apiUrl}?${queryString}`;
        script.onerror = () => {
          delete window[callback];
          reject(new Error('API呼び出しに失敗しました'));
        };
        
        document.head.appendChild(script);
        
        // タイムアウト設定（10秒）
        setTimeout(() => {
          if (window[callback]) {
            delete window[callback];
            document.head.removeChild(script);
            reject(new Error('API呼び出しがタイムアウトしました'));
          }
        }, 10000);
      });
    } catch (error) {
      throw new Error(`GAS API呼び出しエラー: ${error.message}`);
    }
  }

  // 同期機能の有効/無効切り替え
  setSyncEnabled(enabled) {
    this.syncEnabled = enabled;
    if (enabled) {
      this.startSyncTimer();
    } else {
      this.stopSyncTimer();
    }
    localStorage.setItem('AUDIT_LOGGER_SYNC_ENABLED', enabled.toString());
  }

  // 同期間隔を設定
  setSyncInterval(interval) {
    this.syncInterval = interval;
    if (this.syncEnabled) {
      this.startSyncTimer();
    }
    localStorage.setItem('AUDIT_LOGGER_SYNC_INTERVAL', interval.toString());
  }
}

// グローバルインスタンス
const auditLogger = new AuditLogger();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.AuditLogger = {
    getLogs: (filter) => auditLogger.getLogs(filter),
    exportLogs: (format) => auditLogger.exportLogs(format),
    clearLogs: () => auditLogger.clearLogs(),
    getStats: () => auditLogger.getStats(),
    setEnabled: (enabled) => auditLogger.setEnabled(enabled),
    isEnabled: () => auditLogger.isEnabled,
    // 同期機能
    manualSync: () => auditLogger.manualSync(),
    getLogsFromSpreadsheet: (group, day, timeslot, limit, offset) => auditLogger.getLogsFromSpreadsheet(group, day, timeslot, limit, offset),
    getStatsFromSpreadsheet: (group, day, timeslot) => auditLogger.getStatsFromSpreadsheet(group, day, timeslot),
    exportLogsFromSpreadsheet: (group, day, timeslot, format) => auditLogger.exportLogsFromSpreadsheet(group, day, timeslot, format),
    setSyncEnabled: (enabled) => auditLogger.setSyncEnabled(enabled),
    setSyncInterval: (interval) => auditLogger.setSyncInterval(interval),
    getSyncStatus: () => ({
      syncEnabled: auditLogger.syncEnabled,
      pendingLogs: auditLogger.pendingLogs.length,
      lastSyncTime: auditLogger.lastSyncTime,
      syncInterval: auditLogger.syncInterval
    })
  };
}

export { auditLogger, AuditLogger };
