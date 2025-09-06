// config.js
// 複数のAPI URL（使用数上限回避のため分散）
const GAS_API_URLS = [
  "https://script.google.com/macros/s/AKfycbyxIY4S3npd0-v45_2EWqPn-uLTjwQlNlUCWUl7rztSIFjyIX2mxKERUoEM411kPHAQ/exec",
  // 新しいデプロイURLがある場合は下に追加してください
  // "https://script.google.com/macros/s/AKfycbNEW.../exec",
  // "https://script.google.com/macros/s/AKfycbANOTHER.../exec",
  // "https://script.google.com/macros/s/AKfycbTHIRD.../exec"
];

// URL選択とローテーション管理
class APIUrlManager {
  constructor() {
    this.urls = [...GAS_API_URLS];
    this.currentIndex = 0;
    this.lastRotationTime = Date.now();
    this.rotationInterval = 5 * 60 * 1000; // 5分間隔でローテーション
    this.initializeRandomSelection();
  }

  // 初期化時にランダムにURLを選択
  initializeRandomSelection() {
    if (this.urls.length > 1) {
      this.currentIndex = Math.floor(Math.random() * this.urls.length);
      console.log(`[API URL Manager] 初期URL選択: ${this.currentIndex + 1}/${this.urls.length}`, this.urls[this.currentIndex]);
    }
  }

  // 現在のURLを取得
  getCurrentUrl() {
    this.checkAndRotate();
    return this.urls[this.currentIndex];
  }

  // 定期的なローテーションをチェック
  checkAndRotate() {
    const now = Date.now();
    if (now - this.lastRotationTime >= this.rotationInterval && this.urls.length > 1) {
      this.rotateUrl();
    }
  }

  // URLを次のものにローテーション
  rotateUrl() {
    const oldIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    this.lastRotationTime = Date.now();
    console.log(`[API URL Manager] URLローテーション: ${oldIndex + 1} → ${this.currentIndex + 1}`, this.urls[this.currentIndex]);
  }

  // 手動でランダムURL選択
  selectRandomUrl() {
    if (this.urls.length > 1) {
      const oldIndex = this.currentIndex;
      this.currentIndex = Math.floor(Math.random() * this.urls.length);
      this.lastRotationTime = Date.now();
      console.log(`[API URL Manager] ランダム選択: ${oldIndex + 1} → ${this.currentIndex + 1}`, this.urls[this.currentIndex]);
    }
  }

  // 利用可能なURL一覧を取得
  getAllUrls() {
    return [...this.urls];
  }

  // 現在のURL情報を取得
  getCurrentUrlInfo() {
    return {
      index: this.currentIndex + 1,
      total: this.urls.length,
      url: this.urls[this.currentIndex],
      lastRotation: new Date(this.lastRotationTime).toLocaleString()
    };
  }
}

// グローバルインスタンス
const apiUrlManager = new APIUrlManager();
// バックグラウンド同期用URL（独立GASプロジェクトのURL）
const BACKGROUND_SYNC_URL = "https://script.google.com/macros/s/AKfycbzOVVyo8K5-bCZkzD_N2EXFLC7AHQSgKljJo1UXzVB99vacoOsHDme4NIn_emoes-t3/exec"; // 例: "https://script.google.com/macros/s/OFFLINE_PROJECT_ID/exec"
const DEBUG_MODE = true;

function debugLog(message, obj = null) {
  if (DEBUG_MODE) {
    console.log(message, obj || '');
  }
}

// 個別にエクスポート
export { GAS_API_URLS, BACKGROUND_SYNC_URL, DEBUG_MODE, debugLog, apiUrlManager };
