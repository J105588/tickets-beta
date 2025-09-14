// error-handler-optimized.js
// 最適化されたエラーハンドリングシステム

class OptimizedErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxErrors = 100;
    this.errorTypes = {
      NETWORK: 'network',
      VALIDATION: 'validation',
      API: 'api',
      SYSTEM: 'system',
      USER: 'user'
    };
    
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };
    
    this.initialize();
  }

  initialize() {
    this.setupGlobalErrorHandlers();
    this.setupUnhandledRejectionHandler();
  }

  // グローバルエラーハンドラー設定
  setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      this.handleError({
        type: this.errorTypes.SYSTEM,
        message: event.error?.message || event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        severity: this.determineSeverity(event.error)
      });
    });
  }

  // 未処理のPromise拒否ハンドラー
  setupUnhandledRejectionHandler() {
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: this.errorTypes.SYSTEM,
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        severity: this.severityLevels.MEDIUM
      });
    });
  }

  // エラー処理
  handleError(errorInfo) {
    const error = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      type: errorInfo.type || this.errorTypes.SYSTEM,
      severity: errorInfo.severity || this.severityLevels.MEDIUM,
      message: errorInfo.message,
      stack: errorInfo.stack,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      },
      ...errorInfo
    };

    this.addToErrorLog(error);
    this.logError(error);
    
    // クリティカルエラーの場合は自動回復を試行
    if (error.severity === this.severityLevels.CRITICAL) {
      this.attemptAutoRecovery(error);
    }
  }

  // エラーログに追加
  addToErrorLog(error) {
    this.errorLog.unshift(error);
    
    // 最大数を超えた場合は古いエラーを削除
    if (this.errorLog.length > this.maxErrors) {
      this.errorLog = this.errorLog.slice(0, this.maxErrors);
    }
  }

  // エラーログ出力
  logError(error) {
    const logMessage = `[${error.type.toUpperCase()}] ${error.message}`;
    
    switch (error.severity) {
      case this.severityLevels.LOW:
        console.info(logMessage, error);
        break;
      case this.severityLevels.MEDIUM:
        console.warn(logMessage, error);
        break;
      case this.severityLevels.HIGH:
        console.error(logMessage, error);
        break;
      case this.severityLevels.CRITICAL:
        console.error(`🚨 CRITICAL ERROR: ${logMessage}`, error);
        break;
    }
  }

  // 重要度判定
  determineSeverity(error) {
    if (!error) return this.severityLevels.MEDIUM;
    
    const message = error.message || '';
    const name = error.name || '';
    
    // クリティカルエラー
    if (name.includes('TypeError') || name.includes('ReferenceError') || 
        message.includes('Cannot read property') || message.includes('CreateListFromArrayLike')) {
      return this.severityLevels.CRITICAL;
    }
    
    // ネットワークエラー
    if (message.includes('fetch') || message.includes('network') || 
        message.includes('timeout') || message.includes('API')) {
      return this.severityLevels.HIGH;
    }
    
    // バリデーションエラー
    if (message.includes('validation') || message.includes('invalid') || 
        message.includes('required')) {
      return this.severityLevels.MEDIUM;
    }
    
    return this.severityLevels.LOW;
  }

  // 自動回復試行
  attemptAutoRecovery(error) {
    console.log('[OptimizedErrorHandler] 自動回復を試行中...', error);
    
    try {
      switch (error.type) {
        case this.errorTypes.NETWORK:
          this.recoverFromNetworkError(error);
          break;
        case this.errorTypes.API:
          this.recoverFromApiError(error);
          break;
        case this.errorTypes.SYSTEM:
          this.recoverFromSystemError(error);
          break;
        default:
          console.warn('[OptimizedErrorHandler] 自動回復対象外のエラーです');
      }
    } catch (recoveryError) {
      console.error('[OptimizedErrorHandler] 自動回復に失敗しました:', recoveryError);
    }
  }

  // ネットワークエラー回復
  recoverFromNetworkError(error) {
    // API URLローテーション
    if (window.apiUrlManager && window.apiUrlManager.selectRandomUrl) {
      window.apiUrlManager.selectRandomUrl();
      console.log('[OptimizedErrorHandler] API URLをローテーションしました');
    }
  }

  // APIエラー回復
  recoverFromApiError(error) {
    // リトライロジック
    if (error.retryCount < 3) {
      setTimeout(() => {
        console.log('[OptimizedErrorHandler] API呼び出しをリトライします');
        // 実際のリトライロジックは呼び出し元で実装
      }, 1000 * (error.retryCount + 1));
    }
  }

  // システムエラー回復
  recoverFromSystemError(error) {
    // メモリクリーンアップ
    if (window.gc) {
      window.gc();
      console.log('[OptimizedErrorHandler] ガベージコレクションを実行しました');
    }
    
    // 監査ログのクリーンアップ
    if (window.simplifiedAuditManager) {
      window.simplifiedAuditManager.cleanupOldLogs();
      console.log('[OptimizedErrorHandler] 監査ログをクリーンアップしました');
    }
  }

  // エラーID生成
  generateErrorId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // エラーログ取得
  getErrors(filter = {}) {
    let filteredErrors = [...this.errorLog];
    
    if (filter.type) {
      filteredErrors = filteredErrors.filter(error => error.type === filter.type);
    }
    
    if (filter.severity) {
      filteredErrors = filteredErrors.filter(error => error.severity === filter.severity);
    }
    
    if (filter.since) {
      const sinceDate = new Date(filter.since);
      filteredErrors = filteredErrors.filter(error => 
        new Date(error.timestamp) >= sinceDate
      );
    }
    
    return filteredErrors;
  }

  // エラー統計取得
  getErrorStats() {
    const stats = {
      total: this.errorLog.length,
      byType: {},
      bySeverity: {},
      recent: this.errorLog.slice(0, 10),
      critical: this.errorLog.filter(e => e.severity === this.severityLevels.CRITICAL),
      last24Hours: this.errorLog.filter(e => {
        const errorTime = new Date(e.timestamp);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return errorTime >= dayAgo;
      })
    };
    
    this.errorLog.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    });
    
    return stats;
  }

  // エラーログクリア
  clearErrors() {
    this.errorLog = [];
    console.log('[OptimizedErrorHandler] エラーログをクリアしました');
  }

  // エラーレポート生成
  generateErrorReport() {
    const stats = this.getErrorStats();
    const recentErrors = this.errorLog.slice(0, 20);
    
    return {
      timestamp: new Date().toISOString(),
      environment: window.location.hostname,
      userAgent: navigator.userAgent,
      stats: stats,
      recentErrors: recentErrors,
      systemInfo: {
        memory: performance.memory ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        } : null,
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink
        } : null
      }
    };
  }

  // エラーレポート送信
  async sendErrorReport() {
    try {
      const report = this.generateErrorReport();
      
      // 実際の送信ロジックは実装に応じて調整
      console.log('[OptimizedErrorHandler] エラーレポートを生成しました:', report);
      
      return { success: true, report: report };
    } catch (error) {
      console.error('[OptimizedErrorHandler] エラーレポート送信に失敗しました:', error);
      return { success: false, error: error.message };
    }
  }

  // 手動エラー記録
  logError(type, message, context = {}) {
    this.handleError({
      type: type,
      message: message,
      context: context,
      severity: this.determineSeverity({ message: message })
    });
  }

  // ネットワークエラー記録
  logNetworkError(message, context = {}) {
    this.logError(this.errorTypes.NETWORK, message, context);
  }

  // APIエラー記録
  logApiError(message, context = {}) {
    this.logError(this.errorTypes.API, message, context);
  }

  // バリデーションエラー記録
  logValidationError(message, context = {}) {
    this.logError(this.errorTypes.VALIDATION, message, context);
  }

  // システムエラー記録
  logSystemError(message, context = {}) {
    this.logError(this.errorTypes.SYSTEM, message, context);
  }

  // ユーザーエラー記録
  logUserError(message, context = {}) {
    this.logError(this.errorTypes.USER, message, context);
  }
}

// グローバルインスタンス
const optimizedErrorHandler = new OptimizedErrorHandler();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.OptimizedErrorHandler = {
    getErrors: (filter) => optimizedErrorHandler.getErrors(filter),
    getStats: () => optimizedErrorHandler.getErrorStats(),
    clearErrors: () => optimizedErrorHandler.clearErrors(),
    generateReport: () => optimizedErrorHandler.generateErrorReport(),
    sendReport: () => optimizedErrorHandler.sendErrorReport(),
    logError: (type, message, context) => optimizedErrorHandler.logError(type, message, context),
    logNetworkError: (message, context) => optimizedErrorHandler.logNetworkError(message, context),
    logApiError: (message, context) => optimizedErrorHandler.logApiError(message, context),
    logValidationError: (message, context) => optimizedErrorHandler.logValidationError(message, context),
    logSystemError: (message, context) => optimizedErrorHandler.logSystemError(message, context),
    logUserError: (message, context) => optimizedErrorHandler.logUserError(message, context)
  };
}

export { optimizedErrorHandler, OptimizedErrorHandler };
