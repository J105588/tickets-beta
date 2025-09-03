// config.js
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyxIY4S3npd0-v45_2EWqPn-uLTjwQlNlUCWUl7rztSIFjyIX2mxKERUoEM411kPHAQ/exec";
// フェイルオーバー用に複数URLを保持可能（先頭から順に試行）
const GAS_API_URLS = [
  GAS_API_URL,
  // 新しいデプロイURLがある場合は下に追加してください
  // "https://script.google.com/macros/s/AKfycbNEW.../exec"
];
// バックグラウンド同期用URL（独立GASプロジェクトのURL）
const BACKGROUND_SYNC_URL = "https://script.google.com/macros/s/AKfycbzOVVyo8K5-bCZkzD_N2EXFLC7AHQSgKljJo1UXzVB99vacoOsHDme4NIn_emoes-t3/exec"; // 例: "https://script.google.com/macros/s/OFFLINE_PROJECT_ID/exec"
const DEBUG_MODE = true;

function debugLog(message, obj = null) {
  if (DEBUG_MODE) {
    console.log(message, obj || '');
  }
}

// 個別にエクスポート
export { GAS_API_URL, GAS_API_URLS, BACKGROUND_SYNC_URL, DEBUG_MODE, debugLog };
