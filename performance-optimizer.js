// performance-optimizer.js
// パフォーマンス最適化システム

class PerformanceOptimizer {
  constructor() {
    this.metrics = {
      memory: {
        initial: 0,
        current: 0,
        peak: 0
      },
      api: {
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        failures: 0
      },
      ui: {
        renderTime: 0,
        interactionTime: 0,
        animationTime: 0
      }
    };
    
    this.thresholds = {
      memory: {
        warning: 50 * 1024 * 1024, // 50MB
        critical: 100 * 1024 * 1024 // 100MB
      },
      api: {
        slowCall: 5000, // 5秒
        timeout: 10000 // 10秒
      },
      ui: {
        slowRender: 100, // 100ms
        slowInteraction: 200 // 200ms
      }
    };
    
    this.optimizations = {
      debounce: new Map(),
      throttle: new Map(),
      cache: new Map(),
      lazyLoad: new Set()
    };
    
    this.initialize();
  }

  initialize() {
    this.setupMemoryMonitoring();
    this.setupPerformanceObserver();
    this.setupOptimizations();
  }

  // メモリ監視設定
  setupMemoryMonitoring() {
    if (performance.memory) {
      this.metrics.memory.initial = performance.memory.usedJSHeapSize;
      this.metrics.memory.current = this.metrics.memory.initial;
      this.metrics.memory.peak = this.metrics.memory.initial;
    }
    
    // 定期的なメモリ監視
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000); // 30秒間隔
  }

  // パフォーマンス監視設定
  setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      // ロングタスク監視
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) { // 50ms以上
            console.warn('[PerformanceOptimizer] ロングタスク検出:', entry.duration + 'ms');
          }
        }
      });
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.warn('[PerformanceOptimizer] ロングタスク監視が利用できません');
      }
      
      // メモリ監視
      const memoryObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.recordUIMetric('renderTime', entry.duration);
          }
        }
      });
      
      try {
        memoryObserver.observe({ entryTypes: ['measure'] });
      } catch (e) {
        console.warn('[PerformanceOptimizer] メモリ監視が利用できません');
      }
    }
  }

  // 最適化設定
  setupOptimizations() {
    // デバウンス設定
    this.setupDebounce();
    
    // スロットル設定
    this.setupThrottle();
    
    // キャッシュ設定
    this.setupCache();
    
    // 遅延読み込み設定
    this.setupLazyLoad();
  }

  // デバウンス設定
  setupDebounce() {
    // 検索入力のデバウンス
    this.optimizations.debounce.set('search', 300);
    
    // リサイズイベントのデバウンス
    this.optimizations.debounce.set('resize', 250);
    
    // スクロールイベントのデバウンス
    this.optimizations.debounce.set('scroll', 100);
  }

  // スロットル設定
  setupThrottle() {
    // API呼び出しのスロットル
    this.optimizations.throttle.set('api', 1000);
    
    // ログ記録のスロットル
    this.optimizations.throttle.set('logging', 500);
  }

  // キャッシュ設定
  setupCache() {
    // デフォルトキャッシュ設定
    this.optimizations.cache.set('default', {
      maxSize: 100,
      ttl: 5 * 60 * 1000 // 5分
    });
  }

  // 遅延読み込み設定
  setupLazyLoad() {
    // 画像の遅延読み込み
    this.optimizations.lazyLoad.add('images');
    
    // 非クリティカルなスクリプトの遅延読み込み
    this.optimizations.lazyLoad.add('scripts');
  }

  // メモリ使用量チェック
  checkMemoryUsage() {
    if (!performance.memory) return;
    
    const current = performance.memory.usedJSHeapSize;
    this.metrics.memory.current = current;
    this.metrics.memory.peak = Math.max(this.metrics.memory.peak, current);
    
    if (current > this.thresholds.memory.critical) {
      console.error('[PerformanceOptimizer] メモリ使用量が危険レベルです:', this.formatBytes(current));
      this.triggerMemoryCleanup();
    } else if (current > this.thresholds.memory.warning) {
      console.warn('[PerformanceOptimizer] メモリ使用量が警告レベルです:', this.formatBytes(current));
      this.triggerMemoryCleanup();
    }
  }

  // メモリクリーンアップ実行
  triggerMemoryCleanup() {
    // ガベージコレクション実行
    if (window.gc) {
      window.gc();
    }
    
    // キャッシュクリーンアップ
    this.cleanupCache();
    
    // 古いログのクリーンアップ
    if (window.simplifiedAuditManager) {
      window.simplifiedAuditManager.cleanupOldLogs();
    }
    
    // 不要なイベントリスナーの削除
    this.cleanupEventListeners();
  }

  // キャッシュクリーンアップ
  cleanupCache() {
    const now = Date.now();
    const defaultCache = this.optimizations.cache.get('default');
    
    for (const [key, value] of this.optimizations.cache.entries()) {
      if (key !== 'default' && value.timestamp && now - value.timestamp > defaultCache.ttl) {
        this.optimizations.cache.delete(key);
      }
    }
  }

  // イベントリスナークリーンアップ
  cleanupEventListeners() {
    // 不要なイベントリスナーを削除
    // 実装は具体的な要件に応じて調整
  }

  // API呼び出し時間記録
  recordApiCall(duration, success = true) {
    this.metrics.api.calls++;
    this.metrics.api.totalTime += duration;
    this.metrics.api.averageTime = this.metrics.api.totalTime / this.metrics.api.calls;
    
    if (!success) {
      this.metrics.api.failures++;
    }
    
    if (duration > this.thresholds.api.slowCall) {
      console.warn('[PerformanceOptimizer] 遅いAPI呼び出し:', duration + 'ms');
    }
  }

  // UIメトリクス記録
  recordUIMetric(type, value) {
    this.metrics.ui[type] = value;
    
    const threshold = this.thresholds.ui[type];
    if (threshold && value > threshold) {
      console.warn(`[PerformanceOptimizer] 遅い${type}:`, value + 'ms');
    }
  }

  // デバウンス関数作成
  createDebounce(func, delay, key = 'default') {
    const debounceDelay = this.optimizations.debounce.get(key) || delay;
    let timeoutId;
    
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), debounceDelay);
    };
  }

  // スロットル関数作成
  createThrottle(func, delay, key = 'default') {
    const throttleDelay = this.optimizations.throttle.get(key) || delay;
    let lastCall = 0;
    
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= throttleDelay) {
        lastCall = now;
        return func.apply(this, args);
      }
    };
  }

  // キャッシュ取得
  getCached(key) {
    const cached = this.optimizations.cache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (cached.timestamp && now - cached.timestamp > cached.ttl) {
      this.optimizations.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  // キャッシュ設定
  setCached(key, data, ttl = null) {
    const defaultCache = this.optimizations.cache.get('default');
    this.optimizations.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      ttl: ttl || defaultCache.ttl
    });
  }

  // 遅延読み込み実行
  async lazyLoad(type, loader) {
    if (!this.optimizations.lazyLoad.has(type)) {
      return await loader();
    }
    
    // 遅延読み込みの実装
    return new Promise((resolve) => {
      requestIdleCallback(() => {
        loader().then(resolve);
      });
    });
  }

  // パフォーマンス測定開始
  startMeasure(name) {
    performance.mark(`${name}-start`);
  }

  // パフォーマンス測定終了
  endMeasure(name) {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
    
    const measure = performance.getEntriesByName(name)[0];
    if (measure) {
      this.recordUIMetric('renderTime', measure.duration);
    }
  }

  // メトリクス取得
  getMetrics() {
    return {
      ...this.metrics,
      memory: {
        ...this.metrics.memory,
        formatted: {
          current: this.formatBytes(this.metrics.memory.current),
          peak: this.formatBytes(this.metrics.memory.peak)
        }
      }
    };
  }

  // パフォーマンスレポート生成
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      optimizations: {
        debounce: Object.fromEntries(this.optimizations.debounce),
        throttle: Object.fromEntries(this.optimizations.throttle),
        cache: {
          size: this.optimizations.cache.size,
          keys: Array.from(this.optimizations.cache.keys())
        },
        lazyLoad: Array.from(this.optimizations.lazyLoad)
      },
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  // 推奨事項生成
  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.memory.current > this.thresholds.memory.warning) {
      recommendations.push('メモリ使用量が高いです。不要なデータのクリーンアップを検討してください。');
    }
    
    if (this.metrics.api.averageTime > 3000) {
      recommendations.push('API呼び出しが遅いです。キャッシュの活用やAPI最適化を検討してください。');
    }
    
    if (this.metrics.ui.renderTime > 100) {
      recommendations.push('UIレンダリングが遅いです。DOM操作の最適化を検討してください。');
    }
    
    return recommendations;
  }

  // バイト数フォーマット
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 最適化設定更新
  updateOptimization(type, key, value) {
    if (type === 'debounce') {
      this.optimizations.debounce.set(key, value);
    } else if (type === 'throttle') {
      this.optimizations.throttle.set(key, value);
    } else if (type === 'cache') {
      this.optimizations.cache.set(key, value);
    } else if (type === 'lazyLoad') {
      if (value) {
        this.optimizations.lazyLoad.add(key);
      } else {
        this.optimizations.lazyLoad.delete(key);
      }
    }
  }

  // 最適化リセット
  resetOptimizations() {
    this.optimizations.debounce.clear();
    this.optimizations.throttle.clear();
    this.optimizations.cache.clear();
    this.optimizations.lazyLoad.clear();
    
    this.setupOptimizations();
  }
}

// グローバルインスタンス
const performanceOptimizer = new PerformanceOptimizer();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.PerformanceOptimizer = {
    getMetrics: () => performanceOptimizer.getMetrics(),
    generateReport: () => performanceOptimizer.generateReport(),
    createDebounce: (func, delay, key) => performanceOptimizer.createDebounce(func, delay, key),
    createThrottle: (func, delay, key) => performanceOptimizer.createThrottle(func, delay, key),
    getCached: (key) => performanceOptimizer.getCached(key),
    setCached: (key, data, ttl) => performanceOptimizer.setCached(key, data, ttl),
    startMeasure: (name) => performanceOptimizer.startMeasure(name),
    endMeasure: (name) => performanceOptimizer.endMeasure(name),
    updateOptimization: (type, key, value) => performanceOptimizer.updateOptimization(type, key, value),
    resetOptimizations: () => performanceOptimizer.resetOptimizations()
  };
}

export { performanceOptimizer, PerformanceOptimizer };
