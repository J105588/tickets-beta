// offline-sync.js
// 完全に独立したオフライン同期モジュール（本体に影響しないよう防御的に動作）
// 役割:
// - オンライン時: 座席データをローカルに定期同期（バックグラウンド）
// - オフライン検知時: GasAPIの主要メソッドを安全に差し替え、ローカルデータで動作・更新はキューに保存
// - 再接続時: キューを順次サーバーへ反映

import GasAPI from './api.js';
import { BACKGROUND_SYNC_URL } from './config.js';

// ===== 設定 =====
const OFFLINE_FEATURE_ENABLED = true; // 必要なら遠隔で切替可能に
const SYNC_INTERVAL_MS = 30 * 1000; // バックグラウンド同期間隔（30秒）
const STORAGE_PREFIX = 'offlineSeats'; // localStorage キー接頭辞
const QUEUE_KEY = `${STORAGE_PREFIX}:pendingQueue`;
const META_KEY = `${STORAGE_PREFIX}:meta`;
const BACKGROUND_SYNC_URL_KEY = `${STORAGE_PREFIX}:backgroundSyncUrl`;
const ENABLE_SYNC_LOG = true;

function logSync(message, details) {
  try {
    if (!ENABLE_SYNC_LOG) return;
    const ts = new Date().toISOString();
    if (details !== undefined) {
      console.log(`[OfflineSync ${ts}] ${message}`, details);
    } else {
      console.log(`[OfflineSync ${ts}] ${message}`);
    }
  } catch (_) {}
}

