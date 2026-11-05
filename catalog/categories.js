/**
 * 分类元数据（唯一来源）：页面 tab、导入工具、校验脚本都从这里读取分类信息。
 * 本文件只放纯数据、不引入歌单，导入工具等只需要分类信息的地方可以单独加载它。
 *
 * 数组顺序即页面 tab 顺序。
 * - id：分类标识，写入播放状态快照和导入工具的“上次分类”，保持稳定不要随意修改
 * - label：tab 上显示的名称，也是该分类歌单条目 song_type 的值
 * - folder：资源目录名，对应 media/<folder>/ 和 assets/covers/music-thumbs/<folder>/
 * - catalogFile：catalog/ 下的歌单文件名
 *
 * 新增分类：在此追加一项，新建 catalog/<catalogFile>（声明 TYPE 和目录常量），
 * 再在 catalog/index.js 的 LISTS_BY_ID 中登记该歌单数组。
 */
export const CATEGORY_META = [
  { id: 'minyao', label: '民谣', folder: 'minyao', catalogFile: 'minyao.js' },
  { id: 'qingyinyue', label: '轻音乐', folder: 'qingyinyue', catalogFile: 'qingyinyue.js' },
  { id: 'shangganzhiyu', label: '伤感治愈', folder: 'shangganzhiyu', catalogFile: 'shangganzhiyu.js' },
  { id: 'liuxingjingdian', label: '流行经典', folder: 'liuxingjingdian', catalogFile: 'liuxingjingdian.js' },
  { id: 'jiezoulvdong', label: '节奏律动', folder: 'jiezoulvdong', catalogFile: 'jiezoulvdong.js' },
  { id: 'dongmanyingshi', label: '动漫影视', folder: 'dongmanyingshi', catalogFile: 'dongmanyingshi.js' }
];

/**
 * 歌单文件中目录常量的命名约定：FILE_MUSIC_ + 目录名大写，
 * 例如 minyao → FILE_MUSIC_MINYAO。导入工具生成条目、校验脚本核对目录时都按此推导。
 */
export function getFolderConstName(category) {
  return `FILE_MUSIC_${category.folder.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}
