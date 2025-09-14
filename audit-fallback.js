// audit-fallback.js
// 既存システムとの互換性を保つためのフォールバック機能

class AuditFallback {
  constructor() {
    this.isEnabled = true;
    this.logs = [];
    this.maxLogs = 1000;
    this.autoSync = false; // 既存システムの負荷を避けるため無効
  }

  // 基本的なログ機能（既存システムとの互換性を保つ）
  async log(operation, details = {}) {
    if (!this.isEnabled) return;

    try {
      const logEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: operation,
        details: details,
        deviceInfo: this.getDeviceInfo(),
        url: window.location.href
      };

      this.logs.unshift(logEntry);
      this.cleanupOldLogs();

      // ローカルストレージに保存（既存システムに影響しない）
      this.saveToLocalStorage();

      console.log(`[AuditFallback] ログ記録: ${operation}`);
    } catch (error) {
      console.warn('[AuditFallback] ログ記録エラー:', error);
    }
  }

  // 既存のauditManagerインターフェースを提供
  isEnabled() {
    return this.isEnabled;
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  async getStats() {
    return {
      total: this.logs.length,
      synced: 0,
      pending: this.logs.length,
      errors: this.logs.filter(log => log.details.error).length
    };
  }

  async forceSync() {
    // 既存システムの負荷を避けるため、同期は行わない
    console.log('[AuditFallback] 同期機能は無効です（既存システム保護のため）');
  }

  isServerConnected() {
    return false; // フォールバックモードでは接続なし
  }

  // ユーティリティ関数
  generateId() {
    return 'fallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getDeviceInfo() {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      onLine: navigator.onLine
    };
  }

  cleanupOldLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('audit_fallback_logs', JSON.stringify(this.logs));
    } catch (error) {
      console.warn('[AuditFallback] ローカルストレージ保存エラー:', error);
    }
  }

  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('audit_fallback_logs');
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[AuditFallback] ローカルストレージ読み込みエラー:', error);
    }
  }
}

// 既存システムが正常に動作することを最優先に、フォールバック機能を提供
window.auditManager = new AuditFallback();

// ローカルストレージから既存のログを読み込み
window.auditManager.loadFromLocalStorage();

console.log('✅ 監査ログフォールバック機能が読み込まれました（既存システム保護モード）');
