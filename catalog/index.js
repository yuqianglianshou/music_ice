import { folkList } from './minyao.js';
import { lightMusicList } from './qingyinyue.js';
import { healingList } from './shangganzhiyu.js';
import { popClassicsList } from './liuxingjingdian.js';
import { rhythmList } from './jiezoulvdong.js';
import { animeScreenList } from './dongmanyingshi.js';

/**
 * 分类注册表：页面分类 tab 的顺序、名称和对应歌单都以这里为准。
 * 新增分类时只需新建 catalog/xxx.js 并在此追加一项（导入工具 app/song-importer.js 另有自己的分类配置，需同步）。
 * - id：分类标识，用于播放状态快照，保持稳定不要随意修改
 * - label：tab 上显示的名称
 * - list：该分类的歌单数组
 */
export const CATEGORIES = [
  { id: 'minyao', label: '民谣', list: folkList },
  { id: 'qingyinyue', label: '轻音乐', list: lightMusicList },
  { id: 'shangganzhiyu', label: '伤感治愈', list: healingList },
  { id: 'liuxingjingdian', label: '流行经典', list: popClassicsList },
  { id: 'jiezoulvdong', label: '节奏律动', list: rhythmList },
  { id: 'dongmanyingshi', label: '动漫影视', list: animeScreenList }
];

// 保留旧的按变量名导出，兼容可能直接引用它的脚本
export const MUSIC_LISTS = {
  folkList,
  lightMusicList,
  healingList,
  popClassicsList,
  rhythmList,
  animeScreenList
};
