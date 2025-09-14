@echo off
echo ========================================
echo 監査ログサーバー起動スクリプト
echo ========================================

cd /d "%~dp0"

echo 依存関係をインストール中...
call npm install

if %errorlevel% neq 0 (
    echo エラー: 依存関係のインストールに失敗しました
    pause
    exit /b 1
)

echo データベースを初期化中...
call npm run init-db

if %errorlevel% neq 0 (
    echo エラー: データベースの初期化に失敗しました
    pause
    exit /b 1
)

echo サーバーを起動中...
echo 監視ダッシュボード: http://localhost:3000/monitor.html
echo サーバーを停止するには Ctrl+C を押してください
echo.

call npm start

pause
