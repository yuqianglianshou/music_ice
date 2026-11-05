import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 用内存实现替代浏览器 localStorage
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  }
});

const { loadPlaybackSnapshot, savePlaybackSnapshot } = await import('../app/playback-snapshot.js');
const KEY = 'musicIcePlaybackSnapshot';

beforeEach(() => store.clear());

test('保存后能原样读回，并带上版本号和保存时间', () => {
  savePlaybackSnapshot({ songId: '安和桥 - 宋冬野', category: 'minyao', currentTime: 12.5, playMode: 1, volume: 0.6, muted: false });
  const snapshot = loadPlaybackSnapshot();
  assert.equal(snapshot.songId, '安和桥 - 宋冬野');
  assert.equal(snapshot.category, 'minyao');
  assert.equal(snapshot.currentTime, 12.5);
  assert.equal(snapshot.version, 2);
  assert.ok(Number.isFinite(snapshot.savedAt));
});

test('没有快照、内容损坏或版本未知时返回 null', () => {
  assert.equal(loadPlaybackSnapshot(), null);
  store.set(KEY, '{不是 JSON');
  assert.equal(loadPlaybackSnapshot(), null);
  store.set(KEY, JSON.stringify({ version: 99, songId: 'x' }));
  assert.equal(loadPlaybackSnapshot(), null);
});

test('v1 快照迁移：tab 编号转分类 id，“目录/文件名”转歌曲 id', () => {
  store.set(KEY, JSON.stringify({
    version: 1,
    tab: 'tab-I',
    songId: 'minyao/安和桥 - 宋冬野.m4a',
    currentTime: 30,
    playMode: 2
  }));
  const snapshot = loadPlaybackSnapshot();
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.category, 'minyao');
  assert.equal(snapshot.songId, '安和桥 - 宋冬野');
  assert.equal(snapshot.currentTime, 30);
  assert.equal(snapshot.playMode, 2);
  assert.equal('tab' in snapshot, false);
});

test('v1 快照中未知的 tab 退回“全部”', () => {
  store.set(KEY, JSON.stringify({ version: 1, tab: 'tab-Z', songId: 'a/b.mp3' }));
  assert.equal(loadPlaybackSnapshot().category, 'all');
});
