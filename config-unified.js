// config-unified.js
// 統一された設定管理システム

class UnifiedConfigManager {
  constructor() {
    this.config = {
      // API設定
      api: {
        urls: [
          "https://script.google.com/macros/s/AKfycbxi3JHgWJPQIRVD1vyAUv3a95Trx5GQafOg7Fg8ffmcI5QX9vwf2W2LwQyVUiEPfq1Q/exec",
          "https://script.google.com/macros/s/AKfycbzk9CsyfxxwwWrcwHNiwGebJ3yFuJ3G0R_Tglsc1__PIYjV0Q1rmFZWTyRCDFIFnwi-/exec"
        ],
        timeout: 10000,
        retryCount: 3,
        rotationInterval: 5 * 60 * 1000 // 5分
      },
      
      // 監査ログ設定
      audit: {
        spreadsheetId: "1ZGQ5BTNW_pTDuMvbZgla2B_soisdvtCM2UrnVi_L-5c",
        maxLogs: 2000,
        autoSync: true,
        syncInterval: 15000,
        enabled: true
      },
      
      // システム設定
      system: {
        debugMode: true,
        autoRefresh: true,
        refreshInterval: 30000,
        maxSeats: 54,
        maxConsecutiveSeats: 12
      },
      
      // UI設定
      ui: {
        theme: 'default',
        language: 'ja',
        animations: true,
        notifications: true
      },
      
      // セキュリティ設定
      security: {
        sessionTimeout: 30 * 60 * 1000, // 30分
        maxLoginAttempts: 3,
        lockoutDuration: 15 * 60 * 1000 // 15分
      }
    };
    
    this.environment = this.detectEnvironment();
    this.loadUserPreferences();
    this.initialize();
  }

  // 環境検出
  detectEnvironment() {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    } else if (hostname.includes('staging')) {
      return 'staging';
    } else {
      return 'production';
    }
  }

  // ユーザー設定読み込み
  loadUserPreferences() {
    try {
      const stored = localStorage.getItem('USER_PREFERENCES');
      if (stored) {
        const preferences = JSON.parse(stored);
        this.mergeConfig(preferences);
      }
    } catch (error) {
      console.warn('[UnifiedConfigManager] ユーザー設定読み込みエラー:', error);
    }
  }

  // 設定マージ
  mergeConfig(newConfig) {
    this.config = this.deepMerge(this.config, newConfig);
  }

  // 深いマージ
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  // 初期化
  initialize() {
    this.setupEnvironmentConfig();
    this.setupEventListeners();
    this.validateConfig();
  }

  // 環境別設定
  setupEnvironmentConfig() {
    switch (this.environment) {
      case 'development':
        this.config.system.debugMode = true;
        this.config.audit.syncInterval = 5000; // 5秒
        break;
      case 'staging':
        this.config.system.debugMode = true;
        this.config.audit.syncInterval = 10000; // 10秒
        break;
      case 'production':
        this.config.system.debugMode = false;
        this.config.audit.syncInterval = 30000; // 30秒
        break;
    }
  }

  // イベントリスナー設定
  setupEventListeners() {
    // 設定変更時の自動保存
    window.addEventListener('beforeunload', () => {
      this.saveUserPreferences();
    });
  }

  // 設定検証
  validateConfig() {
    const errors = [];
    
    // API URL検証
    if (!this.config.api.urls || this.config.api.urls.length === 0) {
      errors.push('API URLが設定されていません');
    }
    
    // 監査ログスプレッドシートID検証
    if (!this.config.audit.spreadsheetId) {
      errors.push('監査ログスプレッドシートIDが設定されていません');
    }
    
    // 数値範囲検証
    if (this.config.audit.maxLogs < 100 || this.config.audit.maxLogs > 10000) {
      errors.push('監査ログ最大数が範囲外です (100-10000)');
    }
    
    if (errors.length > 0) {
      console.error('[UnifiedConfigManager] 設定検証エラー:', errors);
      throw new Error('設定が無効です: ' + errors.join(', '));
    }
  }

  // 設定取得
  get(key) {
    return this.getNestedValue(this.config, key);
  }

  // ネストした値取得
  getNestedValue(obj, key) {
    return key.split('.').reduce((current, k) => current?.[k], obj);
  }

  // 設定更新
  set(key, value) {
    this.setNestedValue(this.config, key, value);
    this.saveUserPreferences();
  }

  // ネストした値設定
  setNestedValue(obj, key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, k) => {
      if (!current[k]) current[k] = {};
      return current[k];
    }, obj);
    target[lastKey] = value;
  }

  // 設定一括更新
  updateConfig(updates) {
    this.mergeConfig(updates);
    this.saveUserPreferences();
  }

  // ユーザー設定保存
  saveUserPreferences() {
    try {
      const userPreferences = {
        ui: this.config.ui,
        system: {
          autoRefresh: this.config.system.autoRefresh,
          refreshInterval: this.config.system.refreshInterval
        },
        audit: {
          autoSync: this.config.audit.autoSync,
          syncInterval: this.config.audit.syncInterval
        }
      };
      
      localStorage.setItem('USER_PREFERENCES', JSON.stringify(userPreferences));
    } catch (error) {
      console.warn('[UnifiedConfigManager] ユーザー設定保存エラー:', error);
    }
  }

  // 設定リセット
  reset() {
    try {
      localStorage.removeItem('USER_PREFERENCES');
      this.loadUserPreferences();
      console.log('[UnifiedConfigManager] 設定をリセットしました');
    } catch (error) {
      console.error('[UnifiedConfigManager] 設定リセットエラー:', error);
    }
  }

  // 設定エクスポート
  exportConfig() {
    return {
      config: this.config,
      environment: this.environment,
      timestamp: new Date().toISOString()
    };
  }

  // 設定インポート
  importConfig(importedConfig) {
    try {
      if (importedConfig.config) {
        this.config = importedConfig.config;
      }
      if (importedConfig.environment) {
        this.environment = importedConfig.environment;
      }
      this.validateConfig();
      this.saveUserPreferences();
      console.log('[UnifiedConfigManager] 設定をインポートしました');
    } catch (error) {
      console.error('[UnifiedConfigManager] 設定インポートエラー:', error);
      throw error;
    }
  }

  // 設定情報取得
  getInfo() {
    return {
      environment: this.environment,
      configKeys: Object.keys(this.config),
      hasUserPreferences: !!localStorage.getItem('USER_PREFERENCES'),
      lastUpdated: new Date().toISOString()
    };
  }
}

// グローバルインスタンス
const unifiedConfig = new UnifiedConfigManager();

// 後方互換性のためのエクスポート
export const GAS_API_URLS = unifiedConfig.get('api.urls');
export const AUDIT_LOG_SPREADSHEET_ID = unifiedConfig.get('audit.spreadsheetId');
export const DEBUG_MODE = unifiedConfig.get('system.debugMode');

// デバッグログ関数
export function debugLog(message, obj = null) {
  if (DEBUG_MODE) {
    console.log(message, obj || '');
  }
}

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.UnifiedConfig = {
    get: (key) => unifiedConfig.get(key),
    set: (key, value) => unifiedConfig.set(key, value),
    update: (updates) => unifiedConfig.updateConfig(updates),
    reset: () => unifiedConfig.reset(),
    export: () => unifiedConfig.exportConfig(),
    import: (config) => unifiedConfig.importConfig(config),
    info: () => unifiedConfig.getInfo()
  };
}

export { unifiedConfig, UnifiedConfigManager };
