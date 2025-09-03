// config.js
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzw_TsViGUzWhMELA8e3FYjnI4bs-l1EzbRzZrXjWWVpkrTw6G7s4i7QZF57uzV8GkD/exec";
// フェイルオーバー用に複数URLを保持可能（先頭から順に試行）
const GAS_API_URLS = [
  GAS_API_URL,
  // 新しいデプロイURLがある場合は下に追加してください
  // "https://script.google.com/macros/s/AKfycbNEW.../exec"
];
const DEBUG_MODE = false;

function debugLog(message, obj = null) {
  if (DEBUG_MODE) {
    console.log(message, obj || '');
  }
}

// 個別にエクスポート
export { GAS_API_URL, GAS_API_URLS, DEBUG_MODE, debugLog };
