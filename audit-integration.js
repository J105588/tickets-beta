// audit-integration.js
// 既存システムとの統合スクリプト

class AuditIntegration {
  constructor() {
    this.isInitialized = false;
    this.auditClient = null;
    this.originalFunctions = {};
    
    this.init();
  }

  async init() {
    try {
      // 監査ログクライアントを初期化
      this.auditClient = new AuditClient({
        serverUrl: this.getServerUrl(),
        enabled: true,
        autoSync: true
      });

      // 既存のauditManagerを置き換え
      this.replaceAuditManager();
      
      // 既存の関数を監査ログ対応にラップ
      this.wrapExistingFunctions();
      
      // エラーハンドリングを設定
      this.setupErrorHandling();
      
      this.isInitialized = true;
      console.log('✅ 監査ログ統合が完了しました');
      
    } catch (error) {
      console.error('❌ 監査ログ統合エラー:', error);
    }
  }

  getServerUrl() {
    // 本番環境と開発環境を自動判定
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (isProduction) {
      // 本番環境のWebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}`;
    } else {
      // 開発環境のWebSocket URL
      return 'ws://localhost:3000';
    }
  }

  replaceAuditManager() {
    // 既存のauditManagerを保存
    if (window.auditManager) {
      this.originalFunctions.auditManager = { ...window.auditManager };
    }

    // 新しいauditManagerを設定
    window.auditManager = {
      log: (operation, details) => this.auditClient.log(operation, details),
      isEnabled: () => this.auditClient.isEnabled,
      setEnabled: (enabled) => { this.auditClient.isEnabled = enabled; },
      getStats: () => this.auditClient.getStats(),
      forceSync: () => this.auditClient.forceSync(),
      isConnected: () => this.auditClient.isServerConnected()
    };

    console.log('✅ auditManagerを置き換えました');
  }

  wrapExistingFunctions() {
    // 既存の主要な関数を監査ログ対応にラップ
    
    // 座席予約関数のラップ
    this.wrapFunction('reserveSeat', 'seat_reservation');
    this.wrapFunction('cancelReservation', 'seat_cancellation');
    this.wrapFunction('checkinSeat', 'checkin');
    this.wrapFunction('checkoutSeat', 'checkout');
    
    // 当日券発行関数のラップ
    this.wrapFunction('issueWalkinTicket', 'walkin_ticket');
    this.wrapFunction('cancelWalkinTicket', 'walkin_cancellation');
    
    // 座席編集関数のラップ
    this.wrapFunction('editSeat', 'seat_edit');
    this.wrapFunction('deleteSeat', 'seat_delete');
    
    // モード変更関数のラップ
    this.wrapFunction('changeMode', 'mode_change');
    this.wrapFunction('setDemoMode', 'demo_mode_change');
    
    // データ同期関数のラップ
    this.wrapFunction('syncData', 'data_sync');
    this.wrapFunction('loadData', 'data_load');
    this.wrapFunction('saveData', 'data_save');
    
    console.log('✅ 既存関数を監査ログ対応にラップしました');
  }

  wrapFunction(functionName, operationType) {
    const originalFunction = window[functionName];
    
    if (typeof originalFunction === 'function') {
      window[functionName] = (...args) => {
        try {
          // 関数実行前のデータを記録
          const beforeData = this.captureBeforeData(functionName, args);
          
          // 元の関数を実行
          const result = originalFunction.apply(this, args);
          
          // Promiseの場合は結果を待ってからログ記録
          if (result && typeof result.then === 'function') {
            return result.then(
              (resolvedResult) => {
                this.auditClient.log(operationType, {
                  functionName: functionName,
                  args: this.sanitizeArgs(args),
                  beforeData: beforeData,
                  afterData: this.captureAfterData(functionName, resolvedResult),
                  success: true
                });
                return resolvedResult;
              },
              (error) => {
                this.auditClient.log(operationType, {
                  functionName: functionName,
                  args: this.sanitizeArgs(args),
                  beforeData: beforeData,
                  afterData: null,
                  error: error.message,
                  stackTrace: error.stack,
                  success: false
                });
                throw error;
              }
            );
          } else {
            // 同期的な関数の場合
            this.auditClient.log(operationType, {
              functionName: functionName,
              args: this.sanitizeArgs(args),
              beforeData: beforeData,
              afterData: this.captureAfterData(functionName, result),
              success: true
            });
            return result;
          }
        } catch (error) {
          // エラーが発生した場合
          this.auditClient.log(operationType, {
            functionName: functionName,
            args: this.sanitizeArgs(args),
            beforeData: beforeData,
            afterData: null,
            error: error.message,
            stackTrace: error.stack,
            success: false
          });
          throw error;
        }
      };
    }
  }

  captureBeforeData(functionName, args) {
    try {
      // 関数名に応じて適切なデータを取得
      switch (functionName) {
        case 'reserveSeat':
        case 'cancelReservation':
        case 'checkinSeat':
        case 'checkoutSeat':
          return this.getSeatData(args[0]); // 座席ID
        
        case 'issueWalkinTicket':
        case 'cancelWalkinTicket':
          return this.getWalkinData(args[0]); // チケットID
        
        case 'editSeat':
        case 'deleteSeat':
          return this.getSeatData(args[0]); // 座席ID
        
        case 'changeMode':
        case 'setDemoMode':
          return {
            currentMode: window.currentMode,
            isDemo: window.isDemoMode
          };
        
        case 'syncData':
        case 'loadData':
        case 'saveData':
          return {
            dataType: args[0] || 'unknown',
            timestamp: new Date().toISOString()
          };
        
        default:
          return {
            functionName: functionName,
            args: this.sanitizeArgs(args),
            timestamp: new Date().toISOString()
          };
      }
    } catch (error) {
      console.warn('beforeData取得エラー:', error);
      return null;
    }
  }

