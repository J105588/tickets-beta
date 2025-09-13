// error-analyzer.js
// システム全体のエラー分析と診断ツール

class ErrorAnalyzer {
  constructor() {
    this.analysisResults = [];
    this.patterns = {
      critical: [
        'CreateListFromArrayLike',
        'Cannot read property',
        'TypeError',
        'ReferenceError',
        'Cannot access before initialization'
      ],
      network: [
        'fetch',
        'network',
        'timeout',
        'API',
        'GAS',
        'connection',
        'CORS'
      ],
      sync: [
        'sync',
        '同期',
        'spreadsheet',
        'スプレッドシート'
      ],
      storage: [
        'localStorage',
        'QuotaExceededError',
        'storage',
        'ストレージ'
      ]
    };
  }

  // エラーパターンを分析
  analyzeErrorPatterns(errors) {
    const analysis = {
      totalErrors: errors.length,
      patterns: {},
      criticalIssues: [],
      recommendations: [],
      timeline: this.analyzeTimeline(errors),
      frequency: this.analyzeFrequency(errors)
    };

    // パターン別分析
    Object.keys(this.patterns).forEach(category => {
      analysis.patterns[category] = errors.filter(error => 
        this.patterns[category].some(pattern => 
          error.error.message.includes(pattern) || 
          error.error.name.includes(pattern)
        )
      );
    });

    // クリティカルな問題を特定
    analysis.criticalIssues = this.identifyCriticalIssues(errors);
    
    // 推奨事項を生成
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  // タイムライン分析
  analyzeTimeline(errors) {
    const timeline = {};
    errors.forEach(error => {
      const date = error.timestamp.split('T')[0];
      timeline[date] = (timeline[date] || 0) + 1;
    });
    return timeline;
  }

  // 頻度分析
  analyzeFrequency(errors) {
    const frequency = {};
    errors.forEach(error => {
      const key = `${error.error.name}:${error.error.message}`;
      frequency[key] = (frequency[key] || 0) + 1;
    });
    
    // 頻度順にソート
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));
  }

  // クリティカルな問題を特定
  identifyCriticalIssues(errors) {
    const issues = [];
    
    // 連続エラー
    const recentErrors = errors.slice(0, 5);
    if (recentErrors.length >= 3) {
      issues.push({
        type: 'consecutive_errors',
        severity: 'high',
        description: '連続してエラーが発生しています',
        count: recentErrors.length,
        errors: recentErrors,
        recommendation: 'システムの再起動を検討してください'
      });
    }

    // 同期エラーの頻発
    const syncErrors = errors.filter(e => 
      e.context.phase === 'sync_to_spreadsheet' || 
      e.context.phase === 'gas_api_call' ||
      e.severity === 'sync'
    );
    if (syncErrors.length > 5) { // 閾値を10から5に下げる
      issues.push({
        type: 'sync_failure',
        severity: 'high',
        description: '同期エラーが頻発しています',
        count: syncErrors.length,
        recommendation: 'GAS APIの接続状況とスプレッドシートIDを確認してください'
      });
    }

    // ネットワークエラーの頻発
    const networkErrors = errors.filter(e => e.severity === 'network');
    if (networkErrors.length > 3) { // 閾値を5から3に下げる
      issues.push({
        type: 'network_issues',
        severity: 'medium',
        description: 'ネットワークエラーが頻発しています',
        count: networkErrors.length,
        recommendation: 'ネットワーク接続とAPI URLの有効性を確認してください'
      });
    }

    // ストレージエラーの検出
    const storageErrors = errors.filter(e => e.severity === 'storage');
    if (storageErrors.length > 0) {
      issues.push({
        type: 'storage_issues',
        severity: 'medium',
        description: 'ストレージ関連のエラーが発生しています',
        count: storageErrors.length,
        recommendation: 'ブラウザのストレージ容量を確認してください'
      });
    }

    return issues;
  }

  // 推奨事項を生成
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.patterns.critical.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'critical',
        action: 'クリティカルエラーの修正',
        description: `${analysis.patterns.critical.length}件のクリティカルエラーが検出されました`,
        steps: [
          'コンソールで AuditManager.analyzeErrors() を実行',
          'クリティカルエラーの詳細を確認',
          'エラーの発生箇所を特定',
          'コードの修正を実施'
        ]
      });
    }

    if (analysis.patterns.network.length > 5) {
      recommendations.push({
        priority: 'medium',
        category: 'network',
        action: 'ネットワーク接続の確認',
        description: 'ネットワーク関連のエラーが多発しています',
        steps: [
          'インターネット接続を確認',
          'GAS API URLの有効性を確認',
          'プロキシ設定を確認',
          'ファイアウォール設定を確認'
        ]
      });
    }

    if (analysis.patterns.sync.length > 10) {
      recommendations.push({
        priority: 'medium',
        category: 'sync',
        action: '同期機能の診断',
        description: '同期エラーが頻発しています',
        steps: [
          'スプレッドシートのアクセス権限を確認',
          'GASスクリプトの実行権限を確認',
          '監査ログスプレッドシートIDを確認',
          '手動同期を試行'
        ]
      });
    }

    return recommendations;
  }

  // 診断レポートを生成
  generateDiagnosticReport(errors) {
    const analysis = this.analyzeErrorPatterns(errors);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: analysis.totalErrors,
        criticalCount: analysis.patterns.critical.length,
        networkCount: analysis.patterns.network.length,
        syncCount: analysis.patterns.sync.length,
        storageCount: analysis.patterns.storage.length
      },
      analysis: analysis,
      status: this.determineSystemStatus(analysis),
      actions: this.generateActionPlan(analysis)
    };

    return report;
  }

  // システム状態を判定
  determineSystemStatus(analysis) {
    if (analysis.patterns.critical.length > 0) {
      return 'critical';
    } else if (analysis.patterns.network.length > 10 || analysis.patterns.sync.length > 20) {
      return 'warning';
    } else if (analysis.totalErrors > 50) {
      return 'attention';
    } else {
      return 'healthy';
    }
  }

  // アクションプランを生成
  generateActionPlan(analysis) {
    const actions = [];

    if (analysis.criticalIssues.length > 0) {
      actions.push({
        immediate: true,
        action: 'クリティカルエラーの緊急対応',
        description: 'システムの安定性に影響するエラーを優先的に修正'
      });
    }

    if (analysis.patterns.network.length > 5) {
      actions.push({
        immediate: false,
        action: 'ネットワーク設定の見直し',
        description: 'API接続の安定性を向上させる'
      });
    }

    if (analysis.patterns.sync.length > 10) {
      actions.push({
        immediate: false,
        action: '同期機能の最適化',
        description: '同期処理の信頼性を向上させる'
      });
    }

    return actions;
  }

  // レポートをコンソールに出力
  printDiagnosticReport(errors) {
    const report = this.generateDiagnosticReport(errors);
    
    console.log('=== システム診断レポート ===');
    console.log('生成時刻:', report.timestamp);
    console.log('システム状態:', report.status);
    console.log('');
    
    console.log('=== エラーサマリー ===');
    console.log('総エラー数:', report.summary.totalErrors);
    console.log('クリティカル:', report.summary.criticalCount);
    console.log('ネットワーク:', report.summary.networkCount);
    console.log('同期:', report.summary.syncCount);
    console.log('ストレージ:', report.summary.storageCount);
    console.log('');
    
    console.log('=== クリティカルな問題 ===');
    report.analysis.criticalIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.description} (${issue.count}件)`);
      if (issue.recommendation) {
        console.log(`   推奨: ${issue.recommendation}`);
      }
    });
    console.log('');
    
    console.log('=== 推奨事項 ===');
    report.analysis.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
      console.log(`   ${rec.description}`);
      if (rec.steps) {
        rec.steps.forEach(step => console.log(`   - ${step}`));
      }
    });
    console.log('');
    
    console.log('=== アクションプラン ===');
    report.actions.forEach((action, index) => {
      console.log(`${index + 1}. ${action.action}`);
      console.log(`   ${action.description}`);
      console.log(`   緊急度: ${action.immediate ? '高' : '中'}`);
    });
    console.log('========================');
    
    return report;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.ErrorAnalyzer = ErrorAnalyzer;
}

export { ErrorAnalyzer };
