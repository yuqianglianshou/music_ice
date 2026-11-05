import { CATEGORY_META } from './categories.js';
import { parseCatalog } from '../app/catalog-json.js';

/**
 * 分类注册表：页面分类 tab 的顺序、名称和对应歌单都以这里为准。
 * 每项为 CATEGORY_META 的分类信息加上 list（从 catalog/<catalogFile> 读取的歌单数组）。
 *
 * 本模块用顶层 await 读取各分类的 JSON 歌单：引用它的模块（music-store.js、脚本、测试）
 * 会等歌单加载完再执行，因此仍可像普通常量一样同步使用 CATEGORIES。
 */

// Node 中运行的脚本和测试直接读文件；浏览器中用 fetch
const IS_NODE = typeof process !== 'undefined' && !!process.versions?.node;

async function readCatalogText(fileName) {
  const url = new URL(`./${fileName}`, import.meta.url);
  if (IS_NODE) {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function loadCategory(meta) {
  const fileLabel = `catalog/${meta.catalogFile}`;
  try {
    return { ...meta, list: parseCatalog(await readCatalogText(meta.catalogFile), fileLabel) };
  } catch (error) {
    // 脚本和测试需要发现问题，直接报错；页面上只让这个分类为空，其他分类照常可听
    if (IS_NODE) throw error;
    console.error(`歌单加载失败：${fileLabel}`, error);
    return { ...meta, list: [] };
  }
}

export const CATEGORIES = await Promise.all(CATEGORY_META.map(loadCategory));
