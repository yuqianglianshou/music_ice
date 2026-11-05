/**
 * Music Icee Service Worker
 *
 * 目标：让页面可安装（PWA），并在弱网/离线时尽量能打开播放器界面。
 *
 * 缓存策略：
 * - 音频一律不经过 SW：音频依赖 Range 请求（206 分段响应），缓存它会导致播放中断，
 *   旧版 SW 就踩过这个坑；且单首 5–20MB，不适合放进缓存。
 * - 页面、JS、CSS、歌单、歌词：网络优先，失败时用缓存兜底。保证线上更新（含导入工具新增歌曲）立即生效。
 * - 图片（封面、缩略图、图标）：先用缓存秒开，同时后台重新请求并更新缓存（stale-while-revalidate）。
 *   替换同名封面/重新生成缩略图后，下次打开即显示新图。条目数有上限，超出时删除最早的。
 *
 * 修改缓存结构时递增 CACHE_VERSION，激活时会清理旧版本缓存。
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'music-ice-';
const PAGE_CACHE = `${CACHE_PREFIX}pages-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-${CACHE_VERSION}`;
const MAX_IMAGE_ENTRIES = 300;

const AUDIO_PATTERN = /\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i;
const IMAGE_PATTERN = /\.(jpe?g|png|webp|gif|svg|ico)$/i;

self.addEventListener('install', event => {
  // 只预缓存入口页，其他资源在首次访问时按需缓存，避免维护预缓存清单
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then(cache => cache.add('./'))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([PAGE_CACHE, IMAGE_CACHE]);
    const names = await caches.keys();
    // 只清理本应用的旧版本缓存，不碰同域名下其他应用的缓存
    await Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && !keep.has(name))
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 只处理本应用范围内的请求
  if (!url.href.startsWith(self.registration.scope)) return;

  // 音频、分段请求、本地导入工具：直接走网络，不缓存
  if (
    request.headers.has('range') ||
    request.destination === 'audio' ||
    request.destination === 'video' ||
    AUDIO_PATTERN.test(url.pathname) ||
    url.pathname.includes('/tools/')
  ) {
    return;
  }

  if (request.destination === 'image' || IMAGE_PATTERN.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    // cache: 'no-cache' 让浏览器每次向服务器确认（未变化时只返回 304），
    // 否则 fetch 仍可能命中浏览器 HTTP 缓存，发布后出现新旧 JS 混用（如新 config.js 配旧模块）导致页面报错
    const response = await fetch(request, { cache: 'no-cache' });
    // 只缓存完整的成功响应（200），206/错误响应不入缓存
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    // 离线打开任意页面时退回入口页
    if (request.mode === 'navigate') {
      const shell = await cache.match('./');
      if (shell) return shell;
    }
    throw error;
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  const refresh = fetch(request).then(async response => {
    if (response.status === 200) {
      await cache.put(request, response.clone());
      await trimCache(cache, MAX_IMAGE_ENTRIES);
    }
    return response;
  });

  if (cached) {
    // 有缓存时立即返回，后台刷新失败（离线）也不影响页面
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

// cache.keys() 按写入顺序返回，超出上限时删除最早写入的条目
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}
