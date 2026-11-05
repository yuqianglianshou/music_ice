import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ENTRY_FIELDS,
  parseCatalog,
  serializeCatalog,
  buildCatalogEntry,
  appendCatalogEntry,
  removeCatalogEntry,
  hasCatalogEntry
} from '../app/catalog-json.js';
import { CATEGORY_META } from '../catalog/categories.js';

const sample = [
  { song_name: '甲', song_file: 'a.mp3', img_file: 'a.jpg', lyrics_file: 'a.lrc', author: 'A', time: '03:00', des: '一' },
  { song_name: '乙', song_file: 'b.mp3', img_file: 'b.jpg', instrumental: true, author: 'B', time: '04:00', des: '二' }
];
const text = serializeCatalog(sample);

test('序列化：2 空格缩进、末尾换行，可原样解析回来', () => {
  assert.ok(text.startsWith('[\n  {\n    "song_name": "甲"'));
  assert.ok(text.endsWith(']\n'));
  assert.deepEqual(parseCatalog(text), sample);
});

test('解析失败时错误信息带文件名', () => {
  assert.throws(() => parseCatalog('[{]', 'catalog/x.json'), /catalog\/x\.json 不是合法的 JSON/);
  assert.throws(() => parseCatalog('{"a":1}', 'catalog/x.json'), /catalog\/x\.json 的内容应为歌曲条目数组/);
});

test('buildCatalogEntry：字段顺序固定，有歌词写 lyrics_file，无歌词的纯音乐写 instrumental', () => {
  const base = { song_name: 'n', song_file: 'f.mp3', img_file: 'f.jpg', author: 'a', time: '01:00', des: 'd' };
  const withLyrics = buildCatalogEntry({ ...base, lyrics_file: 'f.lrc', instrumental: false });
  assert.deepEqual(Object.keys(withLyrics), ['song_name', 'song_file', 'img_file', 'lyrics_file', 'author', 'time', 'des']);
  const instrumental = buildCatalogEntry({ ...base, lyrics_file: '', instrumental: true });
  assert.equal(instrumental.instrumental, true);
  assert.equal('lyrics_file' in instrumental, false);
  // 生成的字段都在已知字段内，并保持 ENTRY_FIELDS 的相对顺序
  const keys = Object.keys(instrumental);
  assert.deepEqual(keys, ENTRY_FIELDS.filter(field => keys.includes(field)));
});

test('追加条目：加到末尾，已存在同名音频文件时不重复追加', () => {
  const entry = { song_name: '丙', song_file: 'c.mp3', img_file: 'c.jpg', author: 'C', time: '05:00', des: '三' };
  const next = appendCatalogEntry(text, entry);
  assert.deepEqual(parseCatalog(next).map(item => item.song_file), ['a.mp3', 'b.mp3', 'c.mp3']);
  assert.equal(appendCatalogEntry(next, entry), next);
  assert.ok(hasCatalogEntry(next, 'c.mp3'));
  assert.ok(!hasCatalogEntry(text, 'c.mp3'));
});

test('删除条目：歌名和音频文件都匹配才删除', () => {
  assert.deepEqual(removeCatalogEntry(text, { song_file: 'a.mp3', song_name: '错名' }), { text, removed: false });
  const { text: next, removed } = removeCatalogEntry(text, { song_file: 'a.mp3', song_name: '甲' });
  assert.equal(removed, true);
  assert.deepEqual(parseCatalog(next).map(item => item.song_file), ['b.mp3']);
});

test('真实歌单：均为规范格式，追加再删除后与原文件逐字一致', () => {
  const entry = { song_name: '测试', song_file: '__test__.mp3', img_file: 'x.jpg', instrumental: true, author: 'T', time: '00:01', des: 't' };
  for (const meta of CATEGORY_META) {
    const file = path.join(import.meta.dirname, '..', 'catalog', meta.catalogFile);
    const original = fs.readFileSync(file, 'utf8');
    assert.equal(serializeCatalog(parseCatalog(original)), original, `${meta.catalogFile} 不是规范格式`);
    const appended = appendCatalogEntry(original, entry);
    const { text: restored } = removeCatalogEntry(appended, entry);
    assert.equal(restored, original, meta.catalogFile);
  }
});
