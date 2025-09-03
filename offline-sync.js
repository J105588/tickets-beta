// offline-sync.js
// 完全に独立したオフライン同期モジュール（本体に影響しないよう防御的に動作）
// 役割:
// - オンライン時: 座席データをローカルに定期同期（バックグラウンド）
// - オフライン検知時: GasAPIの主要メソッドを安全に差し替え、ローカルデータで動作・更新はキューに保存
// - 再接続時: キューを順次サーバーへ反映

import GasAPI from './api.js';

// ===== 設定 =====
const OFFLINE_FEATURE_ENABLED = true; // 必要なら遠隔で切替可能に
const SYNC_INTERVAL_MS = 60 * 1000; // バックグラウンド同期間隔（1分）
const STORAGE_PREFIX = 'offlineSeats'; // localStorage キー接頭辞
const QUEUE_KEY = `${STORAGE_PREFIX}:pendingQueue`;
const META_KEY = `${STORAGE_PREFIX}:meta`;

// ===== ユーティリティ =====
function getKey(group, day, timeslot) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(group)}:${encodeURIComponent(day)}:${encodeURIComponent(timeslot)}`;
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch (_) { return fallback; }
}

function readCache(group, day, timeslot) {
  const raw = localStorage.getItem(getKey(group, day, timeslot));
  return safeParse(raw, null);
}

function writeCache(group, day, timeslot, data) {
  try {
    localStorage.setItem(getKey(group, day, timeslot), JSON.stringify({
      success: true,
      seatMap: data && data.seatMap ? data.seatMap : data,
      cachedAt: Date.now()
    }));
    const meta = safeParse(localStorage.getItem(META_KEY), {});
    meta.lastCachedAt = Date.now();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (_) {}
}

function readQueue() {
  return safeParse(localStorage.getItem(QUEUE_KEY), []);
}

function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || [])); } catch (_) {}
}

function enqueue(operation) {
  const q = readQueue();
  q.push({ ...operation, enqueuedAt: Date.now() });
  writeQueue(q);
}

function isOffline() {
  try { return !navigator.onLine; } catch (_) { return false; }
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
    const minimal = await GasAPI.getSeatDataMinimal(group, day, timeslot, false);
    if (minimal && minimal.seatMap) {
      writeCache(group, day, timeslot, minimal);
    }
  } catch (_) {
    // 失敗しても本体に影響しない
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
    enqueue({ type: 'reserveSeats', args: [group, day, timeslot, selectedSeats] });
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
    enqueue({ type: 'checkInMultipleSeats', args: [group, day, timeslot, seatIds] });
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
    enqueue({ type: 'updateSeatData', args: [group, day, timeslot, seatId, columnC, columnD, columnE] });
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

  const remaining = [];
  for (const item of queue) {
    try {
      const { type, args } = item;
      if (type === 'reserveSeats') {
        const res = await GasAPI.reserveSeats(...args);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'reserve failed');
      } else if (type === 'checkInMultipleSeats') {
        const res = await GasAPI.checkInMultipleSeats(...args);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'checkin failed');
      } else if (type === 'updateSeatData') {
        const res = await GasAPI.updateSeatData(...args);
        if (!res || res.success === false) throw new Error(res && (res.error || res.message) || 'update failed');
      } else {
        // 未知タイプは保持
        remaining.push(item);
      }
    } catch (_) {
      // 失敗したものは残す（順序維持）
      remaining.push(item);
    }
  }
  writeQueue(remaining);

  // 成功した分は最新データを取得してキャッシュ更新
  try { await backgroundSyncCurrentContext(); } catch (_) {}
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
    // 元のGasAPIを自然に使用できるよう、差し替えは解除しない（安全策）。
    // 代わりにキュー反映とバックグラウンド同期のみ行う。
    flushQueue();
    startBackgroundSync();
  } catch (_) {}
}

function onOffline() {
  try {
    installOfflineOverrides();
    stopBackgroundSync();
  } catch (_) {}
}

// ===== 初期化 =====
(function init() {
  if (!OFFLINE_FEATURE_ENABLED) return;
  registerServiceWorker();

  if (isOffline()) {
    installOfflineOverrides();
  } else {
    startBackgroundSync();
    // 起動時に一度同期
    backgroundSyncCurrentContext();
  }

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
})();