  captureAfterData(functionName, result) {
    try {
      // 関数名に応じて適切なデータを取得
      switch (functionName) {
        case 'reserveSeat':
        case 'cancelReservation':
        case 'checkinSeat':
        case 'checkoutSeat':
          return result ? this.getSeatData(result.id || result.seatId) : null;
        
        case 'issueWalkinTicket':
        case 'cancelWalkinTicket':
          return result ? this.getWalkinData(result.id || result.ticketId) : null;
        
        case 'editSeat':
        case 'deleteSeat':
          return result ? this.getSeatData(result.id || result.seatId) : null;
        
        case 'changeMode':
        case 'setDemoMode':
          return {
            newMode: window.currentMode,
            isDemo: window.isDemoMode,
            result: result
          };
        
        case 'syncData':
        case 'loadData':
        case 'saveData':
          return {
            success: result !== false,
            dataCount: result ? (Array.isArray(result) ? result.length : 1) : 0,
            timestamp: new Date().toISOString()
          };
        
        default:
          return {
            result: result,
            timestamp: new Date().toISOString()
          };
      }
    } catch (error) {
      console.warn('afterData取得エラー:', error);
      return null;
    }
  }

  getSeatData(seatId) {
    try {
      // 座席データを取得（実装に応じて調整）
      if (window.seatsData && window.seatsData[seatId]) {
        return { ...window.seatsData[seatId] };
      }
      return { seatId: seatId };
    } catch (error) {
      return { seatId: seatId, error: 'データ取得失敗' };
    }
  }

  getWalkinData(ticketId) {
    try {
      // 当日券データを取得（実装に応じて調整）
      if (window.walkinData && window.walkinData[ticketId]) {
        return { ...window.walkinData[ticketId] };
      }
      return { ticketId: ticketId };
    } catch (error) {
      return { ticketId: ticketId, error: 'データ取得失敗' };
    }
  }

  sanitizeArgs(args) {
    try {
      // 機密情報を除去
      return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          const sanitized = { ...arg };
          // パスワードやトークンなどの機密情報を除去
          delete sanitized.password;
          delete sanitized.token;
          delete sanitized.secret;
          return sanitized;
        }
        return arg;
      });
    } catch (error) {
      return args;
    }
  }

  setupErrorHandling() {
    // グローバルエラーハンドラー
    window.addEventListener('error', (event) => {
      this.auditClient.log('javascript_error', {
        error: event.error?.message || 'Unknown error',
        stackTrace: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href
      });
    });

    // Promise拒否ハンドラー
    window.addEventListener('unhandledrejection', (event) => {
      this.auditClient.log('unhandled_promise_rejection', {
        error: event.reason?.message || 'Unhandled promise rejection',
        stackTrace: event.reason?.stack,
        url: window.location.href
      });
    });

    // ネットワークエラーハンドラー
    window.addEventListener('online', () => {
      this.auditClient.log('network_status', {
        status: 'online',
        timestamp: new Date().toISOString()
      });
    });

    window.addEventListener('offline', () => {
      this.auditClient.log('network_status', {
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    });
  }

  // 手動ログ記録用のヘルパー関数
  logUserAction(action, details = {}) {
    this.auditClient.log('user_action', {
      action: action,
      ...details
    });
  }

  logSystemEvent(event, details = {}) {
    this.auditClient.log('system_event', {
      event: event,
      ...details
    });
  }

  logDataChange(type, beforeData, afterData) {
    this.auditClient.log('data_change', {
      type: type,
      beforeData: beforeData,
      afterData: afterData
    });
  }

  // 統計情報取得
  async getAuditStats() {
    return await this.auditClient.getStats();
  }

  // 接続状態確認
  isConnected() {
    return this.auditClient.isServerConnected();
  }

  // 手動同期
  async forceSync() {
    return await this.auditClient.forceSync();
  }
}

// 既存のシステムが読み込まれた後に統合を実行
function initializeAuditIntegration() {
  // DOMが完全に読み込まれるまで待機
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.auditIntegration = new AuditIntegration();
    });
  } else {
    window.auditIntegration = new AuditIntegration();
  }
}

// 即座に実行
initializeAuditIntegration();

// 既存のシステムとの互換性を保つためのグローバル関数
window.auditLog = {
  log: (operation, details) => {
    if (window.auditIntegration) {
      window.auditIntegration.auditClient.log(operation, details);
    }
  },
  userAction: (action, details) => {
    if (window.auditIntegration) {
      window.auditIntegration.logUserAction(action, details);
    }
  },
  systemEvent: (event, details) => {
    if (window.auditIntegration) {
      window.auditIntegration.logSystemEvent(event, details);
    }
  },
  dataChange: (type, beforeData, afterData) => {
    if (window.auditIntegration) {
      window.auditIntegration.logDataChange(type, beforeData, afterData);
    }
  }
};

console.log('✅ 監査ログ統合スクリプトが読み込まれました');
