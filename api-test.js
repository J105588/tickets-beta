// api-test.js
// API URL テストスクリプト

import { apiUrlManager } from './config.js';

class APITester {
  constructor() {
    this.results = [];
  }

  // 単一URLテスト
  async testSingleURL(url, index) {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url + '?callback=testCallback');
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (response.ok) {
        return {
          index: index + 1,
          url: url,
          status: 'success',
          duration: duration,
          response: 'OK'
        };
      } else {
        return {
          index: index + 1,
          url: url,
          status: 'error',
          duration: duration,
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      return {
        index: index + 1,
        url: url,
        status: 'error',
        duration: duration,
        error: error.message
      };
    }
  }

  // 全URLテスト
  async testAllURLs() {
    console.log('=== API URL テスト開始 ===');
    
    const urls = apiUrlManager.getAllUrls();
    const tests = urls.map((url, index) => this.testSingleURL(url, index));
    
    this.results = await Promise.all(tests);
    
    this.displayResults();
    return this.results;
  }

  // 結果表示
  displayResults() {
    console.log('\n=== テスト結果 ===');
    
    this.results.forEach(result => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`${status} URL ${result.index}: ${result.duration}ms`);
      console.log(`   ${result.url}`);
      
      if (result.status === 'success') {
        console.log(`   ✅ 応答時間: ${result.duration}ms`);
      } else {
        console.log(`   ❌ エラー: ${result.error}`);
      }
      console.log('');
    });
    
    // 統計情報
    const successful = this.results.filter(r => r.status === 'success');
    const failed = this.results.filter(r => r.status === 'error');
    const avgDuration = successful.length > 0 
      ? Math.round(successful.reduce((sum, r) => sum + r.duration, 0) / successful.length)
      : 0;
    
    console.log('=== 統計 ===');
    console.log(`総URL数: ${this.results.length}`);
    console.log(`成功: ${successful.length}`);
    console.log(`失敗: ${failed.length}`);
    console.log(`平均応答時間: ${avgDuration}ms`);
    
    // 推奨URL
    if (successful.length > 0) {
      const fastest = successful.reduce((min, current) => 
        current.duration < min.duration ? current : min
      );
      console.log(`\n🚀 最速URL: ${fastest.url} (${fastest.duration}ms)`);
    }
  }

  // 継続的テスト
  async continuousTest(interval = 30000) {
    console.log(`=== 継続的テスト開始 (${interval/1000}秒間隔) ===`);
    
    const testInterval = setInterval(async () => {
      console.log(`\n[${new Date().toLocaleTimeString()}] 継続テスト実行中...`);
      await this.testAllURLs();
    }, interval);
    
    // 10分後に停止
    setTimeout(() => {
      clearInterval(testInterval);
      console.log('=== 継続的テスト終了 ===');
    }, 10 * 60 * 1000);
  }

  // 負荷テスト
  async loadTest(concurrent = 5, duration = 10000) {
    console.log(`=== 負荷テスト開始 (同時接続: ${concurrent}, 期間: ${duration/1000}秒) ===`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrent; i++) {
      promises.push(this.runLoadTestWorker(startTime, duration));
    }
    
    const results = await Promise.all(promises);
    
    // 結果集計
    const allResults = results.flat();
    const successful = allResults.filter(r => r.status === 'success');
    const failed = allResults.filter(r => r.status === 'error');
    
    console.log('\n=== 負荷テスト結果 ===');
    console.log(`総リクエスト数: ${allResults.length}`);
    console.log(`成功: ${successful.length}`);
    console.log(`失敗: ${failed.length}`);
    console.log(`成功率: ${Math.round((successful.length / allResults.length) * 100)}%`);
    
    if (successful.length > 0) {
      const durations = successful.map(r => r.duration);
      const avgDuration = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      
      console.log(`平均応答時間: ${avgDuration}ms`);
      console.log(`最短応答時間: ${minDuration}ms`);
      console.log(`最長応答時間: ${maxDuration}ms`);
    }
  }

  // 負荷テストワーカー
  async runLoadTestWorker(startTime, duration) {
    const results = [];
    const urls = apiUrlManager.getAllUrls();
    
    while (Date.now() - startTime < duration) {
      const randomUrl = urls[Math.floor(Math.random() * urls.length)];
      const result = await this.testSingleURL(randomUrl, 0);
      results.push(result);
      
      // 短い間隔でリクエスト
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}

// グローバルインスタンス
const apiTester = new APITester();

// コンソール操作用に公開
if (typeof window !== 'undefined') {
  window.APITester = {
    testAll: () => apiTester.testAllURLs(),
    continuous: (interval) => apiTester.continuousTest(interval),
    loadTest: (concurrent, duration) => apiTester.loadTest(concurrent, duration),
    results: () => apiTester.results
  };
  
  console.log('=== API テストツール ===');
  console.log('使用可能なコマンド:');
  console.log('  APITester.testAll()           - 全URLテスト');
  console.log('  APITester.continuous(30000)   - 継続的テスト (30秒間隔)');
  console.log('  APITester.loadTest(5, 10000)  - 負荷テスト (5並行, 10秒)');
  console.log('  APITester.results()           - 結果表示');
}

export { apiTester, APITester };