// ===== IndexedDB ヘルパー（ローカルDB保存） =====
let __idbPromise = null;
function openOfflineDb() {
  if (__idbPromise) return __idbPromise;
  try {
    __idbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB ? indexedDB.open('ticketsOfflineDB', 1) : null;
      if (!request) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = (event) => {
        try {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('seatCache')) {
            db.createObjectStore('seatCache', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('queue')) {
            db.createObjectStore('queue', { keyPath: 'key' });
          }
        } catch (_) {}
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return __idbPromise;
  } catch (_) {
    return Promise.resolve(null);
  }
}

async function idbSet(storeName, key, value) {
  try {
    const db = await openOfflineDb();
    if (!db) return false;
    return await new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch (_) { return false; }
}

async function idbGet(storeName, key) {
  try {
    const db = await openOfflineDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && 'value' in req.result) resolve(req.result.value); else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

// ===== ユーティリティ =====
function getKey(group, day, timeslot) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(group)}:${encodeURIComponent(day)}:${encodeURIComponent(timeslot)}`;
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch (_) { return fallback; }
}

function readCache(group, day, timeslot) {
  const raw = localStorage.getItem(getKey(group, day, timeslot));
  const parsed = safeParse(raw, null);
  // localStorage に無ければ IndexedDB から非同期で復元（UIは同期的にnullで進行）
  if (!parsed) {
    try {
      const key = getKey(group, day, timeslot);
      idbGet('seatCache', key).then((val) => {
        if (val) {
          try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
        }
      });
    } catch (_) {}
  }
  return parsed;
}

function writeCache(group, day, timeslot, data) {
  try {
    localStorage.setItem(getKey(group, day, timeslot), JSON.stringify({
      success: true,
      seatMap: data && data.seatMap ? data.seatMap : data,
      cachedAt: Date.now()
    }));
    // IndexedDB にも保存（非同期）
    try {
      const key = getKey(group, day, timeslot);
      idbSet('seatCache', key, {
        success: true,
        seatMap: data && data.seatMap ? data.seatMap : data,
        cachedAt: Date.now()
      });
    } catch (_) {}
    const meta = safeParse(localStorage.getItem(META_KEY), {});
    meta.lastCachedAt = Date.now();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    try {
      const count = data && data.seatMap ? Object.keys(data.seatMap).length : 0;
      logSync(`Cached seat data for ${group}-${day}-${timeslot} (count=${count})`);
    } catch (_) {}
  } catch (_) {}
}

function readQueue() {
  const parsed = safeParse(localStorage.getItem(QUEUE_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || [])); } catch (_) {}
  // IndexedDB にも保存（非同期）
  try { idbSet('queue', 'pending', Array.isArray(queue) ? queue : []); } catch (_) {}
}

function enqueue(operation) {
  const q = readQueue();
  // 競合検出用に前提状態（precondition）を含められるようにする
  // operation: { type, args, pre?: { seatId -> {columnC,columnD,columnE,status} or arbitrary } }
  q.push({ ...operation, enqueuedAt: Date.now() });
  writeQueue(q);
  
  // オフライン操作をコンソールに出力
  const timestamp = new Date().toLocaleString('ja-JP');
  console.log(`[オフライン操作] ${timestamp}`, {
    type: operation.type,
    args: operation.args,
    precondition: operation.pre,
    queueLength: q.length
  });
}

function isOffline() {
  try { return !navigator.onLine; } catch (_) { return false; }
}

function getBackgroundSyncUrl() {
  try {
    return localStorage.getItem(BACKGROUND_SYNC_URL_KEY) || null;
  } catch (_) { return null; }
}

function setBackgroundSyncUrl(url) {
  try {
    if (url) {
      localStorage.setItem(BACKGROUND_SYNC_URL_KEY, url);
    } else {
      localStorage.removeItem(BACKGROUND_SYNC_URL_KEY);
    }
  } catch (_) {}
}

// ===== バックグラウンド同期（オンライン時） =====
async function backgroundSyncCurrentContext() {
  try {
    if (isOffline()) return;
    const params = new URLSearchParams(window.location.search);
    const group = params.get('group');
    const day = params.get('day');
    const timeslot = params.get('timeslot');
    if (!group || !day || !timeslot) return; // 該当ページでない

    // 通常は最小データで十分
    logSync(`Background pre-sync start for ${group}-${day}-${timeslot}`);
    const minimal = await GasAPI.getSeatDataMinimal(group, day, timeslot, false);
    if (minimal && minimal.seatMap) {
      writeCache(group, day, timeslot, minimal);
    }
    logSync(`Background pre-sync done for ${group}-${day}-${timeslot}`);
  } catch (_) {
    // 失敗しても本体に影響しない
    logSync('Background pre-sync failed');
  }
}

// ===== バックグラウンド同期用URLからのデータ取得 =====
async function fetchFromBackgroundSyncUrl(group, day, timeslot) {
  try {
    const backgroundUrl = getBackgroundSyncUrl();
    if (!backgroundUrl) return null;

    const callbackName = 'jsonpCallback_bgSync_' + Date.now();
    const encodedParams = encodeURIComponent(JSON.stringify([group, day, timeslot, false]));
    const url = `${backgroundUrl}?callback=${callbackName}&func=getSeatDataMinimal&params=${encodedParams}&_=${Date.now()}`;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      window[callbackName] = (data) => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(data);
        } catch (e) {
          resolve(null);
        }
      };

      script.onerror = () => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        } catch (_) {}
        resolve(null);
      };

      (document.head || document.body).appendChild(script);

      // タイムアウト
      setTimeout(() => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        } catch (_) {}
        resolve(null);
      }, 10000);
    });
  } catch (_) {
    return null;
  }
}

let syncTimer = null;
function startBackgroundSync() {
  stopBackgroundSync();
  syncTimer = setInterval(backgroundSyncCurrentContext, SYNC_INTERVAL_MS);
}
function stopBackgroundSync() { if (syncTimer) { clearInterval(syncTimer); syncTimer = null; } }

// ===== オフライン時のGasAPI差し替え =====
function installOfflineOverrides() {
  if (!OFFLINE_FEATURE_ENABLED) return;
  if (!GasAPI || typeof GasAPI !== 'function') return;

  // 同じタブで二重に上書きしない
  if (GasAPI.__offlineOverridden) return;

  console.log('[オフライン設定] GasAPIをオフライン操作モードに切り替えます');

  const original = {
    getSeatData: GasAPI.getSeatData,
    getSeatDataMinimal: GasAPI.getSeatDataMinimal,
    reserveSeats: GasAPI.reserveSeats,
    checkInMultipleSeats: GasAPI.checkInMultipleSeats,
    updateSeatData: GasAPI.updateSeatData
  };

  function readContext() {
    const p = new URLSearchParams(window.location.search);
    return { group: p.get('group') || '見本演劇', day: p.get('day') || '1', timeslot: p.get('timeslot') || 'A' };
  }

  // 読み取り系
  GasAPI.getSeatData = async (group, day, timeslot) => {
    const cached = readCache(group, day, timeslot);
    if (cached) return cached;
    // キャッシュが無い場合でもオブジェクト形を返す
    return { success: true, seatMap: {}, cachedAt: null, offline: true };
  };
  GasAPI.getSeatDataMinimal = async (group, day, timeslot) => {
    const cached = readCache(group, day, timeslot);
    if (cached) {
      // 最小データに整形
      const minimalMap = {};
      const src = cached.seatMap || {};
      Object.keys(src).forEach(id => { minimalMap[id] = { id, status: src[id].status || 'unavailable' }; });
      return { success: true, seatMap: minimalMap, cachedAt: cached.cachedAt, offline: true };
    }
    return { success: true, seatMap: {}, cachedAt: null, offline: true };
  };

  // 書き込み系（ローカルへ反映し、キューへ追加）
  GasAPI.reserveSeats = async (group, day, timeslot, selectedSeats) => {
    const cached = readCache(group, day, timeslot) || { seatMap: {} };
    (selectedSeats || []).forEach(id => {
      cached.seatMap[id] = cached.seatMap[id] || { id };
      cached.seatMap[id].status = 'reserved';
      cached.seatMap[id].columnC = '予約済';
      cached.seatMap[id].columnE = '';
    });
    writeCache(group, day, timeslot, cached);
    // precondition: 予約対象がすべて available であること
    const pre = {};
    (selectedSeats || []).forEach(id => { const s = cached.seatMap[id] || {}; pre[id] = { status: 'available' }; });
    enqueue({ type: 'reserveSeats', args: [group, day, timeslot, selectedSeats], pre });
    return { success: true, message: `オフラインで予約を受け付けました (${(selectedSeats||[]).join(', ')})` };
  };

  GasAPI.checkInMultipleSeats = async (group, day, timeslot, seatIds) => {
    const cached = readCache(group, day, timeslot) || { seatMap: {} };
    (seatIds || []).forEach(id => {
      cached.seatMap[id] = cached.seatMap[id] || { id };
      cached.seatMap[id].status = 'checked-in';
      cached.seatMap[id].columnE = '済';
    });
    writeCache(group, day, timeslot, cached);
    // precondition: 対象が予約済または確保
    const pre = {};
    (seatIds || []).forEach(id => { pre[id] = { status: 'to-be-checked-in' } });
    enqueue({ type: 'checkInMultipleSeats', args: [group, day, timeslot, seatIds], pre });
    return { success: true, message: `${(seatIds||[]).length}件の座席をオフラインでチェックインしました。` };
  };

  GasAPI.updateSeatData = async (group, day, timeslot, seatId, columnC, columnD, columnE) => {
    const cached = readCache(group, day, timeslot) || { seatMap: {} };
    cached.seatMap[seatId] = cached.seatMap[seatId] || { id: seatId };
    if (columnC !== undefined) cached.seatMap[seatId].columnC = columnC;
    if (columnD !== undefined) cached.seatMap[seatId].columnD = columnD;
    if (columnE !== undefined) cached.seatMap[seatId].columnE = columnE;
    // 状態推定
    const c = cached.seatMap[seatId].columnC || '';
    const e = cached.seatMap[seatId].columnE || '';
    let status = 'unavailable';
    if (c === '予約済' && e === '済') status = 'checked-in';
    else if (c === '予約済') status = 'to-be-checked-in';
    else if (c === '確保') status = 'reserved';
    else if (c === '空' || c === '') status = 'available';
    cached.seatMap[seatId].status = status;
    writeCache(group, day, timeslot, cached);
    // precondition: 現在のキャッシュ状態を送る（GAS側で比較）
    const pre = {}; pre[seatId] = { columnC: cached.seatMap[seatId].columnC || '', columnD: cached.seatMap[seatId].columnD || '', columnE: cached.seatMap[seatId].columnE || '' };
    enqueue({ type: 'updateSeatData', args: [group, day, timeslot, seatId, columnC, columnD, columnE], pre });
    return { success: true, message: 'オフラインで座席データを更新しました' };
  };

  GasAPI.__offlineOverridden = true;

  // 初回: 現在ページの座席が未キャッシュなら最低限の雛形を用意
  try {
    const { group, day, timeslot } = readContext();
    if (!readCache(group, day, timeslot)) {
      writeCache(group, day, timeslot, { seatMap: {} });
    }
  } catch (_) {}
}

// ===== 再接続時: キューをサーバーへ反映 =====
async function flushQueue() {
  if (isOffline()) return;
  const queue = readQueue();
  if (!queue.length) return;

  console.log(`[同期開始] ${queue.length}件のオフライン操作を同期します...`);
  
  // 同期中モーダルを表示
  showSyncModal();

  const remaining = [];
  for (const item of queue) {
    try {
      const { type, args } = item;
      console.log(`[同期処理] ${type} を実行中...`, args);
      logSync(`Flush op start: ${type}`);
      let res = null;
      if (type === 'reserveSeats') {
        res = await GasAPI.reserveSeats(...args);
        console.log(`[GAS応答] reserveSeats:`, res);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'reserve failed');
        console.log(`[同期成功] ${type} 完了`);
      } else if (type === 'checkInMultipleSeats') {
        res = await GasAPI.checkInMultipleSeats(...args);
        console.log(`[GAS応答] checkInMultipleSeats:`, res);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'checkin failed');
        console.log(`[同期成功] ${type} 完了`);
      } else if (type === 'updateSeatData') {
        res = await GasAPI.updateSeatData(...args);
        console.log(`[GAS応答] updateSeatData:`, res);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'update failed');
        console.log(`[同期成功] ${type} 完了`);
      } else {
        // 未知タイプは保持
        remaining.push(item);
        console.log(`[同期スキップ] 未知の操作タイプ: ${type}`);
      }
      logSync(`Flush op done: ${type}`);
    } catch (error) {
      // 失敗したものは残す（順序維持）
      console.error(`[同期失敗] ${item.type} でエラー:`, error.message);
      remaining.push(item);
    }
  }
  writeQueue(remaining);

  console.log(`[同期完了] 成功: ${queue.length - remaining.length}件, 失敗: ${remaining.length}件`);

  // 成功した分は最新データを取得してキャッシュ更新
  try { 
    console.log('[同期後] 最新データを取得してキャッシュを更新中...');
    await backgroundSyncCurrentContext(); 
    console.log('[同期後] キャッシュ更新完了');
  } catch (error) {
    console.error('[同期後] キャッシュ更新失敗:', error);
  }

  // 同期完了、モーダルを非表示
  hideSyncModal();
}

// ===== 同期中モーダル制御 =====
function showSyncModal() {
  try {
    // 既存のモーダルがあれば削除
    const existing = document.getElementById('sync-modal');
    if (existing) existing.remove();

    const modalHTML = `
      <div id="sync-modal" class="modal" style="display: block; z-index: 10000;">
        <div class="modal-content" style="text-align: center; max-width: 400px;">
          <div class="spinner"></div>
          <h3>オフライン操作を同期中...</h3>
          <p>しばらくお待ちください。操作はできません。</p>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (_) {}
}

function hideSyncModal() {
  try {
    const modal = document.getElementById('sync-modal');
    if (modal) modal.remove();
  } catch (_) {}
}

// ===== バックグラウンド同期用URLへの同期要求 =====
async function syncToBackgroundUrl(group, day, timeslot, operations) {
  try {
    const backgroundUrl = getBackgroundSyncUrl();
    if (!backgroundUrl || !operations.length) return false;

    const callbackName = 'jsonpCallback_sync_' + Date.now();
    const encodedParams = encodeURIComponent(JSON.stringify([group, day, timeslot, operations]));
    const url = `${backgroundUrl}?callback=${callbackName}&func=syncOfflineOperations&params=${encodedParams}&_=${Date.now()}`;
    logSync(`Request sync to background URL for ${group}-${day}-${timeslot}`, { operations: operations.length });

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      window[callbackName] = (data) => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(data && data.success === true);
        } catch (e) {
          resolve(false);
        }
      };

      script.onerror = () => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        } catch (_) {}
        resolve(false);
      };

      (document.head || document.body).appendChild(script);

      // タイムアウト
      setTimeout(() => {
        try {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        } catch (_) {}
        resolve(false);
      }, 15000);
    });
  } catch (_) {
    return false;
  }
}

