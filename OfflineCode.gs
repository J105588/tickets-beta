// ===============================================================
// === Offline 用 APIルーター (独立GASプロジェクト向け) ===
// 本体 Code.gs と同一の API 面を提供するが、ファイル名上で区別
// SpreadsheetIds/TimeSlotConfig も Offline* を使用（同プロジェクト内配置前提）
// ===============================================================

function doPost(e) {
  let response; const callback = e.parameter.callback;
  if (e.method === 'OPTIONS') {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' };
    return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT).setHeaders(headers);
  }
  try {
    const body = e.postData.contents;
    const params = {}; body.split('&').forEach(pair => { const [k, v] = pair.split('='); params[k] = JSON.parse(decodeURIComponent((v||'').replace(/\+/g, ' '))); });
    const funcName = params.func; const funcParams = params.params || [];
    if (!funcName) throw new Error('func が必要です');
    const map = getFunctionMap();
    if (map[funcName]) response = map[funcName].apply(null, funcParams); else throw new Error('無効な関数名: ' + funcName);
  } catch (err) { response = { success: false, error: err.message }; }
  const output = callback + '(' + JSON.stringify(response) + ')';
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doGet(e) {
  let response; const callback = e.parameter.callback;
  try {
    const funcName = e.parameter.func; const paramsStr = e.parameter.params;
    if (!funcName) {
      response = { status: 'OK', message: 'Offline Seat API', version: '2.0', optimized: true };
    } else {
      const funcParams = paramsStr ? JSON.parse(decodeURIComponent(paramsStr)) : [];
      const map = getFunctionMap();
      if (map[funcName]) response = map[funcName].apply(null, funcParams); else throw new Error('無効な関数名: ' + funcName);
    }
  } catch (err) { response = { success: false, error: err.message }; }
  const output = callback + '(' + JSON.stringify(response) + ')';
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getFunctionMap() {
  return {
    'getSeatData': getSeatData,
    'getSeatDataMinimal': getSeatDataMinimal,
    'reserveSeats': reserveSeats,
    'checkInSeat': checkInSeat,
    'checkInMultipleSeats': checkInMultipleSeats,
    'assignWalkInSeat': assignWalkInSeat,
    'assignWalkInSeats': assignWalkInSeats,
    'assignWalkInConsecutiveSeats': assignWalkInConsecutiveSeats,
    'verifyModePassword': verifyModePassword,
    'updateSeatData': updateSeatData,
    'updateMultipleSeats': updateMultipleSeats,
    'getAllTimeslotsForGroup': getAllTimeslotsForGroup,
    'testApi': testApi,
    'reportError': reportError,
    'getSystemLock': getSystemLock,
    'setSystemLock': setSystemLock,
    'execDangerCommand': execDangerCommand,
    'syncOfflineOperations': syncOfflineOperations
  };
}

// 以下、ビジネスロジックは本体 Code.gs と同等（必要に応じて最適化）
// 依存: OfflineSpreadsheetIds.gs の getSeatSheetId など

function getSeatData(group, day, timeslot, isAdmin, isSuperAdmin) {
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const lastRow = sheet.getLastRow(); if (lastRow <= 1) return { success: true, seatMap: {} };
    const data = sheet.getRange('A2:E' + lastRow).getValues();
    const seatMap = {};
    data.forEach(row => {
      const rowLabel = row[0]; const colLabel = row[1]; if (!rowLabel || !colLabel) return;
      const seatId = String(rowLabel) + String(colLabel); if (!isValidSeatId(seatId)) return;
      const statusC = (row[2] || '').toString().trim();
      const nameD = (row[3] || '').toString();
      const statusE = (row[4] || '').toString().trim();
      const seat = { id: seatId, status: 'available', columnC: statusC, columnD: nameD, columnE: statusE };
      if (statusC === '予約済' && statusE === '済') seat.status = 'checked-in';
      else if (statusC === '予約済') seat.status = 'to-be-checked-in';
      else if (statusC === '確保') seat.status = 'reserved';
      else if (statusC === '空' || statusC === '') seat.status = 'available';
      else seat.status = 'unavailable';
      if (isAdmin || isSuperAdmin) seat.name = nameD || null;
      seatMap[seatId] = seat;
    });
    return { success: true, seatMap: seatMap };
  } catch (e) { return { success: false, error: e.message }; }
}

