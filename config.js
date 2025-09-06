// config.js
// 複数のAPI URL（使用数上限回避のため分散）
const GAS_API_URLS = [
  //jxjin2010@gmail.com
  "https://script.google.com/macros/s/AKfycbyxIY4S3npd0-v45_2EWqPn-uLTjwQlNlUCWUl7rztSIFjyIX2mxKERUoEM411kPHAQ/exec",
  //jxjin.ig.school@gmail.com
  "https://script.google.com/macros/s/AKfycbx4gwaLXvlObvgxQ74Sl3rSGKSqcLquY6exWtoo7E5AIZZslQQVpalqPO8F77js861Z/exec",
  //nzn.engeki5.b@gmail.com
  "https://script.google.com/macros/s/AKfycbzimmDaGlGJtfDFqFqSSNRO-wdCYzGrePOLYvhyC3WVqXrWQFiW_eKlHdcvNwt8Rib9/exec"
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

  // URLを次のものにローテーション（現在のURLとは異なるものを必ず選択）
  rotateUrl() {
    const oldIndex = this.currentIndex;
    
    // 次のURLを選択（配列の最後の場合は最初に戻る）
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    
    // もしURLが1つしかない場合は何もしない
    if (this.urls.length <= 1) {
      return;
    }
    
    this.lastRotationTime = Date.now();
    console.log(`[API URL Manager] URLローテーション: ${oldIndex + 1} → ${this.currentIndex + 1}`, this.urls[this.currentIndex]);
  }

  // 手動でランダムURL選択（現在のURLとは異なるものを必ず選択）
  selectRandomUrl() {
    console.log(`[API URL Manager] selectRandomUrl開始: 現在のインデックス=${this.currentIndex}, URL数=${this.urls.length}`);
    
    if (this.urls.length > 1) {
      const oldIndex = this.currentIndex;
      const oldUrl = this.urls[oldIndex];
      console.log(`[API URL Manager] 現在のURL: ${oldUrl}`);
      
      // 現在のURLとは異なるURLを選択
      let newIndex;
      let attempts = 0;
      do {
        newIndex = Math.floor(Math.random() * this.urls.length);
        attempts++;
        console.log(`[API URL Manager] 選択試行${attempts}: インデックス=${newIndex}, URL=${this.urls[newIndex]}`);
      } while (newIndex === oldIndex && this.urls.length > 1 && attempts < 10);
      
      if (attempts >= 10) {
        console.warn('[API URL Manager] 10回試行しても異なるURLが見つかりません');
        return;
      }
      
      this.currentIndex = newIndex;
      this.lastRotationTime = Date.now();
      console.log(`[API URL Manager] ランダム選択完了: ${oldIndex + 1} → ${this.currentIndex + 1}`, this.urls[this.currentIndex]);
    } else {
      console.log('[API URL Manager] URLが1つしかないため、選択をスキップ');
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
