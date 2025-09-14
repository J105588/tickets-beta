#!/bin/bash

echo "========================================"
echo "監査ログサーバー起動スクリプト"
echo "========================================"

# スクリプトのディレクトリに移動
cd "$(dirname "$0")"

echo "依存関係をインストール中..."
npm install

if [ $? -ne 0 ]; then
    echo "エラー: 依存関係のインストールに失敗しました"
    exit 1
fi

echo "データベースを初期化中..."
npm run init-db

if [ $? -ne 0 ]; then
    echo "エラー: データベースの初期化に失敗しました"
    exit 1
fi

echo "サーバーを起動中..."
echo "監視ダッシュボード: http://localhost:3000/monitor.html"
echo "サーバーを停止するには Ctrl+C を押してください"
echo ""

npm start