function getSeatDataMinimal(group, day, timeslot, isAdmin) {
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const lastRow = sheet.getLastRow(); if (lastRow <= 1) return { success: true, seatMap: {} };
    const data = sheet.getRange('A2:E' + lastRow).getValues();
    const seatMap = {};
    data.forEach(row => {
      const rowLabel = row[0]; const colLabel = row[1]; if (!rowLabel || !colLabel) return;
      const seatId = String(rowLabel) + String(colLabel); if (!isValidSeatId(seatId)) return;
      const statusC = (row[2] || '').toString().trim();
      const statusE = (row[4] || '').toString().trim();
      let status = 'available';
      if (statusC === '予約済' && statusE === '済') status = 'checked-in';
      else if (statusC === '予約済') status = 'to-be-checked-in';
      else if (statusC === '確保') status = 'reserved';
      else if (statusC === '空' || statusC === '') status = 'available';
      else status = 'unavailable';
      seatMap[seatId] = { id: seatId, status };
    });
    return { success: true, seatMap };
  } catch (e) { return { success: false, error: e.message }; }
}

function reserveSeats(group, day, timeslot, selectedSeats, pre) {
  if (!Array.isArray(selectedSeats) || !selectedSeats.length) return { success: false, message: '予約する座席が選択されていません。' };
  const invalid = selectedSeats.filter(id => !isValidSeatId(id)); if (invalid.length) return { success: false, message: `無効な座席ID: ${invalid.join(', ')}` };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return { success: false, message: '混み合っています。時間をおいて再試行してください。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:C' + sheet.getLastRow()).getValues();
    const updates = [];
    for (let i = 0; i < data.length; i++) {
      const seatId = String(data[i][0]) + String(data[i][1]);
      if (!isValidSeatId(seatId)) continue;
      if (selectedSeats.includes(seatId)) {
        // 競合検出: pre に available 前提がある場合は現在値と比較
        if (pre && pre[seatId] && pre[seatId].status === 'available' && data[i][2] !== '空') {
          throw new Error(`競合: ${seatId} は既に変化しています。`);
        }
        if (data[i][2] !== '空') throw new Error(`座席 ${seatId} は既に予約されています。`);
        updates.push({ row: i + 2, values: ['予約済', '', ''] });
      }
    }
    updates.forEach(u => sheet.getRange(u.row, 3, 1, 3).setValues([u.values]));
    SpreadsheetApp.flush();
    return { success: true, message: `予約が完了しました。座席: ${selectedSeats.join(', ')}` };
  } catch (e) { return { success: false, message: '予約エラー: ' + e.message }; } finally { lock.releaseLock(); }
}

