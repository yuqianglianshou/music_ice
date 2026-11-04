/**
 * Service Worker 安装与旧版清理
 *
 * 历史上同域名下有旧 Service Worker 会拦截音频 Range 请求，对 206 分段响应调用 cache.put 导致播放中断。
 * 新的 sw.js 不再缓存音频（见 sw.js 顶部说明），这里负责：
 * 1. 注销控制本页面、但不是本应用 sw.js 的旧注册；
 * 2. 注册本应用的 sw.js（使页面可安装为 PWA，并在弱网时兜底）。
 */

const SW_URL = new URL('../sw.js', import.meta.url).href;
const CACHE_PREFIX = 'music-ice-';
const RELOAD_FLAG = 'serviceWorkerCleanupReloaded';

function getScriptUrl(registration) {
  return (registration.active || registration.waiting || registration.installing)?.scriptURL || '';
}

/**
 * 清理旧版 Service Worker。
 * @returns {Promise<boolean>} 为 true 时页面即将刷新，调用方应停止初始化
 */
async function cleanupLegacyServiceWorkers() {
  // getRegistrations() 会返回整个域名下的注册，只处理作用范围覆盖本页面的那些，避免误伤同域名的其他应用
  const registrations = await navigator.serviceWorker.getRegistrations();
  const legacy = registrations.filter(registration =>
    window.location.href.startsWith(registration.scope) && getScriptUrl(registration) !== SW_URL
  );
  if (!legacy.length) return false;

  await Promise.all(legacy.map(registration => registration.unregister()));

  // 旧 SW 的缓存名未知，清理除本应用以外的缓存（与旧逻辑一致，但保留本应用缓存）
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.filter(name => !name.startsWith(CACHE_PREFIX)).map(name => caches.delete(name))
    );
  }

  // 当前页面仍受旧 SW 控制时刷新一次，sessionStorage 标记防止反复刷新
  const controllerUrl = navigator.serviceWorker.controller?.scriptURL;
  if (controllerUrl && controllerUrl !== SW_URL && !sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
    return true;
  }
  return false;
}

/**
 * @returns {Promise<boolean>} 为 true 时页面即将刷新，调用方应停止初始化
 */
export async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;

  try {
    if (await cleanupLegacyServiceWorkers()) return true;
  } catch (error) {
    console.warn('清理旧 Service Worker 失败:', error);
  }

  // 注册放到页面加载完成之后，避免与首屏资源争抢带宽
  const register = () => {
    navigator.serviceWorker.register(SW_URL).catch(error => {
      console.warn('Service Worker 注册失败:', error);
    });
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
  return false;
}
