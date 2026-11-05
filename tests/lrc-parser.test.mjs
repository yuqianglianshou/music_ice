import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLrc } from '../app/lrc-parser.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('支持四种时间格式', () => {
  const { timer } = parseLrc([
    '[00:01.50]两位毫秒',
    '[00:02.250]三位毫秒',
    '[01:03:20]冒号分隔',
    '[02:04]无毫秒'
  ].join('\n'));
  [1.5, 2.25, 63.2, 124].forEach((expected, i) => close(timer[i], expected));
});

test('忽略标签行、空歌词行和无时间戳的行', () => {
  const result = parseLrc([
    '[ti:歌名]',
    '[ar:歌手]',
    '[00:00.00]',
    '纯文本行',
    '[00:01.00]第一句',
    '[00:02.00]   ',
    '[00:03.00]第二句'
  ].join('\n'));
  assert.deepEqual(result.text, ['第一句', '第二句']);
});

test('时间戳后混入 [ti: 标签时只保留前面的歌词', () => {
  assert.deepEqual(parseLrc('[00:05.00]歌词[ti:标题]').text, ['歌词']);
});

test('兼容 Windows 换行（\\r\\n）', () => {
  assert.deepEqual(parseLrc('[00:01.00]一\r\n[00:02.00]二\r\n').text, ['一', '二']);
});

test('同一时间戳的原文和翻译合并为一行，并按时间排序', () => {
  // “英文整段 + 中文整段”结构
  const result = parseLrc([
    '[00:02.00]Second',
    '[00:01.00]First',
    '[00:01.00]第一句',
    '[00:02.00]第二句'
  ].join('\n'));
  assert.deepEqual(result.text, ['First\n第一句', 'Second\n第二句']);
  assert.deepEqual(result.timer, [1, 2]);
});

test('没有翻译时保持文件中的原始顺序', () => {
  assert.deepEqual(parseLrc('[00:02.00]B\n[00:01.00]A').text, ['B', 'A']);
});

test('text 与 timer 数组长度一致；空内容返回空数组', () => {
  assert.deepEqual(parseLrc(''), { text: [], timer: [] });
  assert.deepEqual(parseLrc(null), { text: [], timer: [] });
});

test('media/ 下所有歌词文件都能解析出时间戳有效的歌词', () => {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(lrc|txt)$/i.test(entry.name)) files.push(full);
    }
  })(path.join(import.meta.dirname, '..', 'media'));

  assert.ok(files.length > 0, '应至少有一个歌词文件');
  for (const file of files) {
    const { text, timer } = parseLrc(fs.readFileSync(file, 'utf8'));
    assert.ok(text.length > 0, `${file} 没有解析出任何歌词`);
    assert.equal(text.length, timer.length, file);
    assert.ok(timer.every(Number.isFinite), `${file} 含无法解析的时间戳`);
  }
});