function checkInSeat(group, day, timeslot, seatId) {
  if (!seatId || !isValidSeatId(seatId)) return { success: false, message: `無効な座席ID: ${seatId}` };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { success: false, message: '処理が混み合っています。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:D' + sheet.getLastRow()).getValues();
    for (let i = 0; i < data.length; i++) {
      const currentSeatId = String(data[i][0]) + String(data[i][1]);
      if (currentSeatId === seatId) {
        const status = data[i][2]; const name = data[i][3] || '';
        if (status === '予約済') { sheet.getRange(i + 2, 5).setValue('済'); SpreadsheetApp.flush(); return { success: true, message: `${seatId} をチェックインしました。`, checkedInName: name }; }
        throw new Error(`${seatId} はチェックインできない状態です。（現在の状態: ${status}）`);
      }
    }
    throw new Error(`${seatId} が見つかりません。`);
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function checkInMultipleSeats(group, day, timeslot, seatIds, pre) {
  if (!Array.isArray(seatIds) || !seatIds.length) return { success: false, message: 'チェックインする座席が選択されていません。' };
  const invalid = seatIds.filter(id => !isValidSeatId(id)); if (invalid.length) return { success: false, message: `無効な座席ID: ${invalid.join(', ')}` };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return { success: false, message: '処理が混み合っています。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:C' + sheet.getLastRow()).getValues();
    const updates = [];
    let successCount = 0; let errors = [];
    for (const seatId of seatIds) {
      let found = false;
      for (let i = 0; i < data.length; i++) {
        const currentSeatId = String(data[i][0]) + String(data[i][1]);
        if (currentSeatId === seatId) {
          found = true; const status = data[i][2];
          if (pre && pre[seatId] && pre[seatId].status === 'to-be-checked-in' && !(status === '予約済' || status === '確保')) {
            errors.push(`競合: ${seatId} の状態が変化しています（現在: ${status}）`);
          } else if (status === '予約済' || status === '確保') {
            if (status === '確保') updates.push({ row: i + 2, col: 3, value: '予約済' });
            updates.push({ row: i + 2, col: 5, value: '済' });
            successCount++;
          } else {
            errors.push(`${seatId} はチェックインできません（状態: ${status}）`);
          }
          break;
        }
      }
      if (!found) errors.push(`${seatId} が見つかりません。`);
    }
    updates.forEach(u => sheet.getRange(u.row, u.col).setValue(u.value));
    SpreadsheetApp.flush();
    if (successCount > 0) return { success: true, message: `${successCount}件の座席をチェックインしました。`, checkedInCount: successCount };
    return { success: false, message: errors.length ? errors.join('\n') : 'チェックインできる座席がありません。' };
  } catch (e) { return { success: false, message: 'チェックインエラー: ' + e.message }; } finally { lock.releaseLock(); }
}

function assignWalkInSeat(group, day, timeslot) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return { success: false, message: '処理が混み合っています。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:C' + sheet.getLastRow()).getValues();
    for (let i = 0; i < data.length; i++) {
      const seatId = String(data[i][0]) + String(data[i][1]); if (!isValidSeatId(seatId)) continue;
      if (data[i][2] === '空') {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
        sheet.getRange(i + 2, 3, 1, 3).setValues([[ '予約済', `当日券_${timestamp}`, '' ]]);
        SpreadsheetApp.flush();
        return { success: true, message: `当日券を発行しました！\n\nあなたの座席は 【${seatId}】 です。`, seatId };
      }
    }
    return { success: false, message: '申し訳ありません、この回の座席は現在満席です。' };
  } catch (e) { return { success: false, message: 'エラー: ' + e.message }; } finally { lock.releaseLock(); }
}

function assignWalkInSeats(group, day, timeslot, count) {
  if (!count || count < 1 || count > 6) return { success: false, message: '有効な枚数を指定してください（1〜6枚）' };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(7000)) return { success: false, message: '処理が混み合っています。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:C' + sheet.getLastRow()).getValues();
    const assignedSeats = []; const updatedRows = [];
    for (let i = 0; i < data.length && assignedSeats.length < count; i++) {
      const seatId = String(data[i][0]) + String(data[i][1]); if (!isValidSeatId(seatId)) continue;
      if (data[i][2] === '空') {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
        updatedRows.push({ row: i + 2, values: [ '予約済', `当日券_${timestamp}`, '' ] });
        assignedSeats.push(seatId);
      }
    }
    // 連続ブロックごとにまとめて更新
    let runStart = 0; while (runStart < updatedRows.length) {
      let runEnd = runStart; while (runEnd + 1 < updatedRows.length && updatedRows[runEnd + 1].row === updatedRows[runEnd].row + 1) runEnd++;
      const block = updatedRows.slice(runStart, runEnd + 1); const startRow = block[0].row; const values = block.map(b => b.values);
      sheet.getRange(startRow, 3, values.length, 3).setValues(values); runStart = runEnd + 1;
    }
    SpreadsheetApp.flush();
    if (assignedSeats.length > 0) return { success: true, message: `当日券を${assignedSeats.length}枚発行しました！\n\n座席: ${assignedSeats.join(', ')}`, seatIds: assignedSeats };
    return { success: false, message: '申し訳ありません、この回の座席は現在満席です。' };
  } catch (e) { return { success: false, message: 'エラー: ' + e.message }; } finally { lock.releaseLock(); }
}

