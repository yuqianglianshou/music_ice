import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeFormatSecondsToMinutes, escapeHtml } from '../app/utils.js';

test('timeFormatSecondsToMinutes 向下取整到秒，负数按 0 处理', () => {
  assert.equal(timeFormatSecondsToMinutes(0), '0:00');
  assert.equal(timeFormatSecondsToMinutes(5.99), '0:05');
  assert.equal(timeFormatSecondsToMinutes(170), '2:50');
  assert.equal(timeFormatSecondsToMinutes(3600), '60:00');
  assert.equal(timeFormatSecondsToMinutes(-3), '0:00');
});

test('escapeHtml 转义 HTML 特殊字符，null/undefined 视为空串', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
