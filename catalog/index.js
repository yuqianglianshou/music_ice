import { CATEGORY_META } from './categories.js';
import { folkList } from './minyao.js';
import { lightMusicList } from './qingyinyue.js';
import { healingList } from './shangganzhiyu.js';
import { popClassicsList } from './liuxingjingdian.js';
import { rhythmList } from './jiezoulvdong.js';
import { animeScreenList } from './dongmanyingshi.js';

// 分类 id → 歌单数组。分类的名称、目录、顺序统一在 catalog/categories.js 中维护，这里只负责挂上歌单数据。
const LISTS_BY_ID = {
  minyao: folkList,
  qingyinyue: lightMusicList,
  shangganzhiyu: healingList,
  liuxingjingdian: popClassicsList,
  jiezoulvdong: rhythmList,
  dongmanyingshi: animeScreenList
};

/**
 * 分类注册表：页面分类 tab 的顺序、名称和对应歌单都以这里为准。
 * 每项为 CATEGORY_META 的分类信息加上 list（该分类的歌单数组）。
 * 元数据和歌单登记不一致时只打印错误并跳过，避免一处笔误导致整个页面无法加载；
 * scripts/validate-catalog.mjs 会把这种不一致当作错误报出。
 */
export const CATEGORIES = CATEGORY_META.flatMap(meta => {
  const list = LISTS_BY_ID[meta.id];
  if (!Array.isArray(list)) {
    console.error(`分类 ${meta.id} 未在 catalog/index.js 的 LISTS_BY_ID 中登记歌单，已跳过。`);
    return [];
  }
  return [{ ...meta, list }];
});

// 保留旧的按变量名导出，兼容可能直接引用它的脚本
export const MUSIC_LISTS = {
  folkList,
  lightMusicList,
  healingList,
  popClassicsList,
  rhythmList,
  animeScreenList
};