function assignWalkInConsecutiveSeats(group, day, timeslot, count) {
  if (!count || count < 1 || count > 12) return { success: false, message: '有効な枚数を指定してください（1〜12枚）' };
  const lock = LockService.getScriptLock(); if (!lock.tryLock(7000)) return { success: false, message: '処理が混み合っています。' };
  try {
    const sheet = getSheet(group, day, timeslot, 'SEAT');
    const data = sheet.getRange('A2:C' + sheet.getLastRow()).getValues();
    const rowToAvailable = { 'A': [], 'B': [], 'C': [], 'D': [], 'E': [] }; const rowColToIndex = {};
    for (let i = 0; i < data.length; i++) {
      const r = String(data[i][0]); const c = parseInt(data[i][1], 10); const status = data[i][2];
      if (!rowToAvailable.hasOwnProperty(r)) continue; const id = r + c; if (!isValidSeatId(id)) continue;
      rowColToIndex[id] = i; if (status === '空') rowToAvailable[r].push(c);
    }
    Object.keys(rowToAvailable).forEach(r => rowToAvailable[r].sort((a,b)=>a-b));
    const findConsec = (arr, need) => { if (arr.length < need) return null; let s = 0; for (let i = 1; i <= arr.length; i++) { if (i === arr.length || arr[i] !== arr[i-1] + 1) { const len = i - s; if (len >= need) return arr.slice(s, s + need); s = i; } } return null; };
    let assigned = null; let assignedRow = null; for (const rowLabel of ['A','B','C','D','E']) { const seq = findConsec(rowToAvailable[rowLabel], count); if (seq) { assigned = seq; assignedRow = rowLabel; break; } }
    if (!assigned) return { success: false, message: '指定枚数の連続席が見つかりませんでした。' };
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
    const rows = assigned.map(colNum => rowColToIndex[assignedRow + colNum] + 2).sort((a,b)=>a-b);
    const values = assigned.map(() => ['予約済', `当日券_${timestamp}`, '']);
    sheet.getRange(rows[0], 3, values.length, 3).setValues(values); SpreadsheetApp.flush();
    const seatIds = assigned.map(c => assignedRow + c);
    return { success: true, message: `連続席(${count}席)を確保しました。\n座席: ${seatIds.join(', ')}`, seatIds };
  } catch (e) { return { success: false, message: 'エラー: ' + e.message }; } finally { lock.releaseLock(); }
}

function verifyModePassword(mode, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const adminPassword = props.getProperty('ADMIN_PASSWORD');
    const walkinPassword = props.getProperty('WALKIN_PASSWORD');
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (mode === 'admin') return { success: adminPassword && password === adminPassword };
    if (mode === 'walkin') return { success: walkinPassword && password === walkinPassword };
    if (mode === 'superadmin') return { success: superAdminPassword && password === superAdminPassword };
    return { success: false };
  } catch (e) { return { success: false }; }
}

