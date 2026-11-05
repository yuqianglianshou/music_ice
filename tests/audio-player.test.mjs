import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 用最小的假 <audio> 元素在 Node 中测试 AudioPlayer 的播放策略（不涉及真实解码）。
 */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.currentTime = 0;
    this.duration = NaN;
    this.error = null;
    this.volume = 1;
    this.muted = false;
    this.loop = false;
    this.attrs = {};
  }
  set src(value) { this.attrs.src = value; }
  get src() { return this.attrs.src ?? ''; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  load() {}
  pause() { this.paused = true; }
  async play() { this.paused = false; }
  emit(type) { this.dispatchEvent(new Event(type)); }
}
globalThis.Audio = FakeAudio;

const { AudioPlayer, MAX_CONSECUTIVE_ERRORS } = await import('../app/audio-player.js');

let events;
let player;
let hasAlternative;

function createPlayer() {
  return new AudioPlayer({
    defaultVolume: 0.8,
    getNextSong: () => null,
    canPreload: () => true,
    hasAlternative: () => hasAlternative,
    on: {
      loadError: ({ skipped, reachedLimit }) => events.push(skipped ? 'skip' : reachedLimit ? 'stop-limit' : 'stop'),
      restore: time => events.push(`restore:${time}`),
      sourceChange: () => events.push('source')
    }
  });
}

beforeEach(() => {
  events = [];
  hasAlternative = true;
  player = createPlayer();
  // 加载失败时 AudioPlayer 会 console.error，测试中静音
  console.error = () => {};
});

test('初始音量取 defaultVolume；load 设置音源并通知 sourceChange', () => {
  assert.equal(player.volume, 0.8);
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  assert.equal(player.audio.src, 'a.mp3');
  assert.deepEqual(events, ['source']);

  player.load({ id: 'b', audioUrl: '' });
  assert.equal(player.audio.getAttribute('src'), null, '没有音频地址时清空音源');
});

test('用户未要求播放时加载失败：只提示，不跳歌', () => {
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  player.audio.emit('error');
  assert.deepEqual(events.slice(1), ['stop']);
});

test('播放中加载失败：自动跳歌，连续失败达到上限后停止', async () => {
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  await player.play();
  for (let i = 0; i <= MAX_CONSECUTIVE_ERRORS; i++) player.audio.emit('error');
  assert.deepEqual(events.slice(1), [...Array(MAX_CONSECUTIVE_ERRORS).fill('skip'), 'stop-limit']);
  assert.equal(player.wantsPlay, false);
});

test('成功播放一次后失败计数清零', async () => {
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  await player.play();
  player.audio.emit('error');
  player.audio.emit('error');
  player.audio.emit('playing');
  assert.equal(player.consecutiveErrors, 0);
});

test('只有一首歌时加载失败不跳歌', async () => {
  hasAlternative = false;
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  await player.play();
  player.audio.emit('error');
  assert.deepEqual(events.slice(1), ['stop']);
});

test('暂停后晚到的 play() 结果视为过期', async () => {
  const pending = player.play();
  player.pause();
  assert.equal(await pending, false);
  assert.equal(await player.play(), true);
});

test('seek：时长未知时不跳转，超出范围时夹在 [0, duration]', () => {
  assert.equal(player.seek(10), null);
  player.audio.duration = 200;
  assert.equal(player.seek(500), 200);
  assert.equal(player.seek(-3), 0);
  assert.equal(player.seek(42.5), 42.5);
  assert.equal(player.audio.currentTime, 42.5);
});

test('进度恢复：只对对应歌曲生效，接近结尾时从头播放，用一次即清除', () => {
  player.load({ id: 'a', audioUrl: 'a.mp3' });
  player.audio.duration = 200;

  player.setPendingRestore('a', 50);
  assert.equal(player.getPendingRestoreTime('a'), 50);
  assert.equal(player.getPendingRestoreTime('b'), null);
  player.audio.emit('loadedmetadata');
  assert.equal(player.getPendingRestoreTime('a'), null);

  player.setPendingRestore('a', 199.5);
  player.audio.emit('loadedmetadata');
  player.setPendingRestore('b', 50);
  player.audio.emit('loadedmetadata');
  player.setPendingRestore('a', 0);
  assert.equal(player.getPendingRestoreTime('a'), null, '进度为 0 时无需恢复');

  assert.deepEqual(events.filter(e => e.startsWith('restore')), ['restore:50']);
});
