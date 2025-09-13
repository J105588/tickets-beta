// audit-manager.js
// 全スプレッドシート対応監査ログ管理システム

// config.jsから監査ログ専用スプレッドシートIDとGAS API URLをインポート
import { AUDIT_LOG_SPREADSHEET_ID, GAS_API_URLS } from './config.js';

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
    this.logs = []; // ログ配列を初期化
    this.syncFailureCount = 0; // 同期失敗カウンターを初期化
    
    this.initialize();
  }

  initialize() {
    try {
      console.log('[AuditManager] 初期化開始');
      
      // 既存のログを読み込み
      this.logs = this.loadLogs();
      console.log(`[AuditManager] 読み込まれたログ数: ${this.logs.length}件`);
      
      this.cleanupOldLogs();
      console.log(`[AuditManager] クリーンアップ後のログ数: ${this.logs.length}件`);
      
      // 自動同期を開始
      if (this.autoSync) {
        this.startAutoSync();
        console.log('[AuditManager] 自動同期を開始しました');
      }
      
      console.log('[AuditManager] 初期化完了');
    } catch (error) {
      console.error('[AuditManager] 初期化エラー:', error);
      // 初期化に失敗しても基本的な機能は利用可能にする
      this.logs = [];
      this.autoSync = false; // 自動同期を無効化
      this.pendingLogs = [];
      console.log('[AuditManager] 初期化に失敗しましたが、基本的な機能は利用可能です');
    }
  }

  // 詳細な監査ログを記録
  async log(operation, details = {}) {
    if (!this.isEnabled) return;

    try {
      // ファイル名と識別子を取得
      const fileName = this.getCurrentFileName();
      const identifier = this.getCurrentIdentifier();
      
      const logEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: operation,
        fileName: fileName,
        identifier: identifier,
        // 監査ログ専用スプレッドシートIDを使用
        auditLogSpreadsheetId: this.getAuditLogSpreadsheetId(),
        // 元のスプレッドシートIDも記録（参照用）
        originalSpreadsheetId: details.spreadsheetId || this.getCurrentSpreadsheetId(),
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

      // ログ配列が初期化されていることを確認
      if (!Array.isArray(this.logs)) {
        console.warn('[AuditManager] ログ配列が初期化されていません - 初期化します');
        this.logs = [];
      }
      
      this.logs.unshift(logEntry);
      this.cleanupOldLogs();
      
      // ログ保存を試行
      try {
        this.saveLogs();
        console.log(`[AuditManager] ログ記録成功: ${operation} (ID: ${logEntry.id})`);
      } catch (saveError) {
        console.error('[AuditManager] ログ保存に失敗:', saveError);
        // 保存に失敗してもログは記録されているので継続
      }
      
      // 同期待ちのログに追加
      if (this.autoSync) {
        this.pendingLogs.push(logEntry);
      }
      
      // デバッグログ
      if (window.DEBUG_MODE) {
        console.log('[AuditManager]', logEntry);
      }
    } catch (error) {
      console.error('[AuditManager] ログ記録エラー:', error);
      // ログ記録に失敗してもアプリケーションの動作は継続
      // エラーを再スローしない
    }
  }

  // 監査ログ専用スプレッドシートIDを取得
  getAuditLogSpreadsheetId() {
    try {
      // config.jsから監査ログ専用スプレッドシートIDを取得
      if (typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined' && AUDIT_LOG_SPREADSHEET_ID) {
        if (AUDIT_LOG_SPREADSHEET_ID !== 'YOUR_AUDIT_LOG_SPREADSHEET_ID_HERE') {
          return AUDIT_LOG_SPREADSHEET_ID;
        }
      }
      
      // デバッグ情報を出力
      if (window.DEBUG_MODE) {
        console.warn('[AuditManager] 監査ログ専用スプレッドシートID取得失敗:', {
          AUDIT_LOG_SPREADSHEET_ID_Available: typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined',
          AUDIT_LOG_SPREADSHEET_ID_Value: typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined' ? AUDIT_LOG_SPREADSHEET_ID : 'undefined'
        });
      }
      
      return null;
    } catch (error) {
      console.warn('[AuditManager] 監査ログ専用スプレッドシートID取得エラー:', error);
      return null;
    }
  }

  // 現在のスプレッドシートIDを取得（座席管理用）
  getCurrentSpreadsheetId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const group = urlParams.get('group') || '見本演劇';
      const day = urlParams.get('day') || '1';
      const timeslot = urlParams.get('timeslot') || 'A';
      
      // SpreadsheetIds.gsの関数を呼び出し
      if (window.getSeatSheetId && typeof window.getSeatSheetId === 'function') {
        const spreadsheetId = window.getSeatSheetId(group, day, timeslot);
        // 有効なIDかチェック
        if (spreadsheetId && spreadsheetId !== 'null' && spreadsheetId !== 'undefined') {
          return spreadsheetId;
        }
      }
      
      // デバッグ情報を出力
      if (window.DEBUG_MODE) {
        console.warn('[AuditManager] スプレッドシートID取得失敗:', {
          group,
          day,
          timeslot,
          getSeatSheetIdAvailable: !!window.getSeatSheetId,
          getSeatSheetIdType: typeof window.getSeatSheetId
        });
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

  // 現在のファイル名を取得
  getCurrentFileName() {
    try {
      const path = window.location.pathname;
      const fileName = path.split('/').pop() || 'index.html';
      return fileName;
    } catch (error) {
      return 'unknown';
    }
  }

  // 現在の識別子を取得（ページ固有の識別子）
  getCurrentIdentifier() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const group = urlParams.get('group') || '見本演劇';
      const day = urlParams.get('day') || '1';
      const timeslot = urlParams.get('timeslot') || 'A';
      const fileName = this.getCurrentFileName();
      
      // ファイル名とパラメータを組み合わせた識別子
      return `${fileName}-${group}-${day}-${timeslot}`;
    } catch (error) {
      return this.getCurrentFileName();
    }
  }

  // ログを読み込み
  loadLogs() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        console.log('[AuditManager] 保存されたログが見つかりません - 空の配列を返します');
        return [];
      }
      
      const parsedLogs = JSON.parse(stored);
      if (!Array.isArray(parsedLogs)) {
        console.warn('[AuditManager] 保存されたデータが配列ではありません - 空の配列を返します');
        return [];
      }
      
      console.log(`[AuditManager] ログ読み込み成功: ${parsedLogs.length}件`);
      return parsedLogs;
    } catch (error) {
      console.error('[AuditManager] ログ読み込みエラー:', error);
      console.warn('[AuditManager] 破損したログデータをクリアします');
      
      // 破損したデータをクリア
      try {
        localStorage.removeItem(this.storageKey);
        console.log('[AuditManager] 破損したログデータを削除しました');
      } catch (clearError) {
        console.error('[AuditManager] ログデータの削除に失敗:', clearError);
      }
      
      return [];
    }
  }

  // ログを保存
  saveLogs() {
    try {
      const logsToSave = this.logs || [];
      const jsonString = JSON.stringify(logsToSave);
      
      console.log(`[AuditManager] ログ保存開始: ${logsToSave.length}件, サイズ: ${jsonString.length}文字`);
      
      localStorage.setItem(this.storageKey, jsonString);
      
      console.log('[AuditManager] ログ保存成功');
    } catch (error) {
      console.error('[AuditManager] ログ保存エラー:', error);
      
      if (error.name === 'QuotaExceededError') {
        console.warn('[AuditManager] ストレージ容量不足 - ログを削減して再試行');
        this.logs = this.logs.slice(0, Math.floor(this.maxLogs / 2));
        try {
          const reducedJsonString = JSON.stringify(this.logs);
          localStorage.setItem(this.storageKey, reducedJsonString);
          console.log(`[AuditManager] ログ削減後保存成功: ${this.logs.length}件`);
        } catch (e) {
          console.error('[AuditManager] ログ削減後も保存失敗:', e);
          // 最後の手段として、ログを完全にクリア
          this.logs = [];
          try {
            localStorage.setItem(this.storageKey, '[]');
            console.log('[AuditManager] ログをクリアして保存');
          } catch (finalError) {
            console.error('[AuditManager] 最終的な保存も失敗:', finalError);
          }
        }
      } else {
        console.error('[AuditManager] 予期しない保存エラー:', error);
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

      // 監査ログ専用スプレッドシートIDを取得
      const auditLogSpreadsheetId = this.getAuditLogSpreadsheetId();
      
      if (!auditLogSpreadsheetId) {
        console.warn('[AuditManager] 監査ログ専用スプレッドシートIDが設定されていません');
        // 失敗したログを同期待ちに戻す
        this.pendingLogs.unshift(...logsToSync);
        return;
      }

      // ログの検証
      if (!Array.isArray(logsToSync) || logsToSync.length === 0) {
        console.warn('[AuditManager] 同期するログが無効です:', logsToSync);
        return;
      }

      // 各ログの検証
      const validLogs = logsToSync.filter(log => {
        if (!log || typeof log !== 'object') {
          console.warn('[AuditManager] 無効なログをスキップ:', log);
          return false;
        }
        return true;
      });

      if (validLogs.length === 0) {
        console.warn('[AuditManager] 有効なログがありません');
        return;
      }

      try {
        // デバッグ情報を出力
        console.log('[AuditManager] 同期開始:', {
          auditLogSpreadsheetId,
          logsCount: validLogs.length,
          logsToSyncType: typeof validLogs,
          isLogsArray: Array.isArray(validLogs),
          firstLog: validLogs[0] ? {
            id: validLogs[0].id,
            operation: validLogs[0].operation,
            fileName: validLogs[0].fileName,
            type: typeof validLogs[0]
          } : null,
          allLogs: validLogs
        });
        
        const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', [auditLogSpreadsheetId, validLogs]);
        
        if (result && result.success) {
          console.log(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} に ${validLogs.length}件のログを同期`);
          // 成功時は失敗カウンターをリセット
          this.syncFailureCount = 0;
        } else {
          const errorMessage = result?.message || result?.error || '不明なエラー';
          console.warn(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} への同期失敗:`, errorMessage);
          
          // 失敗回数をカウント
          this.syncFailureCount = (this.syncFailureCount || 0) + 1;
          
          // 連続失敗が5回未満の場合のみ再試行
          if (this.syncFailureCount < 5) {
            this.pendingLogs.unshift(...validLogs);
            console.log(`[AuditManager] 同期失敗回数: ${this.syncFailureCount}/5 - 再試行します`);
          } else {
            console.warn(`[AuditManager] 同期失敗回数が上限に達しました (${this.syncFailureCount}/5) - ログを破棄します`);
            // 失敗回数が上限に達した場合は、ログを破棄してアプリケーションの動作を継続
            this.syncFailureCount = 0; // リセット
          }
        }
      } catch (apiError) {
        console.warn(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} へのAPI呼び出しエラー:`, apiError.message);
        
        // 失敗回数をカウント
        this.syncFailureCount = (this.syncFailureCount || 0) + 1;
        
        // 連続失敗が5回未満の場合のみ再試行
        if (this.syncFailureCount < 5) {
          this.pendingLogs.unshift(...validLogs);
          console.log(`[AuditManager] API呼び出し失敗回数: ${this.syncFailureCount}/5 - 再試行します`);
        } else {
          console.warn(`[AuditManager] API呼び出し失敗回数が上限に達しました (${this.syncFailureCount}/5) - ログを破棄します`);
          // 失敗回数が上限に達した場合は、ログを破棄してアプリケーションの動作を継続
          this.syncFailureCount = 0; // リセット
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
      
      // 監査ログ専用スプレッドシートIDを取得
      const auditLogSpreadsheetId = this.getAuditLogSpreadsheetId();
      
      if (!auditLogSpreadsheetId) {
        return { success: false, message: '監査ログ専用スプレッドシートIDが設定されていません' };
      }

      try {
        const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', [auditLogSpreadsheetId, logsToSync]);
        
        if (result && result.success) {
          this.lastSyncTime = Date.now();
          return { 
            success: true, 
            message: `${logsToSync.length}件のログを監査ログ専用スプレッドシートに同期しました`,
            syncedCount: logsToSync.length
          };
        } else {
          const errorMessage = result?.message || result?.error || '不明なエラー';
          console.warn(`[AuditManager] 手動同期失敗: ${errorMessage}`);
          // 手動同期の場合は失敗してもログを破棄して成功として扱う
          return { 
            success: true, 
            message: `監査ログ専用スプレッドシートへの同期に失敗しましたが、アプリケーションは正常に動作します: ${errorMessage}`,
            syncedCount: 0,
            warning: true
          };
        }
      } catch (apiError) {
        console.warn(`[AuditManager] 手動同期API呼び出しエラー: ${apiError.message}`);
        // 手動同期の場合は失敗してもログを破棄して成功として扱う
        return { 
          success: true, 
          message: `監査ログ専用スプレッドシートへのAPI呼び出しエラーが発生しましたが、アプリケーションは正常に動作します: ${apiError.message}`,
          syncedCount: 0,
          warning: true
        };
      }
    } catch (error) {
      console.warn(`[AuditManager] 手動同期全体エラー: ${error.message}`);
      // 手動同期の場合は失敗しても成功として扱う
      return { 
        success: true, 
        message: `手動同期中にエラーが発生しましたが、アプリケーションは正常に動作します: ${error.message}`,
        warning: true
      };
    }
  }

  // スプレッドシートからログを取得
  async getLogsFromSpreadsheet(spreadsheetId, limit = 100, offset = 0) {
    try {
      const result = await this.callGASAPI('getAuditLogsFromSpreadsheet', [spreadsheetId, limit, offset]);
      return result;
    } catch (error) {
      console.warn(`[AuditManager] ログ取得エラー: ${error.message}`);
      // ログ取得に失敗しても空の結果を返してアプリケーションの動作を継続
      return { success: true, logs: [], total: 0, message: 'ログの取得に失敗しましたが、アプリケーションは正常に動作します' };
    }
  }

  // スプレッドシートから統計を取得
  async getStatsFromSpreadsheet(spreadsheetId) {
    try {
      const result = await this.callGASAPI('getAuditLogStatsFromSpreadsheet', [spreadsheetId]);
      return result;
    } catch (error) {
      console.warn(`[AuditManager] 統計取得エラー: ${error.message}`);
      // 統計取得に失敗しても空の結果を返してアプリケーションの動作を継続
      return { success: true, stats: {}, message: '統計の取得に失敗しましたが、アプリケーションは正常に動作します' };
    }
  }

  // GAS APIを呼び出す
  async callGASAPI(functionName, params = []) {
    try {
      // デバッグ情報を出力
      console.log('[AuditManager] callGASAPI呼び出し:', {
        functionName,
        params,
        paramsType: typeof params,
        isArray: Array.isArray(params),
        paramsLength: params ? params.length : 'undefined'
      });
      
      const apiUrls = GAS_API_URLS || [
        "https://script.google.com/macros/s/AKfycbzEKu8evZEihhPQaDTbVUKr2ffR0aDYHcIa5kIOg6fvl_f4YOJEspmV41He3aKi4Ru9/exec"
      ];
      
      const apiUrl = apiUrls[0];
      const callback = 'auditManagerCallback';
      
      // パラメータの検証とエンコード
      const safeParams = Array.isArray(params) ? params : [];
      console.log('[AuditManager] 安全なパラメータ:', safeParams);
      
      const encodedParams = safeParams.map((param, index) => {
        try {
          console.log(`[AuditManager] パラメータ ${index} をエンコード中:`, param, typeof param);
          return encodeURIComponent(JSON.stringify(param));
        } catch (error) {
          console.warn(`[AuditManager] パラメータ ${index} エンコードエラー:`, error, param);
          return encodeURIComponent(JSON.stringify(String(param)));
        }
      });
      
      console.log('[AuditManager] エンコードされたパラメータ:', encodedParams);
      const queryString = `func=${functionName}&params=${encodedParams.join('&params=')}&callback=${callback}`;
      console.log('[AuditManager] クエリ文字列:', queryString);
      
      return new Promise((resolve, reject) => {
        window[callback] = (response) => {
          delete window[callback];
          resolve(response);
        };
        
        const script = document.createElement('script');
        script.src = `${apiUrl}?${queryString}`;
        script.onerror = () => {
          delete window[callback];
          // エラーをresolveで返して、呼び出し側で処理できるようにする
          resolve({ success: false, error: `API呼び出しに失敗しました: ${functionName}` });
        };
        
        document.head.appendChild(script);
        
        setTimeout(() => {
          if (window[callback]) {
            delete window[callback];
            document.head.removeChild(script);
            // タイムアウトもresolveで返して、呼び出し側で処理できるようにする
            resolve({ success: false, error: 'API呼び出しがタイムアウトしました' });
          }
        }, 15000);
      });
    } catch (error) {
      console.error('[AuditManager] callGASAPI エラー詳細:', {
        error: error,
        message: error.message,
        stack: error.stack,
        functionName,
        params
      });
      // エラーをthrowせずに、エラー情報を含むオブジェクトを返す
      return { success: false, error: `GAS API呼び出しエラー: ${error.message}` };
    }
  }

  // ログシステムの状態を取得
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      autoSync: this.autoSync,
      logsCount: this.logs ? this.logs.length : 0,
      pendingLogsCount: this.pendingLogs ? this.pendingLogs.length : 0,
      lastSyncTime: this.lastSyncTime,
      syncFailureCount: this.syncFailureCount || 0,
      storageKey: this.storageKey,
      maxLogs: this.maxLogs
    };
  }

  // ログを取得（フィルタリング対応）
  getLogs(filter = {}) {
    if (!Array.isArray(this.logs)) {
      console.warn('[AuditManager] ログ配列が初期化されていません');
      return [];
    }
    
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

  // GAS APIのテスト関数
  async testGASAPI() {
    try {
      const result = await this.callGASAPI('testApi', []);
      console.log('[AuditManager] GAS APIテスト結果:', result);
      return result;
    } catch (error) {
      console.error('[AuditManager] GAS APIテスト失敗:', error);
      return { success: false, error: error.message };
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
    getCurrentSpreadsheetId: () => auditManager.getCurrentSpreadsheetId(),
    testGASAPI: () => auditManager.testGASAPI(),
    getStatus: () => auditManager.getStatus(),
    debug: () => {
      console.log('=== AuditManager Debug Info ===');
      console.log('Status:', auditManager.getStatus());
      console.log('Logs:', auditManager.getLogs());
      console.log('LocalStorage:', localStorage.getItem('AUDIT_LOGS'));
      console.log('===============================');
    }
  };
}

export { auditManager, AuditManager };