// ===== Service Worker 登録（静的資産キャッシュ） =====
function registerServiceWorker() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js');
    }
  } catch (_) {}
}

// ===== イベント =====
function onOnline() {
  // 本体の動作に影響させない
  try {
    console.log('[オンライン復帰] オフライン操作の同期を開始します...');
    
    // 元のGasAPIを自然に使用できるよう、差し替えは解除しない（安全策）。
    // 代わりにキュー反映とバックグラウンド同期のみ行う。
    flushQueue();
    startBackgroundSync();
  } catch (_) {}
}

function onOffline() {
  try {
    console.log('[オフライン検知] オフライン操作モードに切り替えます');
    installOfflineOverrides();
    stopBackgroundSync();
    // オフライン時は一切の通信を行わない（バックグラウンドURL取得も停止）
  } catch (_) {}
}

// ===== 初期化 =====
function __offlineSyncBoot() {
  if (!OFFLINE_FEATURE_ENABLED) return;

  // Service Worker の登録は読み込み完了後に実施
  try { registerServiceWorker(); } catch (_) {}

  // バックグラウンド同期用URLを設定
  if (BACKGROUND_SYNC_URL) {
    setBackgroundSyncUrl(BACKGROUND_SYNC_URL);
  }

  // 初期状態に応じて、バックグラウンドで開始
  if (isOffline()) {
    // オフライン時は差し替えのみ行い、以降はイベントで反応
    try { installOfflineOverrides(); } catch (_) {}
  } else {
    // オンライン時はバックグラウンド同期間隔起動＋一度だけの同期
    try { startBackgroundSync(); } catch (_) {}
    try { setTimeout(backgroundSyncCurrentContext, 0); } catch (_) {}
  }

  // オンライン/オフラインイベントハンドラ（非同期で処理）
  window.addEventListener('online', () => { setTimeout(onOnline, 0); });
  window.addEventListener('offline', () => { setTimeout(onOffline, 0); });
}