function updateSeatData(group, day, timeslot, seatId, columnC, columnD, columnE, pre) {
  try {
    const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { success: false, message: '混み合っています。' };
    try {
      const sheet = getSheet(group, day, timeslot, 'SEAT'); if (!sheet) return { success: false, message: 'シートが見つかりません' };
      const data = sheet.getDataRange().getValues();
      const m = seatId.match(/^([A-E])(\d+)$/); if (!m) return { success: false, message: '無効な座席IDです' };
      const rowLabel = m[1]; const colLabel = m[2];
      let targetRow = -1; for (let i = 0; i < data.length; i++) { if (data[i][0] === rowLabel && String(data[i][1]) === colLabel) { targetRow = i + 1; break; } }
      if (targetRow === -1) return { success: false, message: '指定された座席が見つかりません' };
      // 競合検出: pre に C/D/E の期待値がある場合は現在値と比較
      if (pre && pre[seatId]) {
        const curC = (sheet.getRange(targetRow, 3).getValue() + '').trim();
        const curD = (sheet.getRange(targetRow, 4).getValue() + '').trim();
        const curE = (sheet.getRange(targetRow, 5).getValue() + '').trim();
        const exp = pre[seatId];
        if ((exp.columnC !== undefined && (exp.columnC + '') !== curC) || (exp.columnD !== undefined && (exp.columnD + '') !== curD) || (exp.columnE !== undefined && (exp.columnE + '') !== curE)) {
          return { success: false, message: '競合が発生しました。最新の座席データを取得してから再実行してください。', conflict: true, current: { columnC: curC, columnD: curD, columnE: curE } };
        }
      }
      if (columnC !== undefined) sheet.getRange(targetRow, 3).setValue(columnC);
      if (columnD !== undefined) sheet.getRange(targetRow, 4).setValue(columnD);
      if (columnE !== undefined) sheet.getRange(targetRow, 5).setValue(columnE);
      return { success: true, message: '座席データを更新しました' };
    } finally { lock.releaseLock(); }
  } catch (e) { return { success: false, message: 'エラー: ' + e.message }; }
}

function isValidSeatId(seatId) {
  if (!seatId || typeof seatId !== 'string') return false;
  const m = seatId.match(/^([A-E])(\d+)$/); if (!m) return false;
  const row = m[1]; const col = parseInt(m[2], 10);
  const maxSeats = { 'A': 12, 'B': 12, 'C': 12, 'D': 12, 'E': 6 };
  return col >= 1 && col <= (maxSeats[row] || 0);
}

function getSheet(group, day, timeslot, type) {
  const ssId = getSeatSheetId(group, day, timeslot);
  const sheetName = (type === 'SEAT') ? TARGET_SEAT_SHEET_NAME : LOG_SHEET_NAME;
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return sheet;
}

function getAllTimeslotsForGroup(group) { return _getAllTimeslotsForGroup(group); }

function testApi() {
  return { success: true, data: { ping: 'OK' } };
}

function reportError(errorMessage) { Logger.log('Client error: ' + errorMessage); return { success: true }; }

function getSystemLock() {
  try {
    const props = PropertiesService.getScriptProperties();
    const locked = props.getProperty('SYSTEM_LOCKED') === 'true';
    const lockedAt = props.getProperty('SYSTEM_LOCKED_AT') || null;
    return { success: true, locked, lockedAt };
  } catch (e) { return { success: false, error: e.message }; }
}

function setSystemLock(shouldLock, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) return { success: false, message: '認証に失敗しました' };
    if (shouldLock === true) { props.setProperty('SYSTEM_LOCKED', 'true'); props.setProperty('SYSTEM_LOCKED_AT', new Date().toISOString()); }
    else { props.setProperty('SYSTEM_LOCKED', 'false'); props.deleteProperty('SYSTEM_LOCKED_AT'); }
    return { success: true, locked: shouldLock === true };
  } catch (e) { return { success: false, error: e.message }; }
}

function initiateDangerCommand(action, payload, expireSeconds) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = Utilities.getUuid(); const now = Date.now(); const ttl = Math.max(30, Math.min(600, parseInt(expireSeconds || 120, 10))) * 1000;
    const rec = { token, action, payload: payload || {}, confirmations: [], createdAt: now, expiresAt: now + ttl };
    props.setProperty('DANGER_CMD_' + token, JSON.stringify(rec));
    return { success: true, token, expiresAt: new Date(rec.expiresAt).toISOString() };
  } catch (e) { return { success: false, message: e.message }; }
}

