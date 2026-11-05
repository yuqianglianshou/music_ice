/**
 * 分类元数据（唯一来源）：页面 tab、导入工具、校验脚本都从这里读取分类信息。
 * 本文件只放纯数据、不引入歌单，导入工具等只需要分类信息的地方可以单独加载它。
 *
 * 数组顺序即页面 tab 顺序。
 * - id：分类标识，写入播放状态快照和导入工具的“上次分类”，保持稳定不要随意修改
 * - label：tab 上显示的名称，也是该分类歌曲在列表中显示的分类名
 * - folder：资源目录名，对应 media/<folder>/ 和 assets/covers/music-thumbs/<folder>/
 * - catalogFile：catalog/ 下的歌单文件名（JSON 条目数组，格式见 app/catalog-json.js）
 *
 * 新增分类：在此追加一项，并新建 catalog/<catalogFile>（内容为 []），页面和导入工具会自动读取。
 * 歌单条目不再写 song_type / song_path：分类名称和资源目录都由所属分类决定。
 */
export const CATEGORY_META = [
  { id: 'minyao', label: '民谣', folder: 'minyao', catalogFile: 'minyao.json' },
  { id: 'qingyinyue', label: '轻音乐', folder: 'qingyinyue', catalogFile: 'qingyinyue.json' },
  { id: 'shangganzhiyu', label: '伤感治愈', folder: 'shangganzhiyu', catalogFile: 'shangganzhiyu.json' },
  { id: 'liuxingjingdian', label: '流行经典', folder: 'liuxingjingdian', catalogFile: 'liuxingjingdian.json' },
  { id: 'jiezoulvdong', label: '节奏律动', folder: 'jiezoulvdong', catalogFile: 'jiezoulvdong.json' },
  { id: 'dongmanyingshi', label: '动漫影视', folder: 'dongmanyingshi', catalogFile: 'dongmanyingshi.json' }
];
