// PWA Install Prompt Handler
class PWAInstallHandler {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.isInstalled = false;
    
    this.init();
  }

  init() {
    // インストール済みかチェック
    this.checkIfInstalled();
    
    // インストールプロンプトのイベントリスナー
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA install prompt triggered');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // インストール完了のイベントリスナー
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      this.isInstalled = true;
      this.hideInstallButton();
    });

    // ページ読み込み時にインストールボタンをチェック
    window.addEventListener('load', () => {
      this.createInstallButton();
    });
  }

  checkIfInstalled() {
    // スタンドアロンモードかチェック
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      this.isInstalled = true;
    }
  }

  createInstallButton() {
    if (this.isInstalled) return;

    // インストールボタンを作成
    this.installButton = document.createElement('button');
    this.installButton.id = 'pwa-install-btn';
    this.installButton.innerHTML = '📱 アプリをインストール';
    this.installButton.className = 'pwa-install-btn';
    this.installButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000;
      transition: all 0.3s ease;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // ホバー効果
    this.installButton.addEventListener('mouseenter', () => {
      this.installButton.style.transform = 'translateY(-2px)';
      this.installButton.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
    });

    this.installButton.addEventListener('mouseleave', () => {
      this.installButton.style.transform = 'translateY(0)';
      this.installButton.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    });

    // クリックイベント
    this.installButton.addEventListener('click', () => {
      this.installApp();
    });

    document.body.appendChild(this.installButton);
  }

  showInstallButton() {
    if (this.installButton && !this.isInstalled) {
      this.installButton.style.display = 'block';
      
      // アニメーション表示
      setTimeout(() => {
        this.installButton.style.opacity = '0';
        this.installButton.style.transform = 'translateY(20px)';
        this.installButton.style.transition = 'all 0.3s ease';
        
        requestAnimationFrame(() => {
          this.installButton.style.opacity = '1';
          this.installButton.style.transform = 'translateY(0)';
        });
      }, 100);
    }
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      // フォールバック: 手動インストール手順を表示
      this.showManualInstallInstructions();
      return;
    }

    try {
      // インストールプロンプトを表示
      this.deferredPrompt.prompt();
      
      // ユーザーの選択を待つ
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      // プロンプトをクリア
      this.deferredPrompt = null;
      this.hideInstallButton();
    } catch (error) {
      console.error('Error during PWA installation:', error);
      this.showManualInstallInstructions();
    }
  }

  showManualInstallInstructions() {
    // 手動インストール手順のモーダルを表示
    const modal = document.createElement('div');
    modal.className = 'pwa-install-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 15px;
      max-width: 400px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    content.innerHTML = `
      <h3 style="margin-top: 0; color: #333;">📱 アプリをインストール</h3>
      <p style="color: #666; line-height: 1.6;">
        <strong>Chrome/Edge:</strong><br>
        アドレスバーの「インストール」ボタンをクリック
      </p>
      <p style="color: #666; line-height: 1.6;">
        <strong>Safari (iOS):</strong><br>
        共有ボタン → 「ホーム画面に追加」
      </p>
      <p style="color: #666; line-height: 1.6;">
        <strong>Firefox:</strong><br>
        アドレスバーの「+」ボタンをクリック
      </p>
      <button onclick="this.closest('.pwa-install-modal').remove()" 
              style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 15px;">
        閉じる
      </button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
}

// PWAインストールハンドラーを初期化
document.addEventListener('DOMContentLoaded', () => {
  new PWAInstallHandler();
});
