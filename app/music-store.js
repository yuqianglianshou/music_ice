import { MUSIC_LISTS } from '../catalog/index.js';

//音乐根路径
export const FILE_MUSIC_ROOT = './media/';

const {
  lightMusicList,
  healingList,
  popClassicsList,
  epicScoreList,
  rhythmList,
  animeScreenList,
  nostalgiaList,
  folkList
} = MUSIC_LISTS;

const ALL_SOURCE_LISTS = [
  lightMusicList,
  healingList,
  popClassicsList,
  epicScoreList,
  rhythmList,
  animeScreenList,
  nostalgiaList,
  folkList
];

const CATEGORY_LABELS = {
  LIGHT_MUSIC: '轻音乐',
  HEALING: '伤感治愈',
  POP_CLASSICS: '流行经典',
  EPIC_SCORE: '史诗配乐',
  RHYTHM: '节奏律动',
  ANIME_SCREEN: '动漫影视',
  NOSTALGIA: '怀旧金曲',
  FOLK: '民谣'
};

// 统一管理所有音乐列表的存储
export const STORAGE_KEYS = {
  LIGHT_MUSIC: 'lightMusicList',
  HEALING: 'healingMusicList',
  POP_CLASSICS: 'popClassicsList',
  EPIC_SCORE: 'epicScoreList',
  RHYTHM: 'rhythmList',
  ANIME_SCREEN: 'animeScreenList',
  NOSTALGIA: 'nostalgiaList',
  FOLK: 'folkMusicList'
};

const STORAGE_META_KEY = 'musicListStorageVersion';
const memoryStorage = new Map();

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createStorageSignature(musicListMap) {
  const payload = Object.entries(musicListMap).map(([key, list]) => [
    key,
    list.map(music => ({
      song_name: music.song_name || music.title || '',
      song_file: music.song_file || music.name_path || '',
      song_path: music.song_path || music.type_path || '',
      img_file: music.img_file || '',
      lyrics_file: music.lyrics_file || music.lyrics_path || '',
      author: music.author || '',
      time: music.time || '',
      des: music.des || ''
    }))
  ]);

  return `auto-${hashString(stableStringify(payload))}`;
}

const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem(key, value) {
    const normalizedValue = String(value);
    try {
      localStorage.setItem(key, normalizedValue);
    } catch (_) {
      memoryStorage.set(key, normalizedValue);
    }
  }
};

// 创建一个统一的存储管理类
export class MusicStorage {

  // 定义音乐类型枚举
  static MUSIC_TYPES = {
    LIGHT_MUSIC: { key: STORAGE_KEYS.LIGHT_MUSIC, label: CATEGORY_LABELS.LIGHT_MUSIC },
    HEALING: { key: STORAGE_KEYS.HEALING, label: CATEGORY_LABELS.HEALING },
    POP_CLASSICS: { key: STORAGE_KEYS.POP_CLASSICS, label: CATEGORY_LABELS.POP_CLASSICS },
    EPIC_SCORE: { key: STORAGE_KEYS.EPIC_SCORE, label: CATEGORY_LABELS.EPIC_SCORE },
    RHYTHM: { key: STORAGE_KEYS.RHYTHM, label: CATEGORY_LABELS.RHYTHM },
    ANIME_SCREEN: { key: STORAGE_KEYS.ANIME_SCREEN, label: CATEGORY_LABELS.ANIME_SCREEN },
    NOSTALGIA: { key: STORAGE_KEYS.NOSTALGIA, label: CATEGORY_LABELS.NOSTALGIA },
    FOLK: { key: STORAGE_KEYS.FOLK, label: CATEGORY_LABELS.FOLK }
  };

  static getListAllMusic() {
    try {
      return ALL_SOURCE_LISTS
        .flat()
        .filter(this.validateMusic);
    } catch (error) {
      console.error('获取所有音乐列表失败:', error);
      return [];
    }
  }

