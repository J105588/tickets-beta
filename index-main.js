import { loadSidebar, toggleSidebar, showModeChangeModal } from './sidebar.js';    

(async () => {
  try {
    if (window.systemLockReady && typeof window.systemLockReady.then === 'function') {
      await window.systemLockReady;
    }
  } catch (_) {}
  loadSidebar();

  // グローバルスコープに関数を登録
  window.toggleSidebar = toggleSidebar;
  window.showModeChangeModal = showModeChangeModal;
})();
