/**
 * 屏幕常亮控制
 *
 * 是否需要常亮由调用方通过 shouldHold() 决定（本项目为“正在播放且歌词可见”）；
 * 页面切到后台时浏览器会自动释放常亮，回到前台时这里会按 shouldHold() 重新申请。
 *
 * @param {() => boolean} shouldHold
 */
export function createWakeLock(shouldHold) {
  let sentinel = null;
  let pending = false;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        request();
      } else {
        release();
      }
    });
    window.addEventListener('pagehide', release);
  }

  async function request() {
    if (!('wakeLock' in navigator)) return;
    bindEvents();

    if (sentinel || pending || document.visibilityState !== 'visible' || !shouldHold()) {
      return;
    }

    pending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null;
      });
      sentinel = lock;
      // 申请是异步的，等待期间可能已暂停或关闭了歌词面板，此时立即归还
      if (!shouldHold()) {
        release();
      }
    } catch (error) {
      console.warn('无法获得屏幕常亮权限:', error);
    } finally {
      pending = false;
    }
  }

  function release() {
    if (!sentinel) return;
    const lock = sentinel;
    sentinel = null;
    lock.release().catch(() => {});
  }

  return { request, release, bindEvents };
}
