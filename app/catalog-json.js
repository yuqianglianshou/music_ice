/**
 * 歌单 JSON 文件（catalog/*.json）的读写工具。
 *
 * 每个歌单文件是一个条目数组，统一用 2 空格缩进 + 末尾换行的格式保存，
 * 页面加载（catalog/index.js）、导入工具、校验脚本和测试共用这里的函数，保证读写格式一致。
 * 全部是纯函数，不依赖 DOM 和文件系统。
 */

// 条目字段的写入顺序（也是歌单文件中推荐的书写顺序）
export const ENTRY_FIELDS = ['song_name', 'song_file', 'img_file', 'lyrics_file', 'instrumental', 'author', 'time', 'des'];

/**
 * 解析歌单文件内容。
 * @param {string} text 文件内容
 * @param {string} fileLabel 出错时提示用的文件名，如 catalog/minyao.json
 * @returns {object[]} 条目数组
 * @throws 内容不是合法 JSON 或不是数组时抛出带文件名的错误
 */
export function parseCatalog(text, fileLabel = '歌单文件') {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${fileLabel} 不是合法的 JSON：${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`${fileLabel} 的内容应为歌曲条目数组`);
  }
  return data;
}

/**
 * 序列化歌单：2 空格缩进，末尾保留换行
 */
export function serializeCatalog(entries) {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

/**
 * 按导入表单数据生成歌单条目，字段顺序固定。
 * 有歌词文件时写 lyrics_file；没有歌词且标记为纯音乐时写 instrumental: true。
 */
export function buildCatalogEntry({ song_name, song_file, img_file, lyrics_file, instrumental, author, time, des }) {
  const entry = { song_name, song_file, img_file };
  if (lyrics_file) {
    entry.lyrics_file = lyrics_file;
  } else if (instrumental) {
    entry.instrumental = true;
  }
  entry.author = author;
  entry.time = time;
  entry.des = des;
  return entry;
}

export function findCatalogEntryIndex(entries, songFile) {
  return entries.findIndex(entry => entry?.song_file === songFile);
}

/**
 * 在歌单末尾追加条目；同名音频文件的条目已存在时原样返回（避免重复导入）
 * @returns {string} 新的文件内容
 */
export function appendCatalogEntry(text, entry, fileLabel) {
  const entries = parseCatalog(text, fileLabel);
  if (findCatalogEntryIndex(entries, entry.song_file) >= 0) return text;
  return serializeCatalog([...entries, entry]);
}

/**
 * 删除与 song_file、song_name 都匹配的条目
 * @returns {{ text: string, removed: boolean }}
 */
export function removeCatalogEntry(text, { song_file, song_name }, fileLabel) {
  const entries = parseCatalog(text, fileLabel);
  const index = entries.findIndex(entry => entry?.song_file === song_file && entry?.song_name === song_name);
  if (index < 0) return { text, removed: false };
  return { text: serializeCatalog(entries.filter((_, i) => i !== index)), removed: true };
}

export function hasCatalogEntry(text, songFile, fileLabel) {
  return findCatalogEntryIndex(parseCatalog(text, fileLabel), songFile) >= 0;
}
