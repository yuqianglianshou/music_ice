import { CATEGORIES } from '../catalog/index.js';
import { CONFIG } from './config.js';

/**
 * 歌曲数据仓库（单一数据源）
 *
 * 启动时把 catalog/ 中的原始条目一次性转换为只读的歌曲模型，页面只读模型、不改原始数据：
 * - id：由音频文件名（去扩展名）派生，歌曲在分类间迁移后保持不变，可用于状态快照
 * - audioUrl / coverUrl / thumbUrl / lyricsUrl：已解析好的完整资源地址
 */

// 音乐根路径
export const FILE_MUSIC_ROOT = './media/';
// “全部”分类的虚拟 id
export const ALL_CATEGORY_ID = 'all';
const ALL_CATEGORY_LABEL = '全部';

// 没有专属封面的歌曲按 id 稳定地分配一张默认封面，同一首歌在不同分类下封面保持一致
const DEFAULT_COVER_COUNT = 53;
const WEBP_DEFAULT_COVER_IDS = new Set([18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33]);
const DEFAULT_COVERS = Array.from({ length: DEFAULT_COVER_COUNT }, (_, i) => {
  const id = i + 1;
  return `./assets/covers/defaults/${id}.${WEBP_DEFAULT_COVER_IDS.has(id) ? 'webp' : 'jpg'}`;
});

// 旧版会把歌单复制一份进 localStorage 再读出，现已改为直接读内存；启动时清掉这些遗留键
const LEGACY_STORAGE_KEYS = [
  'lightMusicList',
  'healingMusicList',
  'popClassicsList',
  'rhythmList',
  'animeScreenList',
  'folkMusicList',
  'musicListStorageVersion'
];

function isDirectPath(path) {
  return /^(\.\/|\/|https?:)/.test(path);
}

// 歌单里的文件名相对于 media/分类目录/，以 ./、/、http 开头的视为已是完整路径（如导入工具写入的默认封面）
function resolveAssetPath(folder, fileName) {
  const normalized = (fileName || '').trim();
  if (!normalized) return '';
  return isDirectPath(normalized) ? normalized : `${FILE_MUSIC_ROOT}${folder}${normalized}`;
}

// 列表使用 scripts/generate-thumbnails.mjs 生成的 jpg 缩略图，加载失败时页面会回退到原图
function resolveThumbnailPath(coverUrl) {
  if (!coverUrl || /^(\/|https?:)/.test(coverUrl)) return coverUrl;

  const jpgPath = coverUrl.replace(/\.[^./]+$/, '.jpg');
  if (jpgPath.startsWith('./assets/covers/defaults/')) {
    return jpgPath.replace('./assets/covers/defaults/', './assets/covers/defaults/thumbs/');
  }
  if (jpgPath.startsWith(FILE_MUSIC_ROOT)) {
    return jpgPath.replace(FILE_MUSIC_ROOT, './assets/covers/music-thumbs/');
  }
  return coverUrl;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function isValidEntry(raw) {
  return !!(raw && raw.song_name && raw.song_file && raw.song_path);
}

function createSong(raw, category, id) {
  const folder = raw.song_path;
  const coverUrl = resolveAssetPath(folder, raw.img_file) ||
    DEFAULT_COVERS[hashString(id) % DEFAULT_COVERS.length];

  return Object.freeze({
    id,
    categoryId: category.id,
    categoryLabel: raw.song_type || category.label,
    name: raw.song_name,
    author: raw.author || '',
    time: raw.time || '',
    des: (raw.des || '').trim(),
    fileName: raw.song_file,
    audioUrl: resolveAssetPath(folder, raw.song_file),
    coverUrl,
    thumbUrl: resolveThumbnailPath(coverUrl) || coverUrl,
    lyricsUrl: resolveAssetPath(folder, raw.lyrics_file),
    isInstrumental: raw.lyrics_type === CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue
  });
}

function buildLibrary() {
  const songsByCategory = new Map();
  const songsById = new Map();
  const allSongs = [];

  CATEGORIES.forEach(category => {
    const songs = [];
    category.list.forEach(raw => {
      if (!isValidEntry(raw)) {
        console.warn('歌单条目缺少 song_name / song_file / song_path，已跳过:', raw);
        return;
      }

      let id = stripExtension(raw.song_file).normalize('NFC');
      // 不同分类出现同名文件时退回带目录的 id，保证唯一
      if (songsById.has(id)) {
        id = `${raw.song_path}${id}`;
      }

      const song = createSong(raw, category, id);
      songsById.set(id, song);
      songs.push(song);
      allSongs.push(song);
    });
    songsByCategory.set(category.id, Object.freeze(songs));
  });

  songsByCategory.set(ALL_CATEGORY_ID, Object.freeze(allSongs));
  return { songsByCategory, songsById };
}

function cleanupLegacyStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  } catch (_) {
    // 隐私模式等无法访问 localStorage 时无需清理
  }
}

const library = buildLibrary();
cleanupLegacyStorage();

export const musicRepository = {
  /**
   * 分类列表（含“全部”），顺序即页面 tab 顺序
   * @returns {{id: string, label: string}[]}
   */
  getCategories() {
    return [
      { id: ALL_CATEGORY_ID, label: ALL_CATEGORY_LABEL },
      ...CATEGORIES.map(({ id, label }) => ({ id, label }))
    ];
  },

  hasCategory(categoryId) {
    return library.songsByCategory.has(categoryId);
  },

  /**
   * 某分类下的歌曲（只读数组），未知分类返回空数组
   */
  getSongs(categoryId) {
    return library.songsByCategory.get(categoryId) || [];
  },

  findSongById(songId) {
    return library.songsById.get(songId) || null;
  }
};
