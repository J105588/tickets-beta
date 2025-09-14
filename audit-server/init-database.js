// init-database.js
// 監査ログデータベースの初期化スクリプト

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'audit_logs.db');

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
    process.exit(1);
  }
  console.log('✅ データベースに接続しました:', dbPath);
});

// テーブル作成
db.serialize(() => {
  // 監査ログテーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id TEXT UNIQUE NOT NULL,
      timestamp DATETIME NOT NULL,
      device_id TEXT NOT NULL,
      device_name TEXT,
      operation TEXT NOT NULL,
      spreadsheet_id TEXT,
      group_name TEXT,
      day TEXT,
      timeslot TEXT,
      mode TEXT,
      is_demo BOOLEAN DEFAULT 0,
      demo_group TEXT,
      user_agent TEXT,
      url TEXT,
      device_info TEXT,
      details TEXT,
      before_data TEXT,
      after_data TEXT,
      error TEXT,
      stack_trace TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('audit_logsテーブル作成エラー:', err.message);
    } else {
      console.log('✅ audit_logsテーブルを作成しました');
    }
  });

  // デバイス管理テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      device_name TEXT,
      last_seen DATETIME,
      user_agent TEXT,
      ip_address TEXT,
      is_online BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('devicesテーブル作成エラー:', err.message);
    } else {
      console.log('✅ devicesテーブルを作成しました');
    }
  });

  // 統計テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      device_id TEXT,
      operation TEXT,
      count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, device_id, operation)
    )
  `, (err) => {
    if (err) {
      console.error('statisticsテーブル作成エラー:', err.message);
    } else {
      console.log('✅ statisticsテーブルを作成しました');
    }
  });

  // インデックス作成
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_device_id ON audit_logs(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_spreadsheet_id ON audit_logs(spreadsheet_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics(date)`);

  console.log('✅ インデックスを作成しました');
});

// データベース接続を閉じる
db.close((err) => {
  if (err) {
    console.error('データベース接続クローズエラー:', err.message);
  } else {
    console.log('✅ データベース初期化が完了しました');
  }
});
