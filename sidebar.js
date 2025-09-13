import GasAPI from './api.js'; // GasAPIをインポート
import { auditManager } from './audit-manager.js';
import { auditConfig } from './audit-config.js';

const sidebarHTML = `
  <div id="sidebar-panel" class="sidebar">
    <a href="javascript:void(0)" class="closebtn" onclick="toggleSidebar()">&times;</a>
    <a href="index.html">組選択</a>
    <div class="mode-section">
      <div class="mode-title">動作モード</div>
      <div class="current-mode">現在: <span id="current-mode-display">通常モード</span></div>
      <button class="change-mode-btn" onclick="showModeChangeModal()">モード変更</button>
    </div>
    <div class="navigation-section">
      <div class="nav-title">ナビゲーション</div>
      <a href="javascript:void(0)" onclick="navigateToWalkin()" class="nav-link" id="walkin-nav-link">当日券発行</a>
    </div>
    <div class="debug-section">
      <button class="debug-btn" onclick="testGASConnection()">GAS疎通テスト</button>
      <a href="audit-dashboard.html" class="debug-btn" style="display: block; text-align: center; margin-top: 10px; text-decoration: none; color: inherit;">監査ログダッシュボード</a>
      <button class="debug-btn" onclick="manualSyncLogs()" style="margin-top: 10px;">手動同期</button>
      <button class="debug-btn" onclick="showSyncStatus()" style="margin-top: 5px;">同期ステータス</button>
    </div>
  </div>
  <div id="sidebar-overlay" class="sidebar-overlay" onclick="closeSidebar()"></div>
  <div id="mode-change-modal" class="modal">
    <div class="modal-content">
      <h3>モード変更</h3>
      <div class="mode-options">
        <label class="mode-option">
          <input type="radio" name="mode" value="normal" checked> 
          <span>通常モード</span>
        </label>
        <label class="mode-option">
          <input type="radio" name="mode" value="admin"> 
          <span>管理者モード</span>
        </label>
        <label class="mode-option">
          <input type="radio" name="mode" value="walkin"> 
          <span>当日券モード</span>
        </label>
        <label class="mode-option">
          <input type="radio" name="mode" value="superadmin"> 
          <span>最高管理者モード</span>
        </label>
      </div>
      <div class="password-section">
        <input type="password" id="mode-password" placeholder="パスワード">
      </div>
      <div class="modal-buttons">
        <button class="btn-primary" onclick="applyModeChange()">変更</button>
        <button class="btn-secondary" onclick="closeModeModal()">キャンセル</button>
      </div>
    </div>
  </div>
`;

function loadSidebar() {
    const container = document.getElementById('sidebar-container');
    if (container) {
        container.innerHTML = sidebarHTML;
        updateModeDisplay(); // 必要な関数を呼び出す
        updateNavigationAccess(); // ナビゲーションアクセス制限を更新
    }
}

function showModeChangeModal() {
    const modal = document.getElementById("mode-change-modal");
    if (modal) {
        modal.classList.add('show');
    }
}

function closeModeModal() {
    const modal = document.getElementById("mode-change-modal");
    if (modal) {
        modal.classList.add('fade-out');
        setTimeout(() => {
            modal.classList.remove('show');
            modal.classList.remove('fade-out');
        }, 300);
    }
}

let _isApplyingModeChange = false;

// モード変更を適用する関数
async function applyModeChange() {
    if (_isApplyingModeChange) return; // 二重実行防止
    _isApplyingModeChange = true;
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const passwordInput = document.getElementById("mode-password");
    const password = passwordInput.value;
    let selectedMode;

    modeRadios.forEach(radio => {
        if (radio.checked) {
            selectedMode = radio.value;
        }
    });

    const disableModal = (disabled) => {
        try {
            const primary = document.querySelector('.modal-buttons .btn-primary');
            const secondary = document.querySelector('.modal-buttons .btn-secondary');
            if (primary) primary.disabled = disabled;
            if (secondary) secondary.disabled = disabled;
            if (passwordInput) passwordInput.disabled = disabled;
        } catch (_) {}
    };

    disableModal(true);

    try {
        // 通常モードに戻る場合はパスワード検証をスキップ
        if (selectedMode === 'normal') {
            // 監査ログ：通常モードへの変更
            auditManager.log('mode_change_to_normal', {
                fromMode: localStorage.getItem('currentMode') || 'normal',
                toMode: 'normal',
                beforeData: { previousMode: localStorage.getItem('currentMode') || 'normal' },
                afterData: { newMode: 'normal' }
            });

            localStorage.setItem('currentMode', selectedMode);
            updateModeDisplay();
            alert('通常モードに切り替えました');
            closeModeModal();
            // ページをリロードして権限を即時反映
            location.reload();
            return;
        }

        // パスワードが入力されていない場合
        if (!password) {
            alert('パスワードを入力してください');
            return;
        }

        const result = await GasAPI.verifyModePassword(selectedMode, password);

        if (result.success) {
            // 監査ログ：モード変更成功
            auditManager.log('mode_change_success', {
                fromMode: localStorage.getItem('currentMode') || 'normal',
                toMode: selectedMode,
                beforeData: { previousMode: localStorage.getItem('currentMode') || 'normal' },
                afterData: { newMode: selectedMode }
            });

            localStorage.setItem('currentMode', selectedMode); // 現在のモードを保存
            updateModeDisplay(); // 表示を更新
            
            let modeText = '通常モード';
            if (selectedMode === 'admin') modeText = '管理者モード';
            if (selectedMode === 'walkin') modeText = '当日券モード';
            if (selectedMode === 'superadmin') modeText = '最高管理者モード';
            
            alert(`${modeText}に切り替えました`);
            closeModeModal(); // モーダルを閉じる
            
            // ページをリロードして権限を即時反映
            location.reload();
        } else {
            alert('パスワードが間違っています。');
        }
    } catch (error) {
        alert(`エラーが発生しました: ${error.message}`);
    } finally {
        disableModal(false);
        _isApplyingModeChange = false;
    }
}

