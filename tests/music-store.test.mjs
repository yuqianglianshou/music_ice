import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../catalog/index.js';
import { CATEGORY_META } from '../catalog/categories.js';
import { DEFAULT_COVERS } from '../app/shared-constants.js';

// music-store 启动时会清理 localStorage 中的旧键，Node 中用空实现代替
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});
const { musicRepository, ALL_CATEGORY_ID } = await import('../app/music-store.js');

/**
 * 用真实歌单检查 music-store 生成的歌曲模型满足页面依赖的约定。
 * 文件是否存在等数据问题由 scripts/validate-catalog.mjs 负责，这里只测转换规则。
 */

const all = musicRepository.getSongs(ALL_CATEGORY_ID);

test('分类顺序：“全部”在最前，其余与 CATEGORY_META 一致', () => {
  assert.deepEqual(
    musicRepository.getCategories().map(category => category.id),
    [ALL_CATEGORY_ID, ...CATEGORY_META.map(meta => meta.id)]
  );
});

test('“全部”按分类顺序汇总各分类歌曲', () => {
  const merged = CATEGORY_META.flatMap(meta => musicRepository.getSongs(meta.id));
  assert.deepEqual(all, merged);
  assert.equal(all.length, CATEGORIES.reduce((sum, category) => sum + category.list.length, 0));
});

test('歌曲 id 唯一，由音频文件名去扩展名派生（NFC 规范化）', () => {
  const ids = new Set(all.map(song => song.id));
  assert.equal(ids.size, all.length);
  for (const song of all) {
    assert.equal(song.id.includes('/') ? song.id.split('/').pop() : song.id,
      song.fileName.replace(/\.[^.]+$/, '').normalize('NFC'));
  }
});

test('资源地址位于所属分类目录，分类名称取自分类配置', () => {
  for (const meta of CATEGORY_META) {
    for (const song of musicRepository.getSongs(meta.id)) {
      assert.equal(song.categoryId, meta.id);
      assert.equal(song.categoryLabel, meta.label);
      assert.ok(song.audioUrl.startsWith(`./media/${meta.folder}/`), song.audioUrl);
      if (song.lyricsUrl) assert.ok(song.lyricsUrl.startsWith(`./media/${meta.folder}/`), song.lyricsUrl);
    }
  }
});

test('封面：专属封面的缩略图在 music-thumbs，默认封面的缩略图在 defaults/thumbs', () => {
  for (const song of all) {
    assert.ok(song.coverUrl, `${song.id} 缺少封面`);
    assert.ok(song.thumbUrl.endsWith('.jpg'), song.thumbUrl);
    if (DEFAULT_COVERS.includes(song.coverUrl)) {
      assert.ok(song.thumbUrl.startsWith('./assets/covers/defaults/thumbs/'), song.thumbUrl);
    } else if (song.coverUrl.startsWith('./media/')) {
      assert.ok(song.thumbUrl.startsWith('./assets/covers/music-thumbs/'), song.thumbUrl);
    }
  }
});

test('纯音乐没有歌词地址', () => {
  for (const song of all.filter(item => item.isInstrumental)) {
    assert.equal(song.lyricsUrl, '', song.id);
  }
});

test('歌曲模型只读，findSongById 能找回同一对象', () => {
  const song = all[0];
  assert.ok(Object.isFrozen(song));
  assert.ok(Object.isFrozen(all));
  assert.equal(musicRepository.findSongById(song.id), song);
  assert.equal(musicRepository.findSongById('不存在'), null);
  assert.deepEqual(musicRepository.getSongs('不存在的分类'), []);
});