function confirmDangerCommand(token, password, confirmerId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) return { success: false, message: '認証に失敗しました' };
    const key = 'DANGER_CMD_' + token; const raw = props.getProperty(key); if (!raw) return { success: false, message: 'トークンが無効または期限切れです' };
    const rec = JSON.parse(raw); const now = Date.now(); if (now > rec.expiresAt) { props.deleteProperty(key); return { success: false, message: 'トークンが期限切れです' }; }
    const id = (confirmerId || '') + ''; if (id) { if (!rec.confirmations.includes(id)) rec.confirmations.push(id); } else { rec.confirmations.push(Utilities.getUuid()); }
    const required = 2; if (rec.confirmations.length >= required) { const result = performDangerAction(rec.action, rec.payload); props.deleteProperty(key); return { success: true, executed: true, result }; }
    props.setProperty(key, JSON.stringify(rec)); return { success: true, executed: false, pending: required - rec.confirmations.length };
  } catch (e) { return { success: false, message: e.message }; }
}

function listDangerPending() {
  try {
    const props = PropertiesService.getScriptProperties(); const all = props.getProperties(); const now = Date.now(); const items = [];
    Object.keys(all).forEach(k => { if (k.indexOf('DANGER_CMD_') === 0) { try { const rec = JSON.parse(all[k]); if (rec && now <= rec.expiresAt) items.push({ token: rec.token, action: rec.action, confirmations: (rec.confirmations||[]).length, expiresAt: new Date(rec.expiresAt).toISOString() }); } catch (_) {} } });
    return { success: true, items };
  } catch (e) { return { success: false, message: e.message }; }
}

function performDangerAction(action, payload) {
  if (action === 'purgeReservationsForShow') {
    const group = payload && payload.group; const day = payload && payload.day; const timeslot = payload && payload.timeslot;
    const sheet = getSheet(group, day, timeslot, 'SEAT'); const lastRow = sheet.getLastRow(); if (lastRow <= 1) return { success: true, message: '対象座席なし' };
    const numRows = lastRow - 1; const values = new Array(numRows).fill(0).map(() => ['空', '', '']);
    sheet.getRange(2, 3, numRows, 3).setValues(values); SpreadsheetApp.flush();
    return { success: true, message: '該当公演の予約・チェックイン情報を初期化しました' };
  }
  return { success: false, message: '未知のアクション: ' + action };
}

function execDangerCommand(action, payload, password) {
  try {
    const props = PropertiesService.getScriptProperties(); const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) return { success: false, message: '認証に失敗しました' };
    return performDangerAction(action, payload || {});
  } catch (e) { return { success: false, message: e.message }; }
}

// ===== オフライン操作の同期機能 =====
function syncOfflineOperations(group, day, timeslot, operations) {
  try {
    if (!Array.isArray(operations) || operations.length === 0) {
      return { success: false, message: '同期する操作がありません' };
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return { success: false, message: '処理が混み合っています。しばらく時間をおいてから再度お試しください。' };
    }

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const operation of operations) {
        try {
          const { type, args } = operation;
          let result = null;

          if (type === 'reserveSeats') {
            result = reserveSeats(...args);
          } else if (type === 'checkInMultipleSeats') {
            result = checkInMultipleSeats(...args);
          } else if (type === 'updateSeatData') {
            result = updateSeatData(...args);
          } else {
            errors.push(`未知の操作タイプ: ${type}`);
            errorCount++;
            continue;
          }

          if (result && result.success) {
            successCount++;
          } else {
            errors.push(`${type}: ${result ? result.message || result.error : '不明なエラー'}`);
            errorCount++;
          }
        } catch (e) {
          errors.push(`${operation.type}: ${e.message}`);
          errorCount++;
        }
      }

      return {
        success: errorCount === 0,
        message: `${successCount}件の操作を同期しました${errorCount > 0 ? `（${errorCount}件失敗）` : ''}`,
        successCount: successCount,
        errorCount: errorCount,
        errors: errors
      };

    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { success: false, message: `同期エラー: ${e.message}` };
  }
}


