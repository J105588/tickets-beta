// verify-api.js
// 新しいAPI URLの検証スクリプト

// 新しいAPI URL
const NEW_API_URL = "https://script.google.com/macros/s/AKfycbzk9CsyfxxwwWrcwHNiwGebJ3yFuJ3G0R_Tglsc1__PIYjV0Q1rmFZWTyRCDFIFnwi-/exec";

// 既存のAPI URL
const EXISTING_API_URL = "https://script.google.com/macros/s/AKfycbxi3JHgWJPQIRVD1vyAUv3a95Trx5GQafOg7Fg8ffmcI5QX9vwf2W2LwQyVUiEPfq1Q/exec";

async function verifyAPI(url, name) {
  console.log(`\n=== ${name} 検証中 ===`);
  console.log(`URL: ${url}`);
  
  const startTime = Date.now();
  
  try {
    // JSONP形式でAPIを呼び出し
    const callback = `verifyCallback_${Date.now()}`;
    const testUrl = `${url}?callback=${callback}`;
    
    const response = await new Promise((resolve, reject) => {
      // コールバック関数を設定
      window[callback] = (data) => {
        delete window[callback];
        resolve(data);
      };
      
      // スクリプトタグを作成
      const script = document.createElement('script');
      script.src = testUrl;
      script.onerror = () => {
        delete window[callback];
        reject(new Error('スクリプト読み込みエラー'));
      };
      
      document.head.appendChild(script);
      
      // タイムアウト設定
      setTimeout(() => {
        if (window[callback]) {
          delete window[callback];
          document.head.removeChild(script);
          reject(new Error('タイムアウト'));
        }
      }, 10000);
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ 成功: ${duration}ms`);
    console.log(`レスポンス:`, response);
    
    return {
      success: true,
      duration: duration,
      response: response
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`❌ エラー: ${error.message} (${duration}ms)`);
    
    return {
      success: false,
      duration: duration,
      error: error.message
    };
  }
}

async function runVerification() {
  console.log('=== API URL 検証開始 ===');
  
  // 両方のAPI URLをテスト
  const results = await Promise.all([
    verifyAPI(EXISTING_API_URL, '既存API'),
    verifyAPI(NEW_API_URL, '新API')
  ]);
  
  // 結果の比較
  console.log('\n=== 検証結果比較 ===');
  
  const existing = results[0];
  const newApi = results[1];
  
  console.log(`既存API: ${existing.success ? '✅' : '❌'} ${existing.duration}ms`);
  console.log(`新API:   ${newApi.success ? '✅' : '❌'} ${newApi.duration}ms`);
  
  if (existing.success && newApi.success) {
    const faster = existing.duration < newApi.duration ? '既存API' : '新API';
    const difference = Math.abs(existing.duration - newApi.duration);
    console.log(`\n🚀 より高速: ${faster} (差: ${difference}ms)`);
  }
  
  // 推奨事項
  console.log('\n=== 推奨事項 ===');
  if (existing.success && newApi.success) {
    console.log('✅ 両方のAPI URLが正常に動作しています');
    console.log('✅ 負荷分散と冗長性の向上が期待できます');
  } else if (existing.success) {
    console.log('⚠️  既存APIのみ動作中。新APIの設定を確認してください');
  } else if (newApi.success) {
    console.log('⚠️  新APIのみ動作中。既存APIの設定を確認してください');
  } else {
    console.log('❌ 両方のAPI URLに問題があります。設定を確認してください');
  }
  
  return results;
}

// 自動実行
if (typeof window !== 'undefined') {
  // ブラウザ環境で自動実行
  runVerification().then(results => {
    console.log('\n=== 検証完了 ===');
    console.log('結果:', results);
  });
  
  // コンソール操作用に公開
  window.verifyAPI = {
    run: runVerification,
    testExisting: () => verifyAPI(EXISTING_API_URL, '既存API'),
    testNew: () => verifyAPI(NEW_API_URL, '新API')
  };
  
  console.log('=== API 検証ツール ===');
  console.log('使用可能なコマンド:');
  console.log('  verifyAPI.run()        - 両方のAPIを検証');
  console.log('  verifyAPI.testExisting() - 既存APIのみ検証');
  console.log('  verifyAPI.testNew()    - 新APIのみ検証');
}

export { verifyAPI, runVerification };
