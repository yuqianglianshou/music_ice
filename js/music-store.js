import { MUSIC_LISTS } from '../data/music/index.js';

//音乐根路径
export const FILE_MUSIC_ROOT = './music/';

const {
  musicList1,
  musicList2,
  musicList3,
  musicList4,
  musicList5,
  musicList6,
  musicList7,
  musicList8
} = MUSIC_LISTS;

// 统一管理所有音乐列表的存储
export const STORAGE_KEYS = {
  TIANLANZHIYIN: 'musicList1',
  QINGYINYUE: 'musicList2',
  EMO: 'musicList3',
  JINGDIAN: 'musicList4',
  BGM: 'musicList5',
  LVDONG: 'musicList6',
  DONGHUAPIAN: 'musicList7',
  MINYAO: 'musicList8'
};

const STORAGE_META_KEY = 'musicListStorageVersion';
const STORAGE_VERSION = '2026-04-20-v7';
const memoryStorage = new Map();

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
    TIANLANZHIYIN: { key: 'musicList1', label: '天籁之音' },
    QINGYINYUE: { key: 'musicList2', label: '轻音乐' },
    EMO: { key: 'musicList3', label: 'EMO' },
    JINGDIAN: { key: 'musicList4', label: '经典' },
    BGM: { key: 'musicList5', label: '气势BGM' },
    LVDONG: { key: 'musicList6', label: '律动' },
    DONGHUAPIAN: { key: 'musicList7', label: '动画片' },
    MINYAO: { key: 'musicList8', label: '民谣' }
  };
  // 定义音乐列表映射
  static musicListMap = {
    [STORAGE_KEYS.TIANLANZHIYIN]: musicList1,
    [STORAGE_KEYS.QINGYINYUE]: musicList2,
    [STORAGE_KEYS.EMO]: musicList3,
    [STORAGE_KEYS.JINGDIAN]: musicList4,
    [STORAGE_KEYS.BGM]: musicList5,
    [STORAGE_KEYS.LVDONG]: musicList6,
    [STORAGE_KEYS.DONGHUAPIAN]: musicList7,
    [STORAGE_KEYS.MINYAO]: musicList8
  };

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


  // 获取所有音乐
  static getListAllMusic() {
    try {
      return Object.values(this.musicListMap)
        .flat()
        .filter(this.validateMusic);
    } catch (error) {
      console.error('获取所有音乐列表失败:', error);
      return [];
    }
  }
  // 按类型获取音乐
  static getListByType(type) {
    return this.musicListMap[type]?.filter(this.validateMusic) || [];
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

// 仅在首次加载或版本变更时更新本地缓存，避免每次启动全量写入
const shouldRefreshStorage = safeStorage.getItem(STORAGE_META_KEY) !== STORAGE_VERSION;
if (shouldRefreshStorage) {
  MusicStorage.saveAllLists();
  safeStorage.setItem(STORAGE_META_KEY, STORAGE_VERSION);
}

/**
 * 获取音乐列表
 */
export const getMusicList = (tabName) => {
  const tabMusicMap = {
    'tab-A': MusicStorage.getListAllMusic(),
    'tab-B': MusicStorage.getList(STORAGE_KEYS.TIANLANZHIYIN),
    'tab-C': MusicStorage.getList(STORAGE_KEYS.QINGYINYUE),
    'tab-D': MusicStorage.getList(STORAGE_KEYS.EMO),
    'tab-E': MusicStorage.getList(STORAGE_KEYS.JINGDIAN),
    'tab-F': MusicStorage.getList(STORAGE_KEYS.BGM),
    'tab-G': MusicStorage.getList(STORAGE_KEYS.LVDONG),
    'tab-H': MusicStorage.getList(STORAGE_KEYS.DONGHUAPIAN),
    'tab-I': MusicStorage.getList(STORAGE_KEYS.MINYAO)
  };
  return tabMusicMap[tabName] || [];
};