// モード表示を更新する関数
function updateModeDisplay() {
    const modeDisplay = document.getElementById("current-mode-display");
    if (modeDisplay) {
        const currentMode = localStorage.getItem('currentMode') || 'normal';
        let displayText = '通常モード';
        
        if (currentMode === 'admin') {
            displayText = '管理者モード';
        } else if (currentMode === 'walkin') {
            displayText = '当日券モード';
        } else if (currentMode === 'superadmin') {
            displayText = '最高管理者モード';
        }
        
        modeDisplay.textContent = displayText;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar-panel");
    if (!sidebar) {
        console.warn('Sidebar panel element not found');
        return;
    }
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

function openSidebar() {
    const sidebar = document.getElementById("sidebar-panel");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('show');
}

function closeSidebar() {
    const sidebar = document.getElementById("sidebar-panel");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

// ナビゲーションアクセス制限を更新する関数
function updateNavigationAccess() {
    const currentMode = localStorage.getItem('currentMode') || 'normal';
    const walkinNavLink = document.getElementById('walkin-nav-link');
    
    if (walkinNavLink) {
        if (currentMode === 'walkin' || currentMode === 'superadmin') {
            walkinNavLink.style.display = 'block';
            walkinNavLink.style.opacity = '1';
            walkinNavLink.style.pointerEvents = 'auto';
        } else {
            walkinNavLink.style.display = 'none';
        }
    }
}

// 当日券ページへのナビゲーション
function navigateToWalkin() {
    const currentMode = localStorage.getItem('currentMode') || 'normal';
    
    if (currentMode !== 'walkin' && currentMode !== 'superadmin') {
        alert('当日券発行には当日券モードまたは最高管理者モードでのログインが必要です。\nサイドバーからモードを変更してください。');
        return;
    }
    
    // 現在のURLからパラメータを取得
    const urlParams = new URLSearchParams(window.location.search);
    const group = urlParams.get('group');
    const day = urlParams.get('day');
    const timeslot = urlParams.get('timeslot');
    
    if (group && day && timeslot) {
        // 現在のページにパラメータがある場合は、それを使用
        window.location.href = `walkin.html?group=${group}&day=${day}&timeslot=${timeslot}`;
    } else {
        // パラメータがない場合は、組選択ページに戻る
        alert('公演情報が見つかりません。組選択ページから再度お試しください。');
        window.location.href = 'index.html';
    }
}


// グローバル変数として設定
window.loadSidebar = loadSidebar;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.showModeChangeModal = showModeChangeModal; // モーダルを表示する関数もグローバル登録
window.closeModeModal = closeModeModal; // モーダルを閉じる関数もグローバル登録
window.applyModeChange = applyModeChange; // モード変更を適用する関数もグローバル登録
window.navigateToWalkin = navigateToWalkin; // 当日券ページへのナビゲーション関数もグローバル登録

// GAS疎通テスト関数をグローバルに登録
window.testGASConnection = async function() {
  try {
    const result = await GasAPI.testGASConnection();
    if (result.success) {
      alert('GAS疎通テスト成功！\n\nAPI応答: ' + JSON.stringify(result.data, null, 2));
    } else {
      alert('GAS疎通テスト失敗！\n\nエラー: ' + result.error);
    }
  } catch (error) {
    alert('GAS疎通テストでエラーが発生しました！\n\nエラー: ' + error.message);
  }
};

// 手動同期機能
window.manualSyncLogs = async function() {
  try {
    const result = await auditManager.manualSync();
    
    if (result.success) {
      alert('同期完了: ' + result.message);
    } else {
      alert('同期に失敗しました: ' + result.message);
    }
  } catch (error) {
    alert('同期エラー: ' + error.message);
  }
};

// 同期ステータス表示
window.showSyncStatus = function() {
  const config = auditManager.getConfig();
  const stats = auditManager.getStats();
  
  const statusText = `
=== 監査ログシステムステータス ===

【基本設定】
有効: ${config.isEnabled ? '有効' : '無効'}
自動同期: ${config.autoSync ? '有効' : '無効'}
同期間隔: ${config.syncInterval / 1000}秒
最大ログ数: ${config.maxLogs}

【現在の状態】
総ログ数: ${stats.total}
同期待ちログ: ${config.pendingLogs}件
最終同期: ${config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString('ja-JP') : '未実行'}

【統計情報】
DEMO操作: ${stats.demoOperations}
通常操作: ${stats.normalOperations}
エラー数: ${stats.errorCount || 0}
スプレッドシート数: ${Object.keys(stats.bySpreadsheet || {}).length}
  `;
  
  alert(statusText);
};

export { loadSidebar, toggleSidebar, showModeChangeModal, closeModeModal, applyModeChange };
