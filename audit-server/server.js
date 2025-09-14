// server.js
// 監査ログ中央サーバー - GASを使わない完全再設計版

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const app = express();
const server = http.createServer(app);

// WebSocketサーバー
const wss = new WebSocket.Server({ server });

// データベース接続
const dbPath = path.join(__dirname, 'audit_logs.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err.message);
    process.exit(1);
  }
  console.log('✅ データベースに接続しました:', dbPath);
});

// ミドルウェア設定
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// 接続中のクライアント管理
const connectedClients = new Map();

// WebSocket接続処理
wss.on('connection', (ws, req) => {
  const clientId = generateClientId();
  const clientInfo = {
    id: clientId,
    ws: ws,
    deviceId: null,
    deviceName: null,
    connectedAt: new Date(),
    lastPing: Date.now()
  };
  
  connectedClients.set(clientId, clientInfo);
  console.log(`🔌 クライアント接続: ${clientId} (総接続数: ${connectedClients.size})`);

  // デバイス登録
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(clientId, data);
    } catch (error) {
      console.error('WebSocketメッセージ解析エラー:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // 接続切断処理
  ws.on('close', () => {
    const client = connectedClients.get(clientId);
    if (client && client.deviceId) {
      updateDeviceStatus(client.deviceId, false);
    }
    connectedClients.delete(clientId);
    console.log(`🔌 クライアント切断: ${clientId} (残り接続数: ${connectedClients.size})`);
  });

  // エラー処理
  ws.on('error', (error) => {
    console.error(`WebSocketエラー (${clientId}):`, error);
    connectedClients.delete(clientId);
  });

  // 接続確認
  ws.send(JSON.stringify({ type: 'connected', clientId: clientId }));
});

// WebSocketメッセージ処理
function handleWebSocketMessage(clientId, data) {
  const client = connectedClients.get(clientId);
  if (!client) return;

  switch (data.type) {
    case 'register_device':
      client.deviceId = data.deviceId;
      client.deviceName = data.deviceName;
      registerDevice(data);
      break;
    
    case 'log_entry':
      saveLogEntry(data.log);
      broadcastLogEntry(data.log);
      break;
    
    case 'ping':
      client.lastPing = Date.now();
      client.ws.send(JSON.stringify({ type: 'pong' }));
      break;
    
    default:
      console.log('未知のメッセージタイプ:', data.type);
  }
}

// デバイス登録
function registerDevice(data) {
  const { deviceId, deviceName, userAgent, ipAddress } = data;
  
  db.run(`
    INSERT OR REPLACE INTO devices (device_id, device_name, last_seen, user_agent, ip_address, is_online, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, 1, CURRENT_TIMESTAMP)
  `, [deviceId, deviceName, userAgent, ipAddress], (err) => {
    if (err) {
      console.error('デバイス登録エラー:', err);
    } else {
      console.log(`📱 デバイス登録: ${deviceName} (${deviceId})`);
    }
  });
}

// ログエントリ保存
function saveLogEntry(log) {
  const {
    logId, timestamp, deviceId, deviceName, operation, spreadsheetId,
    groupName, day, timeslot, mode, isDemo, demoGroup, userAgent,
    url, deviceInfo, details, beforeData, afterData, error, stackTrace, ipAddress
  } = log;

  db.run(`
    INSERT INTO audit_logs (
      log_id, timestamp, device_id, device_name, operation, spreadsheet_id,
      group_name, day, timeslot, mode, is_demo, demo_group, user_agent,
      url, device_info, details, before_data, after_data, error, stack_trace, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    logId, timestamp, deviceId, deviceName, operation, spreadsheetId,
    groupName, day, timeslot, mode, isDemo, demoGroup, userAgent,
    url, deviceInfo, JSON.stringify(details), 
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null,
    error, stackTrace, ipAddress
  ], (err) => {
    if (err) {
      console.error('ログ保存エラー:', err);
    } else {
      console.log(`📝 ログ保存: ${operation} (${deviceName})`);
      updateStatistics(deviceId, operation, error ? 1 : 0);
    }
  });
}

// ログエントリを全クライアントにブロードキャスト
function broadcastLogEntry(log) {
  const message = JSON.stringify({ type: 'new_log', log: log });
  connectedClients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

// 統計更新
function updateStatistics(deviceId, operation, errorCount) {
  const today = new Date().toISOString().split('T')[0];
  
  db.run(`
    INSERT OR REPLACE INTO statistics (date, device_id, operation, count, error_count, updated_at)
    VALUES (?, ?, ?, COALESCE((SELECT count FROM statistics WHERE date = ? AND device_id = ? AND operation = ?), 0) + 1,
            COALESCE((SELECT error_count FROM statistics WHERE date = ? AND device_id = ? AND operation = ?), 0) + ?,
            CURRENT_TIMESTAMP)
  `, [today, deviceId, operation, today, deviceId, operation, today, deviceId, operation, errorCount]);
}

// デバイスステータス更新
function updateDeviceStatus(deviceId, isOnline) {
  db.run(`
    UPDATE devices SET is_online = ?, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE device_id = ?
  `, [isOnline ? 1 : 0, deviceId]);
}

// REST API エンドポイント

// ログ取得
app.get('/api/logs', (req, res) => {
  const { 
    deviceId, operation, startDate, endDate, limit = 100, offset = 0 
  } = req.query;
  
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  
  if (deviceId) {
    query += ' AND device_id = ?';
    params.push(deviceId);
  }
  
  if (operation) {
    query += ' AND operation = ?';
    params.push(operation);
  }
  
  if (startDate) {
    query += ' AND timestamp >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    query += ' AND timestamp <= ?';
    params.push(endDate);
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('ログ取得エラー:', err);
      res.status(500).json({ error: 'ログ取得に失敗しました' });
    } else {
      res.json({ logs: rows, total: rows.length });
    }
  });
});

// デバイス一覧取得
app.get('/api/devices', (req, res) => {
  db.all('SELECT * FROM devices ORDER BY last_seen DESC', (err, rows) => {
    if (err) {
      console.error('デバイス取得エラー:', err);
      res.status(500).json({ error: 'デバイス取得に失敗しました' });
    } else {
      res.json({ devices: rows });
    }
  });
});

// 統計取得
app.get('/api/statistics', (req, res) => {
  const { date, deviceId } = req.query;
  
  let query = 'SELECT * FROM statistics WHERE 1=1';
  const params = [];
  
  if (date) {
    query += ' AND date = ?';
    params.push(date);
  }
  
  if (deviceId) {
    query += ' AND device_id = ?';
    params.push(deviceId);
  }
  
  query += ' ORDER BY date DESC, count DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('統計取得エラー:', err);
      res.status(500).json({ error: '統計取得に失敗しました' });
    } else {
      res.json({ statistics: rows });
    }
  });
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size,
    database: 'connected'
  });
});

// ユーティリティ関数
function generateClientId() {
  return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 定期的なクリーンアップ（5分間隔）
setInterval(() => {
  const now = Date.now();
  connectedClients.forEach((client, clientId) => {
    if (now - client.lastPing > 30000) { // 30秒間pingがない場合
      console.log(`🔌 タイムアウトでクライアント切断: ${clientId}`);
      if (client.deviceId) {
        updateDeviceStatus(client.deviceId, false);
      }
      client.ws.terminate();
      connectedClients.delete(clientId);
    }
  });
}, 30000);

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 監査ログサーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📊 監視ダッシュボード: http://localhost:${PORT}/monitor.html`);
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('🛑 サーバーをシャットダウンしています...');
  server.close(() => {
    db.close(() => {
      console.log('✅ サーバーが正常にシャットダウンしました');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 サーバーをシャットダウンしています...');
  server.close(() => {
    db.close(() => {
      console.log('✅ サーバーが正常にシャットダウンしました');
      process.exit(0);
    });
  });
});
