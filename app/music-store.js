import { CATEGORIES } from '../catalog/index.js';
import { DEFAULT_COVERS, DEFAULT_COVER_DIR } from './shared-constants.js';

/**
 * 歌曲数据仓库（单一数据源）
 *
 * 启动时把 catalog/ 中的原始条目一次性转换为只读的歌曲模型，页面只读模型、不改原始数据。
 * 歌单条目只写歌曲自身信息；资源目录和分类名称取自所属分类（catalog/categories.js），纯音乐用 instrumental: true 标记。
 * - id：由音频文件名（去扩展名）派生，歌曲在分类间迁移后保持不变，可用于状态快照
 * - audioUrl / coverUrl / thumbUrl / lyricsUrl：已解析好的完整资源地址
 */

// 音乐根路径
export const FILE_MUSIC_ROOT = './media/';
// “全部”分类的虚拟 id
export const ALL_CATEGORY_ID = 'all';
// 旧版歌单条目的纯音乐标记（lyrics_type: 99），现已改用 instrumental: true
const LEGACY_INSTRUMENTAL_LYRICS_TYPE = 99;
const ALL_CATEGORY_LABEL = '全部';

// 没有专属封面的歌曲按 id 从 DEFAULT_COVERS 中稳定地分配一张，同一首歌在不同分类下封面保持一致

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
  if (jpgPath.startsWith(DEFAULT_COVER_DIR)) {
    return jpgPath.replace(DEFAULT_COVER_DIR, `${DEFAULT_COVER_DIR}thumbs/`);
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
  return !!(raw && raw.song_name && raw.song_file);
}

function createSong(raw, category, id) {
  // 资源统一放在 media/<分类目录>/ 下
  const folder = `${category.folder}/`;
  const coverUrl = resolveAssetPath(folder, raw.img_file) ||
    DEFAULT_COVERS[hashString(id) % DEFAULT_COVERS.length];

  return Object.freeze({
    id,
    categoryId: category.id,
    categoryLabel: category.label,
    name: raw.song_name,
    author: raw.author || '',
    time: raw.time || '',
    des: (raw.des || '').trim(),
    fileName: raw.song_file,
    audioUrl: resolveAssetPath(folder, raw.song_file),
    coverUrl,
    thumbUrl: resolveThumbnailPath(coverUrl) || coverUrl,
    lyricsUrl: resolveAssetPath(folder, raw.lyrics_file),
    // lyrics_type === 99 是旧版歌单的纯音乐标记：发布后浏览器可能短时间内仍缓存旧歌单文件，保留兼容
    isInstrumental: raw.instrumental === true || raw.lyrics_type === LEGACY_INSTRUMENTAL_LYRICS_TYPE
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
        console.warn('歌单条目缺少 song_name / song_file，已跳过:', raw);
        return;
      }

      let id = stripExtension(raw.song_file).normalize('NFC');
      // 不同分类出现同名文件时退回带目录的 id，保证唯一
      if (songsById.has(id)) {
        id = `${category.folder}/${id}`;
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
