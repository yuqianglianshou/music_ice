/**
 * 播放器页面（app.js / music-store.js）与导入工具（song-importer.js）共用的常量。
 * 两边必须取值一致，否则会出现默认封面路径对不上、导入后页面收不到更新通知等问题。
 */

// ==================== 默认封面 ====================

// 默认封面原图目录；列表缩略图在其下的 thumbs/ 子目录（由 generate-thumbnails.mjs --defaults 生成）
export const DEFAULT_COVER_DIR = './assets/covers/defaults/';

// 默认封面编号 1..53，大多数为 jpg，以下编号是 webp。增删默认封面时同步修改这里。
const DEFAULT_COVER_COUNT = 53;
const WEBP_DEFAULT_COVER_IDS = new Set([18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33]);

// 全部默认封面路径，下标 i 对应编号 i + 1
export const DEFAULT_COVERS = Object.freeze(Array.from({ length: DEFAULT_COVER_COUNT }, (_, i) => {
  const id = i + 1;
  return `${DEFAULT_COVER_DIR}${id}.${WEBP_DEFAULT_COVER_IDS.has(id) ? 'webp' : 'jpg'}`;
}));

export function isDefaultCoverPath(path) {
  return String(path || '').startsWith(DEFAULT_COVER_DIR);
}

// ==================== 导入工具 → 播放器的更新通知 ====================
// 导入工具写入歌单后，同时通过 localStorage（storage 事件）和 BroadcastChannel 通知已打开的播放器页面重新加载歌单。

export const IMPORT_SIGNAL_KEY = 'musicIceCatalogUpdatedAt';
export const IMPORT_CHANNEL_NAME = 'music-ice-importer';
export const CATALOG_UPDATED_MESSAGE = 'catalog-updated';
