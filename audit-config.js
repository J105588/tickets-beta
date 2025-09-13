// audit-config.js
// 監査ログ設定管理システム

class AuditConfig {
  constructor() {
    this.configKey = 'AUDIT_CONFIG';
    this.defaultConfig = {
      enabled: true,
      autoSync: true,
      syncInterval: 10000, // 10秒
      maxLogs: 5000,
      logLevel: 'INFO', // DEBUG, INFO, WARN, ERROR
      includeUserAgent: true,
      includeDeviceInfo: true,
      includeStackTrace: true,
      includeBeforeAfterData: true,
      spreadsheetIds: {}, // スプレッドシートID別の設定
      operations: {
        // 操作別の設定
        'reservation_start': { enabled: true, level: 'INFO' },
        'reservation_success': { enabled: true, level: 'INFO' },
        'reservation_failed': { enabled: true, level: 'WARN' },
        'checkin_start': { enabled: true, level: 'INFO' },
        'checkin_success': { enabled: true, level: 'INFO' },
        'mode_change_success': { enabled: true, level: 'INFO' },
        'mode_change_to_normal': { enabled: true, level: 'INFO' },
        'walkin_issue_start': { enabled: true, level: 'INFO' },
        'walkin_issue_success': { enabled: true, level: 'INFO' },
        'error_occurred': { enabled: true, level: 'ERROR' }
      }
    };
    
    this.config = this.loadConfig();
  }

  // 設定を読み込み
  loadConfig() {
    try {
      const stored = localStorage.getItem(this.configKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...this.defaultConfig, ...parsed };
      }
      return { ...this.defaultConfig };
    } catch (error) {
      console.warn('[AuditConfig] 設定読み込みエラー:', error);
      return { ...this.defaultConfig };
    }
  }

  // 設定を保存
  saveConfig() {
    try {
      localStorage.setItem(this.configKey, JSON.stringify(this.config));
    } catch (error) {
      console.warn('[AuditConfig] 設定保存エラー:', error);
    }
  }

  // 設定を取得
  get(key) {
    return this.config[key];
  }

  // 設定を更新
  set(key, value) {
    this.config[key] = value;
    this.saveConfig();
  }

  // 複数設定を一括更新
  updateConfig(updates) {
    Object.assign(this.config, updates);
    this.saveConfig();
  }

  // スプレッドシートID別の設定を取得
  getSpreadsheetConfig(spreadsheetId) {
    return this.config.spreadsheetIds[spreadsheetId] || {
      enabled: true,
      logLevel: this.config.logLevel,
      maxLogs: this.config.maxLogs
    };
  }

  // スプレッドシートID別の設定を更新
  setSpreadsheetConfig(spreadsheetId, config) {
    this.config.spreadsheetIds[spreadsheetId] = {
      ...this.getSpreadsheetConfig(spreadsheetId),
      ...config
    };
    this.saveConfig();
  }

  // 操作の設定を取得
  getOperationConfig(operation) {
    return this.config.operations[operation] || {
      enabled: true,
      level: this.config.logLevel
    };
  }

  // 操作の設定を更新
  setOperationConfig(operation, config) {
    this.config.operations[operation] = {
      ...this.getOperationConfig(operation),
      ...config
    };
    this.saveConfig();
  }

  // ログレベルをチェック
  shouldLog(operation, level = 'INFO') {
    const operationConfig = this.getOperationConfig(operation);
    
    if (!operationConfig.enabled) {
      return false;
    }

    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const operationLevel = levels.indexOf(operationConfig.level);
    const requestedLevel = levels.indexOf(level);
    
    return requestedLevel >= operationLevel;
  }

  // 設定をリセット
  reset() {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
  }

  // 設定をエクスポート
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  // 設定をインポート
  import(configString) {
    try {
      const imported = JSON.parse(configString);
      this.config = { ...this.defaultConfig, ...imported };
      this.saveConfig();
      return true;
    } catch (error) {
      console.error('[AuditConfig] 設定インポートエラー:', error);
      return false;
    }
  }

  // 設定の検証
  validate() {
    const errors = [];
    
    if (typeof this.config.enabled !== 'boolean') {
      errors.push('enabled must be boolean');
    }
    
    if (typeof this.config.autoSync !== 'boolean') {
      errors.push('autoSync must be boolean');
    }
    
    if (typeof this.config.syncInterval !== 'number' || this.config.syncInterval < 1000) {
      errors.push('syncInterval must be number >= 1000');
    }
    
    if (typeof this.config.maxLogs !== 'number' || this.config.maxLogs < 100) {
      errors.push('maxLogs must be number >= 100');
    }
    
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLevels.includes(this.config.logLevel)) {
      errors.push('logLevel must be one of: ' + validLevels.join(', '));
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // 設定の統計情報
  getStats() {
    const spreadsheetCount = Object.keys(this.config.spreadsheetIds).length;
    const operationCount = Object.keys(this.config.operations).length;
    const enabledOperations = Object.values(this.config.operations).filter(op => op.enabled).length;
    
    return {
      spreadsheetCount,
      operationCount,
      enabledOperations,
      disabledOperations: operationCount - enabledOperations,
      configSize: JSON.stringify(this.config).length
    };
  }
}

// グローバルインスタンス
const auditConfig = new AuditConfig();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.AuditConfig = {
    get: (key) => auditConfig.get(key),
    set: (key, value) => auditConfig.set(key, value),
    updateConfig: (updates) => auditConfig.updateConfig(updates),
    getSpreadsheetConfig: (spreadsheetId) => auditConfig.getSpreadsheetConfig(spreadsheetId),
    setSpreadsheetConfig: (spreadsheetId, config) => auditConfig.setSpreadsheetConfig(spreadsheetId, config),
    getOperationConfig: (operation) => auditConfig.getOperationConfig(operation),
    setOperationConfig: (operation, config) => auditConfig.setOperationConfig(operation, config),
    shouldLog: (operation, level) => auditConfig.shouldLog(operation, level),
    reset: () => auditConfig.reset(),
    export: () => auditConfig.export(),
    import: (configString) => auditConfig.import(configString),
    validate: () => auditConfig.validate(),
    getStats: () => auditConfig.getStats()
  };
}

export { auditConfig, AuditConfig };