  // 定义音乐列表映射
  static get musicListMap() {
    return {
      [STORAGE_KEYS.LIGHT_MUSIC]: lightMusicList.filter(this.validateMusic),
      [STORAGE_KEYS.HEALING]: healingList.filter(this.validateMusic),
      [STORAGE_KEYS.POP_CLASSICS]: popClassicsList.filter(this.validateMusic),
      [STORAGE_KEYS.EPIC_SCORE]: epicScoreList.filter(this.validateMusic),
      [STORAGE_KEYS.RHYTHM]: rhythmList.filter(this.validateMusic),
      [STORAGE_KEYS.ANIME_SCREEN]: animeScreenList.filter(this.validateMusic),
      [STORAGE_KEYS.NOSTALGIA]: nostalgiaList.filter(this.validateMusic),
      [STORAGE_KEYS.FOLK]: folkList.filter(this.validateMusic)
    };
  }

  // 验证音乐对象
  static validateMusic(music) {
    return !!(
      music &&
      (music.song_name || music.title) &&
      (music.song_file || music.name_path) &&
      music.author !== undefined &&
      (music.song_type ?? music.type) !== undefined &&
      (music.song_path || music.type_path) !== undefined
    );
  }


  // 存储单个列表
  static saveList(key, list) {
    try {
      const validList = list.filter(this.validateMusic);
      safeStorage.setItem(key, JSON.stringify(validList));
      return true;
    } catch (error) {
      console.error(`存储音乐列表失败 (${key}):`, error);
      return false;
    }
  }

  // 获取单个列表
  static getList(key) {
    try {
      const list = JSON.parse(safeStorage.getItem(key)) || [];
      return list.filter(this.validateMusic);
    } catch (error) {
      console.error(`获取音乐列表失败 (${key}):`, error);
      return [];
    }
  }

  // 存储所有列表
  static saveAllLists() {
    return Object.entries(this.musicListMap)
      .map(([key, list]) => this.saveList(key, list))
      .every(Boolean);
  }

  // 按类型获取音乐
  static getListByType(type) {
    return this.getListAllMusic().filter(music => (music.song_type ?? music.type) === type);
  }

  // 搜索音乐
  static searchMusic(keyword) {
    if (!keyword?.trim()) return [];

    const searchTerm = keyword.toLowerCase().trim();
    return this.getListAllMusic().filter(music =>
      (music.song_name || music.title || '').toLowerCase().includes(searchTerm) ||
      music.author.toLowerCase().includes(searchTerm) ||
      music.des?.toLowerCase().includes(searchTerm)
    );
  }

  // 获取随机音乐
  static getRandomMusic() {
    const allMusic = this.getListAllMusic();
    return allMusic[Math.floor(Math.random() * allMusic.length)];
  }

}

// 歌单内容变化时自动更新本地缓存，不需要手动维护版本号。
const storageSignature = createStorageSignature(MusicStorage.musicListMap);
const shouldRefreshStorage = safeStorage.getItem(STORAGE_META_KEY) !== storageSignature;
if (shouldRefreshStorage) {
  MusicStorage.saveAllLists();
  safeStorage.setItem(STORAGE_META_KEY, storageSignature);
}

/**
 * 获取音乐列表
 */
export const getMusicList = (tabName) => {
  const tabMusicMap = {
    'tab-A': MusicStorage.getListAllMusic(),
    'tab-B': MusicStorage.getList(STORAGE_KEYS.LIGHT_MUSIC),
    'tab-C': MusicStorage.getList(STORAGE_KEYS.HEALING),
    'tab-D': MusicStorage.getList(STORAGE_KEYS.POP_CLASSICS),
    'tab-E': MusicStorage.getList(STORAGE_KEYS.EPIC_SCORE),
    'tab-F': MusicStorage.getList(STORAGE_KEYS.RHYTHM),
    'tab-G': MusicStorage.getList(STORAGE_KEYS.ANIME_SCREEN),
    'tab-H': MusicStorage.getList(STORAGE_KEYS.NOSTALGIA),
    'tab-I': MusicStorage.getList(STORAGE_KEYS.FOLK)
  };
  return tabMusicMap[tabName] || [];
};
