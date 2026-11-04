/**
 * 播放状态快照
 * Android 上后台标签页常被系统回收，重新打开时用快照恢复到上次的歌曲、进度和设置。
 * 只保存很小的 JSON，读写失败（隐私模式、配额满）时静默忽略。
 */

const STORAGE_KEY = 'musicIcePlaybackSnapshot';
// 快照结构变化时递增版本号，并在 migrateSnapshot 中把旧结构转换过来
const SNAPSHOT_VERSION = 2;

// v1 用分类 tab 编号和“目录/文件名”标识歌曲，v2 改用分类 id 和歌曲 id（文件名去扩展名）
const LEGACY_TAB_TO_CATEGORY = {
  'tab-A': 'all',
  'tab-I': 'minyao',
  'tab-B': 'qingyinyue',
  'tab-C': 'shangganzhiyu',
  'tab-D': 'liuxingjingdian',
  'tab-F': 'jiezoulvdong',
  'tab-G': 'dongmanyingshi'
};

function migrateSnapshot(snapshot) {
  if (snapshot?.version === SNAPSHOT_VERSION) return snapshot;
  if (snapshot?.version === 1) {
    const { tab, songId = '', ...rest } = snapshot;
    return {
      ...rest,
      version: SNAPSHOT_VERSION,
      category: LEGACY_TAB_TO_CATEGORY[tab] || 'all',
      songId: songId.split('/').pop().replace(/\.[^.]+$/, '').normalize('NFC')
    };
  }
  return null;
}

export function loadPlaybackSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateSnapshot(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{songId: string, category: string, currentTime: number, playMode: number, volume: number, muted: boolean}} snapshot
 */
export function savePlaybackSnapshot(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...snapshot,
      version: SNAPSHOT_VERSION,
      savedAt: Date.now()
    }));
  } catch (_) {
    // 存不下就放弃这次保存，不影响播放
  }
}