// 画面ロード完了後、アイドル時間に初期化（フォールバックあり）
const __scheduleInit = () => {
  const ric = window.requestIdleCallback || function (fn) { return setTimeout(fn, 0); };
  ric(__offlineSyncBoot);
};

if (document.readyState === 'complete') {
  __scheduleInit();
} else {
  window.addEventListener('load', __scheduleInit);
}

// ===== グローバル関数（設定用） =====
window.OfflineSync = {
  setBackgroundSyncUrl: setBackgroundSyncUrl,
  getBackgroundSyncUrl: getBackgroundSyncUrl,
  flushQueue: flushQueue,
  readQueue: readQueue,
  writeQueue: writeQueue,
  showSyncModal: showSyncModal,
  hideSyncModal: hideSyncModal,
  // デバッグ用関数
  testGASConnection: async () => {
    try {
      console.log('[デバッグ] GAS接続テスト開始...');
      const testResult = await GasAPI.testApi();
      console.log('[デバッグ] GAS接続テスト結果:', testResult);
      return testResult;
    } catch (error) {
      console.error('[デバッグ] GAS接続テスト失敗:', error);
      return { success: false, error: error.message };
    }
  },
  // スプレッドシート構造をデバッグ
  debugSpreadsheetStructure: async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const group = params.get('group');
      const day = params.get('day');
      const timeslot = params.get('timeslot');
      if (group && day && timeslot) {
        console.log('[デバッグ] スプレッドシート構造確認開始...', { group, day, timeslot });
        const result = await GasAPI.debugSpreadsheetStructure(group, day, timeslot);
        console.log('[デバッグ] スプレッドシート構造:', result);
        return result;
      }
      return { success: false, error: 'URLパラメータが不足しています' };
    } catch (error) {
      console.error('[デバッグ] スプレッドシート構造確認失敗:', error);
      return { success: false, error: error.message };
    }
  },
  // 現在のキャッシュ状態を表示
  showCacheStatus: () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const group = params.get('group');
      const day = params.get('day');
      const timeslot = params.get('timeslot');
      if (group && day && timeslot) {
        const cache = readCache(group, day, timeslot);
        const queue = readQueue();
        console.log('[キャッシュ状態]', {
          group, day, timeslot,
          cache: cache ? 'あり' : 'なし',
          queueLength: queue.length,
          queue: queue
        });
        return { cache, queue };
      }
      return null;
    } catch (error) {
      console.error('[キャッシュ状態確認失敗]:', error);
      return null;
    }
  }
};


