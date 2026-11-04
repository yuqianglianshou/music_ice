/**
 * Media Session 封装
 * 让 Android 通知栏、锁屏、蓝牙耳机线控和车机显示当前歌曲并能控制播放。
 * 浏览器不支持时所有方法都静默降级为空操作，不影响页面内播放。
 */

const isSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

const IMAGE_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function toAbsoluteUrl(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch (_) {
    return path;
  }
}

// 系统媒体通知需要绝对地址；带上 MIME 类型，便于系统挑选可解码的图片
function buildArtwork(paths = []) {
  return Array.from(new Set(paths.filter(Boolean))).map(path => {
    const extension = path.split('?')[0].split('.').pop().toLowerCase();
    const artwork = { src: toAbsoluteUrl(path) };
    if (IMAGE_MIME_TYPES[extension]) {
      artwork.type = IMAGE_MIME_TYPES[extension];
    }
    return artwork;
  });
}

export const mediaSession = {
  isSupported,

  /**
   * 注册系统媒体控制回调，key 为 MediaSessionAction（play、pause、nexttrack 等）
   */
  bindHandlers(handlers) {
    if (!isSupported) return;
    Object.entries(handlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (_) {
        // 旧版浏览器不认识部分 action 会直接抛错，忽略该 action 即可
      }
    });
  },

  setMetadata({ title, artist, album, artwork }) {
    if (!isSupported || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: buildArtwork(artwork)
    });
  },

  setPlaybackState(isPlaying) {
    if (!isSupported) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  },

  /**
   * 同步进度条位置。只需在时长变化、播放/暂停、跳转后调用，
   * 系统会根据 playbackRate 自行推算中间进度，无需在 timeupdate 里频繁调用。
   */
  setPositionState(audio) {
    if (!isSupported || typeof navigator.mediaSession.setPositionState !== 'function') return;

    const duration = audio?.duration;
    try {
      if (!Number.isFinite(duration) || duration <= 0) {
        // 新歌尚未拿到时长时清空旧进度，避免通知栏显示上一首的进度
        navigator.mediaSession.setPositionState();
        return;
      }
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(Math.max(0, audio.currentTime || 0), duration)
      });
    } catch (_) {
      // position 超出 duration 等边界情况会抛错，丢弃这次同步即可
    }
  }
};
