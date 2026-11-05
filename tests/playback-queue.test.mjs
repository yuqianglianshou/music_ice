import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackQueue } from '../app/playback-queue.js';

const songs = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
const ids = list => list.map(song => song?.id ?? null);

test('空队列：current / next / prev / peekNext 都返回 null', () => {
  const queue = new PlaybackQueue();
  assert.equal(queue.length, 0);
  assert.equal(queue.current, null);
  assert.equal(queue.next(), null);
  assert.equal(queue.prev(), null);
  assert.equal(queue.peekNext(), null);
});

test('setSongs 把起始位置限制在列表范围内，并复制传入数组', () => {
  const queue = new PlaybackQueue();
  const source = songs.slice();
  queue.setSongs(source, 99);
  assert.equal(queue.current.id, 'e');
  queue.setSongs(source, -5);
  assert.equal(queue.current.id, 'a');
  source.pop();
  assert.equal(queue.length, 5, '外部数组变化不影响队列');
});

test('顺序模式：next / prev 循环，peekNext 与 next 一致', () => {
  const queue = new PlaybackQueue();
  queue.setSongs(songs, 3);
  assert.equal(queue.peekNext().id, 'e');
  assert.deepEqual(ids([queue.next(), queue.next(), queue.next()]), ['e', 'a', 'b']);
  assert.deepEqual(ids([queue.prev(), queue.prev(), queue.prev()]), ['a', 'e', 'd']);
});

test('随机模式：一轮内每首只播一次，以当前歌曲开头', () => {
  for (let round = 0; round < 50; round++) {
    const queue = new PlaybackQueue();
    queue.setSongs(songs, 2);
    queue.setShuffle(true);
    const played = [queue.current.id];
    for (let i = 1; i < songs.length; i++) {
      const expected = queue.peekNext();
      const actual = queue.next();
      assert.equal(actual, expected, 'peekNext 应预告 next 的结果');
      played.push(actual.id);
    }
    assert.equal(played[0], 'c');
    assert.deepEqual(played.slice().sort(), ['a', 'b', 'c', 'd', 'e']);
  }
});

test('随机模式：prev 沿本轮顺序回退', () => {
  const queue = new PlaybackQueue();
  queue.setSongs(songs, 0);
  queue.setShuffle(true);
  const forward = [queue.current.id, queue.next().id, queue.next().id];
  assert.deepEqual(ids([queue.prev(), queue.prev()]), [forward[1], forward[0]]);
});

test('随机模式：一轮播完时 peekNext 无法预知返回 null，新一轮首曲不与上一首相同', () => {
  for (let round = 0; round < 200; round++) {
    const queue = new PlaybackQueue();
    queue.setSongs(songs, 0);
    queue.setShuffle(true);
    for (let i = 1; i < songs.length; i++) queue.next();
    const last = queue.current.id;
    assert.equal(queue.peekNext(), null);
    assert.notEqual(queue.next().id, last);
  }
});

test('关闭随机后恢复顺序播放', () => {
  const queue = new PlaybackQueue();
  queue.setSongs(songs, 1);
  queue.setShuffle(true);
  queue.setShuffle(false);
  assert.equal(queue.next().id, 'c');
});
