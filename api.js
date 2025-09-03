// api.js
import { GAS_API_URL, GAS_API_URLS, DEBUG_MODE, debugLog } from './config.js';

class GasAPI {
  static _callApi(functionName, params = []) {
    return new Promise((resolve, reject) => {
      try {
        // オフライン時は一切通信しない
        try { if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) { return resolve({ success: false, error: 'offline', offline: true }); } } catch (_) {}
        debugLog(`API Call (JSONP): ${functionName}`, params);

        const callbackName = 'jsonpCallback_' + functionName + '_' + Date.now();
        const encodedParams = encodeURIComponent(JSON.stringify(params));
        const encodedFuncName = encodeURIComponent(functionName);
        
        window[callbackName] = (data) => {
          debugLog(`API Response (JSONP): ${functionName}`, data);
          try {
            try { clearTimeout(timeoutId); } catch (e) {}
            delete window[callbackName]; // コールバック関数を削除
            if (script && script.parentNode) {
              script.parentNode.removeChild(script); // スクリプトタグを削除
            }
            
            // success: falseの場合も正常なレスポンスとして扱う
            if (data && typeof data === 'object') {
              resolve(data);
            } else {
              // エラーレスポンスでもresolveして、呼び出し側で処理
              resolve({ success: false, error: '無効なAPIレスポンスです', data: data });
            }
          } catch (e) {
            console.error('API response cleanup failed:', e);
            resolve({ success: false, error: 'API応答の処理中にエラーが発生しました: ' + e.message });
          }
        };

        // URL 構築（キャッシュバスター付き）
        const urls = Array.isArray(GAS_API_URLS) && GAS_API_URLS.length > 0 ? GAS_API_URLS : [GAS_API_URL];
        const cacheBuster = `_=${Date.now()}`;
        const formData = `func=${encodedFuncName}&params=${encodedParams}`;
        let currentUrlIndex = 0;
        let fullUrl = `${urls[currentUrlIndex]}?callback=${callbackName}&${formData}&${cacheBuster}`;

        const script = document.createElement('script');
        script.src = fullUrl;
        script.async = true;
        
        let timeoutId = setTimeout(() => {
          console.error('API call timeout:', { functionName, fullUrl });
          try {
            // 遅延応答で callback 未定義にならないよう、しばらくはNOOPを残す
            window[callbackName] = function noop() { /* late JSONP ignored */ };
            // 60秒後に完全クリーンアップ
            setTimeout(() => { try { delete window[callbackName]; } catch (_) {} }, 60000);
            if (script && script.parentNode) {
              script.parentNode.removeChild(script);
            }
          } catch (e) {}
          this._reportError(`JSONPタイムアウト: ${functionName}`);
          resolve({ success: false, error: `JSONPタイムアウト: ${functionName}`, timeout: true });
        }, 15000);

        script.onerror = (error) => {
          console.error('API call error:', error, { functionName, fullUrl });
          try {
            // 次のURLがあればフェイルオーバー
            if (Array.isArray(urls) && currentUrlIndex < urls.length - 1) {
              currentUrlIndex++;
              const nextUrl = `${urls[currentUrlIndex]}?callback=${callbackName}&${formData}&${cacheBuster}`;
              console.warn('Failing over to next GAS url:', nextUrl);
              script.src = nextUrl;
              return; // タイムアウトは継続
            }

            delete window[callbackName];
            if (script && script.parentNode) {
              script.parentNode.removeChild(script);
            }
            clearTimeout(timeoutId);
            
            // より詳細なエラー情報を提供
            const errorDetails = {
              functionName,
              fullUrl,
              errorType: 'script_error',
              timestamp: new Date().toISOString()
            };
            console.error('API call failed details:', errorDetails);
            
            this._reportError(`JSONPリクエストに失敗しました: ${functionName} (詳細: ${JSON.stringify(errorDetails)})`);
            resolve({ success: false, error: `JSONPリクエストに失敗しました: ${functionName}`, details: errorDetails });
          } catch (e) {
            console.error('API error cleanup failed:', e);
            resolve({ success: false, error: 'APIエラー処理中に例外が発生しました: ' + e.message });
          }
        };
        
        (document.head || document.body || document.documentElement).appendChild(script);
      } catch (err) {
        console.error('API call exception:', err);
        this._reportError(`API呼び出し例外: ${err.message}`);
        resolve({ success: false, error: `API呼び出し例外: ${err.message}`, exception: true });
      }
    });
  }

  static getSystemLock() {
    return this._callApi('getSystemLock', []);
  }

  static setSystemLock(shouldLock, password) {
    return this._callApi('setSystemLock', [shouldLock === true, password || '']);
  }

  static _reportError(errorMessage) {
    // オフライン時は報告しない（通信しない）
    try { if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) { return; } } catch (_) {}
    // エラー詳細をコンソールに出力
    console.error('API Error Details:', {
      message: errorMessage,
      timestamp: new Date().toISOString(),
      url: window.location.href
    });
    
    // UIにエラーメッセージを表示
    try {
      const errorContainer = document.getElementById('error-container');
      const errorMessageElement = document.getElementById('error-message');
      
      if (errorContainer && errorMessageElement) {
        errorMessageElement.textContent = 'サーバー通信失敗: ' + errorMessage;
        errorContainer.style.display = 'flex';
      }
    } catch (e) {
      console.error('エラー表示に失敗しました:', e);
    }
    
    // エラー報告APIを呼び出す（ただし、エラーが発生している場合はスキップ）
    try {
      const callbackName = 'jsonpCallback_reportError_' + Date.now();
      const script = document.createElement('script');
      
      window[callbackName] = (data) => {
        try {
          delete window[callbackName]; // コールバック関数を削除
          if (script && script.parentNode) {
            script.parentNode.removeChild(script); // スクリプトタグを削除
          }
          console.log('Error reported to server:', data);
        } catch (e) {
          console.error('Error cleanup failed:', e);
        }
      };

      let url = `${GAS_API_URL}?callback=${callbackName}&func=reportError&params=${encodeURIComponent(JSON.stringify([errorMessage]))}`;
      script.src = url;
      document.head.appendChild(script);
    } catch (e) {
      console.error('Error reporting failed:', e);
    }
  }

  static async getAllTimeslotsForGroup(group) {
    const response = await this._callApi('getAllTimeslotsForGroup', [group]);
    return response.data; // データを返す
  }

  static async testApi() {
    const response = await this._callApi('testApi');
    return response.data;
  }

  static async verifyModePassword(mode, password) {
    const response = await this._callApi('verifyModePassword', [mode, password]);
    return response;
  }

  static async getSeatData(group, day, timeslot, isAdmin, isSuperAdmin = false) {
    const response = await this._callApi('getSeatData', [group, day, timeslot, isAdmin, isSuperAdmin]);
    return response;
  }

  static async assignWalkInSeat(group, day, timeslot) {
    const response = await this._callApi('assignWalkInSeat', [group, day, timeslot]);
    return response;
  }

  static async reserveSeats(group, day, timeslot, selectedSeats) {
    const response = await this._callApi('reserveSeats', [group, day, timeslot, selectedSeats]);
    return response;
  }

  static async checkInSeat(group, day, timeslot, seatId) {
    const response = await this._callApi('checkInSeat', [group, day, timeslot, seatId]);
    return response;
  }

  static async checkInMultipleSeats(group, day, timeslot, seatIds) {
    const response = await this._callApi('checkInMultipleSeats', [group, day, timeslot, seatIds]);
    return response;
  }

  static async assignWalkInSeats(group, day, timeslot, count) {
    const response = await this._callApi('assignWalkInSeats', [group, day, timeslot, count]);
    return response;
  }

  static async assignWalkInConsecutiveSeats(group, day, timeslot, count) {
    const response = await this._callApi('assignWalkInConsecutiveSeats', [group, day, timeslot, count]);
    return response;
  }

  static async updateSeatData(group, day, timeslot, seatId, columnC, columnD, columnE) {
    const response = await this._callApi('updateSeatData', [group, day, timeslot, seatId, columnC, columnD, columnE]);
    return response;
  }

  // 最適化された座席データ取得（最小限のデータ）
  static async getSeatDataMinimal(group, day, timeslot, isAdmin = false) {
    const response = await this._callApi('getSeatDataMinimal', [group, day, timeslot, isAdmin]);
    return response;
  }

  // 複数座席の一括更新
  static async updateMultipleSeats(group, day, timeslot, updates) {
    const response = await this._callApi('updateMultipleSeats', [group, day, timeslot, updates]);
    return response;
  }

  // GASの疎通テスト用関数
  static async testGASConnection() {
    try {
      console.log('GAS疎通テスト開始...');
      const response = await this._callApi('testApi');
      console.log('GAS疎通テスト成功:', response);
      return { success: true, data: response };
    } catch (error) {
      console.error('GAS疎通テスト失敗:', error);
      return { success: false, error: error.message };
    }
  }
}

export default GasAPI;

// 安全なコンソールコマンド（最高管理者パスワードが必要）
if (typeof window !== 'undefined') {
  window.SeatApp = window.SeatApp || {};
  window.SeatApp.lock = async (password) => {
    if (!password) { console.warn('SeatApp.lock requires superadmin password'); return; }
    return GasAPI.setSystemLock(true, password);
  };
  window.SeatApp.unlock = async (password) => {
    if (!password) { console.warn('SeatApp.unlock requires superadmin password'); return; }
    return GasAPI.setSystemLock(false, password);
  };
  window.SeatApp.status = async () => GasAPI.getSystemLock();
  // 危険コマンド（ブラウザコンソール専用）
  window.SeatApp.exec = async (action, payload, password) => {
    return GasAPI._callApi('execDangerCommand', [action, payload, password]);
  };
}


