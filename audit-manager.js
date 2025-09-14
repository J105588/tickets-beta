// audit-manager.js
// 全スプレッドシート対応監査ログ管理システム

// config.jsから監査ログ専用スプレッドシートIDとGAS API URLをインポート
import { AUDIT_LOG_SPREADSHEET_ID, GAS_API_URLS } from './config.js';
import { ErrorAnalyzer } from './error-analyzer.js';

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
    
    // エラーモニタリング用のプロパティ
    this.errorHandler = null;
    this.rejectionHandler = null;
    this.errorAnalysisInterval = null;
    this.memoryCleanupInterval = null;
    
    // エラー追跡システム
    this.errorTracker = {
      errors: [],
      maxErrors: 100,
      addError: (error, context = {}) => {
        const errorEntry = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          timestamp: new Date().toISOString(),
          error: {
            message: error.message || String(error),
            stack: error.stack || 'No stack trace available',
            name: error.name || 'UnknownError'
          },
          context: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            ...context
          },
          severity: this.getErrorSeverity(error)
        };
        
        this.errorTracker.errors.unshift(errorEntry);
        if (this.errorTracker.errors.length > this.errorTracker.maxErrors) {
          this.errorTracker.errors = this.errorTracker.errors.slice(0, this.errorTracker.maxErrors);
        }
        
        console.error('[AuditManager Error Tracker]', errorEntry);
        return errorEntry.id;
      },
      getErrors: (filter = {}) => {
        let filteredErrors = [...this.errorTracker.errors];
        
        if (filter.severity) {
          filteredErrors = filteredErrors.filter(e => e.severity === filter.severity);
        }
        if (filter.since) {
          const sinceDate = new Date(filter.since);
          filteredErrors = filteredErrors.filter(e => new Date(e.timestamp) >= sinceDate);
        }
        
        return filteredErrors;
      },
      clearErrors: () => {
        this.errorTracker.errors = [];
      }
    };
    
    // エラー分析器を初期化
    this.errorAnalyzer = new ErrorAnalyzer();
    
    // エラーモニタリングを開始
    this.startErrorMonitoring();
    
    this.initialize();
  }

  // エラーの重要度を判定
  getErrorSeverity(error) {
    const message = error.message || String(error);
    const name = error.name || '';
    
    // クリティカルなエラー
    if (name.includes('TypeError') || name.includes('ReferenceError') || 
        message.includes('CreateListFromArrayLike') || message.includes('Cannot read property')) {
      return 'critical';
    }
    
    // ネットワーク関連エラー
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout') ||
        message.includes('API') || message.includes('GAS')) {
      return 'network';
    }
    
    // 同期関連エラー
    if (message.includes('sync') || message.includes('同期') || message.includes('spreadsheet')) {
      return 'sync';
    }
    
    // その他のエラー
    return 'warning';
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
        console.log('[AuditManager] 自動同期を開始しました', {
          autoSync: this.autoSync,
          syncInterval: this.syncInterval,
          pendingLogsLength: this.pendingLogs.length
        });
      } else {
        console.log('[AuditManager] 自動同期は無効です', {
          autoSync: this.autoSync,
          pendingLogsLength: this.pendingLogs.length
        });
      }
      
      console.log('[AuditManager] 初期化完了');
    } catch (error) {
      const errorId = this.errorTracker.addError(error, {
        phase: 'initialization',
        logsCount: this.logs ? this.logs.length : 0,
        autoSync: this.autoSync
      });
      
      console.error(`[AuditManager] 初期化エラー (ID: ${errorId}):`, error);
      
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
        console.log('[AuditManager] pendingLogsに追加:', {
          logId: logEntry.id,
          operation: logEntry.operation,
          pendingLogsLength: this.pendingLogs.length
        });
      } else {
        console.log('[AuditManager] autoSyncが無効のため、pendingLogsに追加しません:', {
          autoSync: this.autoSync,
          logId: logEntry.id,
          operation: logEntry.operation
        });
      }
      
      // デバッグログ
      if (window.DEBUG_MODE) {
        console.log('[AuditManager]', logEntry);
      }
    } catch (error) {
      const errorId = this.errorTracker.addError(error, {
        phase: 'log_recording',
        operation: operation,
        details: details,
        logsCount: this.logs ? this.logs.length : 0
      });
      
      console.error(`[AuditManager] ログ記録エラー (ID: ${errorId}):`, error);
      // ログ記録に失敗してもアプリケーションの動作は継続
      // エラーを再スローしない
    }
  }

  // 監査ログ専用スプレッドシートIDを取得
  getAuditLogSpreadsheetId() {
    try {
      // config.jsから監査ログ専用スプレッドシートIDを取得
      if (typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined' && AUDIT_LOG_SPREADSHEET_ID) {
        // 有効なスプレッドシートIDかチェック（GoogleスプレッドシートIDの形式）
        if (AUDIT_LOG_SPREADSHEET_ID !== 'YOUR_AUDIT_LOG_SPREADSHEET_ID_HERE' && 
            AUDIT_LOG_SPREADSHEET_ID.length > 20 && 
            /^[a-zA-Z0-9_-]+$/.test(AUDIT_LOG_SPREADSHEET_ID)) {
          return AUDIT_LOG_SPREADSHEET_ID;
        }
      }
      
      // デバッグ情報を出力
      if (window.DEBUG_MODE) {
        console.warn('[AuditManager] 監査ログ専用スプレッドシートID取得失敗:', {
          AUDIT_LOG_SPREADSHEET_ID_Available: typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined',
          AUDIT_LOG_SPREADSHEET_ID_Value: typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined' ? AUDIT_LOG_SPREADSHEET_ID : 'undefined',
          isValidFormat: typeof AUDIT_LOG_SPREADSHEET_ID !== 'undefined' ? 
            (AUDIT_LOG_SPREADSHEET_ID.length > 20 && /^[a-zA-Z0-9_-]+$/.test(AUDIT_LOG_SPREADSHEET_ID)) : false
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

  // 古いログをクリーンアップ（改良版）
  cleanupOldLogs() {
    try {
      const originalLength = this.logs.length;
      
      if (originalLength > this.maxLogs) {
        // 古いログを削除（新しいログを保持）
        this.logs = this.logs.slice(0, this.maxLogs);
        console.log(`[AuditManager] ログクリーンアップ: ${originalLength}件 → ${this.logs.length}件`);
        
        // 同期待ちのログもクリーンアップ
        if (this.pendingLogs.length > this.maxLogs / 2) {
          this.pendingLogs = this.pendingLogs.slice(0, Math.floor(this.maxLogs / 2));
          console.log(`[AuditManager] 同期待ちログクリーンアップ: ${this.pendingLogs.length}件`);
        }
        
        // ストレージに保存
        this.saveLogs();
      }
      
      // メモリ使用量の監視
      this.monitorMemoryUsage();
      
    } catch (error) {
      console.error('[AuditManager] ログクリーンアップエラー:', error);
      // エラーが発生した場合は最小限のクリーンアップを実行
      if (this.logs.length > this.maxLogs * 2) {
        this.logs = this.logs.slice(0, this.maxLogs);
        console.log('[AuditManager] 緊急ログクリーンアップを実行しました');
      }
    }
  }

  // メモリ使用量の監視
  monitorMemoryUsage() {
    try {
      // ログデータのサイズを推定
      const logsJson = JSON.stringify(this.logs);
      const logsSizeKB = Math.round(logsJson.length / 1024);
      
      // 同期待ちログのサイズを推定
      const pendingJson = JSON.stringify(this.pendingLogs);
      const pendingSizeKB = Math.round(pendingJson.length / 1024);
      
      const totalSizeKB = logsSizeKB + pendingSizeKB;
      
      // メモリ使用量が大きすぎる場合は警告
      if (totalSizeKB > 1024) { // 1MB以上
        console.warn(`[AuditManager] メモリ使用量が大きくなっています: ${totalSizeKB}KB`);
        
        // 2MB以上の場合、より積極的なクリーンアップを実行
        if (totalSizeKB > 2048) {
          console.warn('[AuditManager] メモリ使用量が過大です。積極的なクリーンアップを実行します');
          this.aggressiveCleanup();
        }
      }
      
      // デバッグ情報を出力
      if (window.DEBUG_MODE) {
        console.log(`[AuditManager] メモリ使用量: ログ ${logsSizeKB}KB, 同期待ち ${pendingSizeKB}KB, 合計 ${totalSizeKB}KB`);
      }
      
    } catch (error) {
      console.warn('[AuditManager] メモリ監視エラー:', error);
    }
  }

  // 積極的なクリーンアップ
  aggressiveCleanup() {
    try {
      // ログ数を半分に削減
      const originalLogsCount = this.logs.length;
      this.logs = this.logs.slice(0, Math.floor(this.maxLogs / 2));
      
      // 同期待ちログも削減
      const originalPendingCount = this.pendingLogs.length;
      this.pendingLogs = this.pendingLogs.slice(0, Math.floor(this.maxLogs / 4));
      
      // エラーログも削減
      if (this.errorTracker.errors.length > 50) {
        this.errorTracker.errors = this.errorTracker.errors.slice(0, 50);
      }
      
      console.log(`[AuditManager] 積極的クリーンアップ完了: ログ ${originalLogsCount}→${this.logs.length}, 同期待ち ${originalPendingCount}→${this.pendingLogs.length}`);
      
      // ストレージに保存
      this.saveLogs();
      
    } catch (error) {
      console.error('[AuditManager] 積極的クリーンアップエラー:', error);
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
      console.log('[AuditManager] 同期タイマー実行:', {
        pendingLogsLength: this.pendingLogs.length,
        autoSync: this.autoSync
      });
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
    console.log('[AuditManager] syncToSpreadsheet called:', {
      autoSync: this.autoSync,
      pendingLogsLength: this.pendingLogs.length,
      pendingLogs: this.pendingLogs
    });
    
    if (!this.autoSync || this.pendingLogs.length === 0) {
      console.log('[AuditManager] syncToSpreadsheet skipped:', {
        reason: !this.autoSync ? 'autoSync disabled' : 'no pending logs',
        autoSync: this.autoSync,
        pendingLogsLength: this.pendingLogs.length
      });
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

      // 各ログの検証とクリーニング
      const validLogs = logsToSync.filter(log => {
        if (!log || typeof log !== 'object') {
          console.warn('[AuditManager] 無効なログをスキップ:', log);
          return false;
        }
        
        // ログオブジェクトの必須プロパティをチェック
        if (!log.id || !log.timestamp || !log.operation) {
          console.warn('[AuditManager] 必須プロパティが不足しているログをスキップ:', {
            id: log.id,
            timestamp: log.timestamp,
            operation: log.operation
          });
          return false;
        }
        
        return true;
      }).map(log => {
        // ログオブジェクトを安全にクリーニング
        try {
          // 循環参照やシリアライズできないプロパティを除去
          const cleanLog = {
            id: log.id,
            timestamp: log.timestamp,
            operation: log.operation,
            fileName: log.fileName || 'unknown',
            identifier: log.identifier || 'unknown',
            auditLogSpreadsheetId: log.auditLogSpreadsheetId || null,
            originalSpreadsheetId: log.originalSpreadsheetId || null,
            group: log.group || 'unknown',
            day: log.day || '1',
            timeslot: log.timeslot || 'A',
            mode: log.mode || { mode: 'unknown', isDemo: false },
            userAgent: log.userAgent || navigator.userAgent,
            url: log.url || window.location.href,
            deviceInfo: log.deviceInfo || {},
            details: log.details || {},
            beforeData: log.beforeData || null,
            afterData: log.afterData || null,
            error: log.error || null,
            stackTrace: log.stackTrace || null
          };
          
          // シリアライゼーションテスト
          JSON.stringify(cleanLog);
          return cleanLog;
        } catch (error) {
          console.warn('[AuditManager] ログクリーニングエラー:', error, log);
          // 最小限のログオブジェクトを返す
          return {
            id: log.id || 'unknown',
            timestamp: log.timestamp || new Date().toISOString(),
            operation: log.operation || 'unknown',
            fileName: 'unknown',
            identifier: 'unknown',
            auditLogSpreadsheetId: null,
            originalSpreadsheetId: null,
            group: 'unknown',
            day: '1',
            timeslot: 'A',
            mode: { mode: 'unknown', isDemo: false },
            userAgent: navigator.userAgent,
            url: window.location.href,
            deviceInfo: {},
            details: {},
            beforeData: null,
            afterData: null,
            error: null,
            stackTrace: null
          };
        }
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
        
        // パラメータの最終検証
        if (!auditLogSpreadsheetId || typeof auditLogSpreadsheetId !== 'string') {
          throw new Error('監査ログ専用スプレッドシートIDが無効です');
        }
        
        if (!Array.isArray(validLogs) || validLogs.length === 0) {
          throw new Error('同期するログが無効です');
        }
        
        // ログ配列の各要素を最終チェック
        const finalValidLogs = validLogs.filter(log => {
          try {
            // シリアライゼーションテスト
            JSON.stringify(log);
            return true;
          } catch (e) {
            console.warn('[AuditManager] シリアライゼーションできないログをスキップ:', log, e);
            return false;
          }
        });
        
        if (finalValidLogs.length === 0) {
          throw new Error('シリアライゼーション可能なログがありません');
        }
        
        console.log(`[AuditManager] 最終同期ログ数: ${finalValidLogs.length}件 (元: ${validLogs.length}件)`);
        
        // シンプルで確実なパラメータ送信方式
        console.log('[AuditManager] syncAuditLogsToSpreadsheet呼び出し開始:', {
          auditLogSpreadsheetId,
          logsCount: finalValidLogs.length,
          firstLogId: finalValidLogs[0]?.id
        });
        
        const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', 
          auditLogSpreadsheetId,
          finalValidLogs
        );
        
        console.log('[AuditManager] syncAuditLogsToSpreadsheet呼び出し結果:', result);
        
        // レスポンスの詳細な検証
        if (result && typeof result === 'object' && result.success === true) {
          console.log(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} に ${finalValidLogs.length}件のログを同期成功`);
          // 成功時は失敗カウンターをリセット
          this.syncFailureCount = 0;
          this.lastSyncTime = Date.now();
          
          // 成功したログを同期待ちから削除
          this.pendingLogs = this.pendingLogs.filter(pendingLog => 
            !finalValidLogs.some(syncedLog => syncedLog.id === pendingLog.id)
          );
          
        } else {
          const errorMessage = result?.message || result?.error || '不明なエラー';
          console.warn(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} への同期失敗:`, errorMessage);
          
          // 失敗回数をカウント
          this.syncFailureCount = (this.syncFailureCount || 0) + 1;
          
          // 連続失敗が3回未満の場合のみ再試行
          if (this.syncFailureCount < 3) {
            // 重複を避けて同期待ちに追加
            const existingIds = new Set(this.pendingLogs.map(log => log.id));
            const newLogs = finalValidLogs.filter(log => !existingIds.has(log.id));
            this.pendingLogs.unshift(...newLogs);
            console.log(`[AuditManager] 同期失敗回数: ${this.syncFailureCount}/3 - ${newLogs.length}件を再試行します`);
          } else {
            console.warn(`[AuditManager] 同期失敗回数が上限に達しました (${this.syncFailureCount}/3) - ログを破棄します`);
            // 失敗回数が上限に達した場合は、ログを破棄してアプリケーションの動作を継続
            this.syncFailureCount = 0; // リセット
            
            // エラーを監査ログに記録（同期待ちに追加しない）
            try {
              this.log('sync_failure_limit_reached', {
                error: errorMessage,
                failedLogsCount: finalValidLogs.length,
                auditLogSpreadsheetId: auditLogSpreadsheetId,
                syncFailureCount: this.syncFailureCount
              });
            } catch (logError) {
              console.error('[AuditManager] エラーログ記録に失敗:', logError);
            }
          }
        }
      } catch (apiError) {
        console.warn(`[AuditManager] 監査ログ専用スプレッドシート ${auditLogSpreadsheetId} へのAPI呼び出しエラー:`, apiError.message);
        
        // 失敗回数をカウント
        this.syncFailureCount = (this.syncFailureCount || 0) + 1;
        
        // 連続失敗が3回未満の場合のみ再試行（5回から3回に短縮）
        if (this.syncFailureCount < 3) {
          this.pendingLogs.unshift(...finalValidLogs);
          console.log(`[AuditManager] API呼び出し失敗回数: ${this.syncFailureCount}/3 - 再試行します`);
        } else {
          console.warn(`[AuditManager] API呼び出し失敗回数が上限に達しました (${this.syncFailureCount}/3) - ログを破棄します`);
          // 失敗回数が上限に達した場合は、ログを破棄してアプリケーションの動作を継続
          this.syncFailureCount = 0; // リセット
          // エラーを監査ログに記録
          this.log('api_call_failure_limit_reached', {
            error: apiError.message,
            failedLogsCount: finalValidLogs.length,
            auditLogSpreadsheetId: auditLogSpreadsheetId
          });
        }
      }

      this.lastSyncTime = Date.now();
    } catch (error) {
      const errorId = this.errorTracker.addError(error, {
        phase: 'sync_to_spreadsheet',
        auditLogSpreadsheetId: auditLogSpreadsheetId,
        pendingLogsCount: this.pendingLogs.length,
        syncFailureCount: this.syncFailureCount,
        lastSyncTime: this.lastSyncTime
      });
      
      console.warn(`[AuditManager] 同期エラー (ID: ${errorId}):`, error);
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
        const result = await this.callGASAPI('syncAuditLogsToSpreadsheet', auditLogSpreadsheetId, logsToSync);
        
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
      const result = await this.callGASAPI('getAuditLogsFromSpreadsheet', spreadsheetId, limit, offset);
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
      const result = await this.callGASAPI('getAuditLogStatsFromSpreadsheet', spreadsheetId);
      return result;
    } catch (error) {
      console.warn(`[AuditManager] 統計取得エラー: ${error.message}`);
      // 統計取得に失敗しても空の結果を返してアプリケーションの動作を継続
      return { success: true, stats: {}, message: '統計の取得に失敗しましたが、アプリケーションは正常に動作します' };
    }
  }

  // GAS APIを呼び出す（改良版）
  async callGASAPI(functionName, ...params) {
    let script = null;
    let timeoutId = null;
    
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
      const callback = `auditManagerCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // パラメータの検証とエンコード
      const safeParams = Array.isArray(params) ? params : [params];
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
      
      // パラメータを個別に送信する方式に変更
      let queryString = `func=${functionName}&callback=${callback}`;
      encodedParams.forEach((encodedParam, index) => {
        queryString += `&params=${encodedParam}`;
      });
      console.log('[AuditManager] クエリ文字列:', queryString);
      console.log('[AuditManager] 送信先URL:', `${apiUrl}?${queryString}`);
      console.log('[AuditManager] リクエスト送信開始:', {
        functionName,
        apiUrl,
        queryString,
        callback,
        timestamp: new Date().toISOString()
      });
      
      return new Promise((resolve, reject) => {
        // コールバック関数を設定
        window[callback] = (response) => {
          console.log('[AuditManager] コールバック受信:', {
            functionName,
            response,
            responseType: typeof response,
            responseSuccess: response?.success
          });
          
          // クリーンアップ
          this.cleanupAPICall(callback, script, timeoutId);
          
          // レスポンスの検証
          if (response && typeof response === 'object') {
            resolve(response);
          } else {
            console.warn('[AuditManager] 無効なレスポンス:', response);
            resolve({ success: false, error: '無効なレスポンス形式' });
          }
        };
        
        // スクリプト要素を作成
        script = document.createElement('script');
        script.src = `${apiUrl}?${queryString}`;
        script.onerror = (error) => {
          console.error('[AuditManager] スクリプト読み込みエラー:', {
            functionName,
            error,
            url: script.src,
            errorType: error.type,
            errorTarget: error.target,
            errorMessage: error.message,
            errorStack: error.stack
          });
          this.cleanupAPICall(callback, script, timeoutId);
          resolve({ success: false, error: `API呼び出しに失敗しました: ${functionName}` });
        };
        
        // スクリプトを追加
        console.log('[AuditManager] スクリプト要素を追加中:', {
          functionName,
          url: script.src,
          scriptElement: script
        });
        
        document.head.appendChild(script);
        console.log('[AuditManager] スクリプト要素を追加完了');
        
        // リクエスト送信の確認
        console.log('[AuditManager] リクエスト送信確認:', {
          functionName,
          url: script.src,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        });
        
        // タイムアウト設定
        timeoutId = setTimeout(() => {
          console.warn('[AuditManager] API呼び出しタイムアウト:', functionName);
          this.cleanupAPICall(callback, script, timeoutId);
          resolve({ success: false, error: 'API呼び出しがタイムアウトしました' });
        }, 15000); // タイムアウトを15秒に延長
      });
    } catch (error) {
      // エラー発生時のクリーンアップ
      this.cleanupAPICall(callback, script, timeoutId);
      
      const errorId = this.errorTracker.addError(error, {
        phase: 'gas_api_call',
        functionName: functionName,
        params: params,
        apiUrl: apiUrls[0]
      });
      
      console.error(`[AuditManager] callGASAPI エラー詳細 (ID: ${errorId}):`, {
        error: error,
        message: error.message,
        stack: error.stack,
        functionName,
        params
      });
      
      // エラーをthrowせずに、エラー情報を含むオブジェクトを返す
      return { success: false, error: `GAS API呼び出しエラー: ${error.message}`, errorId: errorId };
    }
  }

  // API呼び出しのクリーンアップ
  cleanupAPICall(callback, script, timeoutId) {
    try {
      // コールバック関数を削除
      if (callback && window[callback]) {
        delete window[callback];
      }
      
      // タイムアウトをクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // スクリプト要素を削除
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    } catch (error) {
      console.warn('[AuditManager] クリーンアップエラー:', error);
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
      const result = await this.callGASAPI('testApi');
      console.log('[AuditManager] GAS APIテスト結果:', result);
      return result;
    } catch (error) {
      console.error('[AuditManager] GAS APIテスト失敗:', error);
      return { success: false, error: error.message };
    }
  }

  // 自動修復機能
  performAutoFix(error) {
    const errorMessage = error.error.message || '';
    const errorName = error.error.name || '';
    
    console.log(`[AuditManager] 自動修復を試行: ${errorName} - ${errorMessage}`);
    
    // CreateListFromArrayLikeエラーの修復
    if (errorMessage.includes('CreateListFromArrayLike')) {
      return this.fixCreateListFromArrayLikeError(error);
    }
    
    // 同期エラーの修復
    if (error.context.phase === 'sync_to_spreadsheet') {
      return this.fixSyncError(error);
    }
    
    // ネットワークエラーの修復
    if (error.severity === 'network') {
      return this.fixNetworkError(error);
    }
    
    // その他のエラー
    return { success: false, message: '自動修復対象外のエラーです' };
  }

  // CreateListFromArrayLikeエラーの修復
  fixCreateListFromArrayLikeError(error) {
    try {
      console.log('[AuditManager] CreateListFromArrayLikeエラーを修復中...');
      
      // 同期待ちのログをクリア
      this.pendingLogs = [];
      
      // 同期失敗カウンターをリセット
      this.syncFailureCount = 0;
      
      // 自動同期を一時停止
      this.stopAutoSync();
      
      // 5秒後に自動同期を再開
      setTimeout(() => {
        this.startAutoSync();
        console.log('[AuditManager] 自動同期を再開しました');
      }, 5000);
      
      return { 
        success: true, 
        message: 'CreateListFromArrayLikeエラーを修復しました',
        actions: ['同期待ちログをクリア', '同期失敗カウンターをリセット', '自動同期を再開']
      };
    } catch (e) {
      return { success: false, message: `修復に失敗: ${e.message}` };
    }
  }

  // 同期エラーの修復
  fixSyncError(error) {
    try {
      console.log('[AuditManager] 同期エラーを修復中...');
      
      // 手動同期を試行
      this.manualSync().then(result => {
        if (result.success) {
          console.log('[AuditManager] 手動同期による修復が成功しました');
        } else {
          console.warn('[AuditManager] 手動同期による修復が失敗しました:', result.message);
        }
      });
      
      return { 
        success: true, 
        message: '同期エラーの修復を試行しました',
        actions: ['手動同期を実行']
      };
    } catch (e) {
      return { success: false, message: `修復に失敗: ${e.message}` };
    }
  }

  // ネットワークエラーの修復
  fixNetworkError(error) {
    try {
      console.log('[AuditManager] ネットワークエラーを修復中...');
      
      // API URLをローテーション
      if (window.apiUrlManager && window.apiUrlManager.selectRandomUrl) {
        window.apiUrlManager.selectRandomUrl();
        console.log('[AuditManager] API URLをローテーションしました');
      }
      
      return { 
        success: true, 
        message: 'ネットワークエラーの修復を試行しました',
        actions: ['API URLをローテーション']
      };
    } catch (e) {
      return { success: false, message: `修復に失敗: ${e.message}` };
    }
  }

  // エラーモニタリングを開始（改良版）
  startErrorMonitoring() {
    try {
      // 既存のイベントリスナーを削除（重複防止）
      this.removeErrorListeners();
      
      // グローバルエラーハンドラーを設定
      this.errorHandler = (event) => {
        try {
          this.errorTracker.addError(event.error, {
            phase: 'global_error',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[AuditManager] エラーハンドラー内でエラー:', error);
        }
      };

      // 未処理のPromise拒否をキャッチ
      this.rejectionHandler = (event) => {
        try {
          this.errorTracker.addError(new Error(event.reason), {
            phase: 'unhandled_promise_rejection',
            reason: event.reason,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[AuditManager] Promise拒否ハンドラー内でエラー:', error);
        }
      };

      // イベントリスナーを追加
      window.addEventListener('error', this.errorHandler);
      window.addEventListener('unhandledrejection', this.rejectionHandler);

      // 定期的なエラー分析（5分間隔）
      if (this.errorAnalysisInterval) {
        clearInterval(this.errorAnalysisInterval);
      }
      
      this.errorAnalysisInterval = setInterval(() => {
        try {
          this.performPeriodicErrorAnalysis();
        } catch (error) {
          console.error('[AuditManager] 定期エラー分析でエラー:', error);
        }
      }, 5 * 60 * 1000);

      // 定期的なメモリクリーンアップ（1分間隔）
      if (this.memoryCleanupInterval) {
        clearInterval(this.memoryCleanupInterval);
      }
      
      this.memoryCleanupInterval = setInterval(() => {
        try {
          this.cleanupOldLogs();
        } catch (error) {
          console.error('[AuditManager] 定期メモリクリーンアップでエラー:', error);
        }
      }, 60 * 1000);

    console.log('[AuditManager] エラーモニタリングを開始しました');
    
  } catch (error) {
    console.error('[AuditManager] エラーモニタリング開始エラー:', error);
  }
}

// デストラクタ機能
destroy() {
  try {
    console.log('[AuditManager] デストラクタを実行中...');
    
    // 自動同期を停止
    this.stopAutoSync();
    
    // エラーモニタリングを停止
    this.removeErrorListeners();
    
    // 最終的なログ保存
    this.saveLogs();
    
    // メモリクリーンアップ
    this.aggressiveCleanup();
    
    console.log('[AuditManager] デストラクタ完了');
    
  } catch (error) {
    console.error('[AuditManager] デストラクタエラー:', error);
  }
}

  // エラーリスナーを削除
  removeErrorListeners() {
    try {
      if (this.errorHandler) {
        window.removeEventListener('error', this.errorHandler);
        this.errorHandler = null;
      }
      
      if (this.rejectionHandler) {
        window.removeEventListener('unhandledrejection', this.rejectionHandler);
        this.rejectionHandler = null;
      }
      
      if (this.errorAnalysisInterval) {
        clearInterval(this.errorAnalysisInterval);
        this.errorAnalysisInterval = null;
      }
      
      if (this.memoryCleanupInterval) {
        clearInterval(this.memoryCleanupInterval);
        this.memoryCleanupInterval = null;
      }
      
    } catch (error) {
      console.warn('[AuditManager] エラーリスナー削除エラー:', error);
    }
  }

  // 定期的なエラー分析
  performPeriodicErrorAnalysis() {
    const errors = this.errorTracker.getErrors();
    if (errors.length === 0) return;

    const recentErrors = errors.filter(error => {
      const errorTime = new Date(error.timestamp);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return errorTime >= fiveMinutesAgo;
    });

    if (recentErrors.length > 10) {
      console.warn(`[AuditManager] 過去5分間に${recentErrors.length}件のエラーが発生しています`);
      
      // クリティカルエラーが多発している場合は自動修復を試行
      const criticalErrors = recentErrors.filter(e => e.severity === 'critical');
      if (criticalErrors.length > 3) {
        console.warn('[AuditManager] クリティカルエラーが多発しています。自動修復を実行します');
        this.autoFix();
      }
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
    // エラー追跡機能
    getErrors: (filter) => auditManager.errorTracker.getErrors(filter),
    clearErrors: () => auditManager.errorTracker.clearErrors(),
    debug: () => {
      console.log('=== AuditManager Debug Info ===');
      console.log('Status:', auditManager.getStatus());
      console.log('Logs:', auditManager.getLogs());
      console.log('Errors:', auditManager.errorTracker.getErrors());
      console.log('LocalStorage:', localStorage.getItem('AUDIT_LOGS'));
      console.log('===============================');
    },
    // エラー分析機能
    analyzeErrors: () => {
      const errors = auditManager.errorTracker.getErrors();
      const analysis = {
        total: errors.length,
        bySeverity: {},
        byPhase: {},
        recent: errors.slice(0, 10),
        critical: errors.filter(e => e.severity === 'critical'),
        network: errors.filter(e => e.severity === 'network'),
        sync: errors.filter(e => e.severity === 'sync')
      };
      
      errors.forEach(error => {
        analysis.bySeverity[error.severity] = (analysis.bySeverity[error.severity] || 0) + 1;
        analysis.byPhase[error.context.phase] = (analysis.byPhase[error.context.phase] || 0) + 1;
      });
      
      console.log('=== Error Analysis ===');
      console.log('Total Errors:', analysis.total);
      console.log('By Severity:', analysis.bySeverity);
      console.log('By Phase:', analysis.byPhase);
      console.log('Critical Errors:', analysis.critical);
      console.log('Network Errors:', analysis.network);
      console.log('Sync Errors:', analysis.sync);
      console.log('Recent Errors:', analysis.recent);
      console.log('=====================');
      
      return analysis;
    },
    // システム診断機能
    diagnose: () => {
      const errors = auditManager.errorTracker.getErrors();
      return auditManager.errorAnalyzer.printDiagnosticReport(errors);
    },
    // システム全体の健康状態チェック
    healthCheck: () => {
      const status = auditManager.getStatus();
      const errors = auditManager.errorTracker.getErrors();
      const recentErrors = errors.filter(e => {
        const errorTime = new Date(e.timestamp);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        return errorTime >= fiveMinutesAgo;
      });
      
      const health = {
        overall: 'healthy',
        components: {
          auditManager: status.isEnabled ? 'healthy' : 'disabled',
          autoSync: status.autoSync ? 'healthy' : 'disabled',
          errorTracking: 'healthy',
          storage: status.logsCount < status.maxLogs ? 'healthy' : 'warning'
        },
        metrics: {
          totalLogs: status.logsCount,
          pendingLogs: status.pendingLogsCount,
          syncFailures: status.syncFailureCount,
          recentErrors: recentErrors.length,
          lastSync: status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : 'never'
        },
        recommendations: []
      };
      
      // 健康状態の判定
      if (recentErrors.length > 5) {
        health.overall = 'critical';
        health.recommendations.push('過去5分間に多数のエラーが発生しています');
      } else if (status.syncFailureCount > 2) {
        health.overall = 'warning';
        health.recommendations.push('同期エラーが頻発しています');
      } else if (status.pendingLogsCount > 100) {
        health.overall = 'warning';
        health.recommendations.push('同期待ちのログが蓄積しています');
      }
      
      return health;
    },
    // 自動修復機能
    autoFix: () => {
      const errors = auditManager.errorTracker.getErrors();
      const criticalErrors = errors.filter(e => e.severity === 'critical');
      
      if (criticalErrors.length === 0) {
        console.log('[AuditManager] 自動修復対象のクリティカルエラーはありません');
        return { success: true, message: '修復対象なし' };
      }
      
      console.log(`[AuditManager] ${criticalErrors.length}件のクリティカルエラーを自動修復します`);
      
      // 自動修復の実行
      const fixes = [];
      criticalErrors.forEach(error => {
        try {
          const fix = auditManager.performAutoFix(error);
          if (fix.success) {
            fixes.push(fix);
          }
        } catch (e) {
          console.warn('[AuditManager] 自動修復に失敗:', e);
        }
      });
      
      console.log(`[AuditManager] 自動修復完了: ${fixes.length}/${criticalErrors.length}件成功`);
      return { success: true, fixes: fixes };
    },
    // エラーモニタリング制御
    startMonitoring: () => {
      auditManager.startErrorMonitoring();
      return { success: true, message: 'エラーモニタリングを開始しました' };
    },
    stopMonitoring: () => {
      auditManager.removeErrorListeners();
      return { success: true, message: 'エラーモニタリングを停止しました' };
    },
    // デストラクタ機能
    destroy: () => {
      auditManager.destroy();
      return { success: true, message: 'AuditManagerを破棄しました' };
    },
    // メモリ使用量確認
    getMemoryUsage: () => {
      try {
        const logsJson = JSON.stringify(auditManager.logs);
        const pendingJson = JSON.stringify(auditManager.pendingLogs);
        const errorsJson = JSON.stringify(auditManager.errorTracker.errors);
        
        return {
          logs: Math.round(logsJson.length / 1024),
          pending: Math.round(pendingJson.length / 1024),
          errors: Math.round(errorsJson.length / 1024),
          total: Math.round((logsJson.length + pendingJson.length + errorsJson.length) / 1024)
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  };
}

export { auditManager, AuditManager };
