#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, 'catalog');
const thumbSize = 160;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const includeDefaults = process.argv.includes('--defaults');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function quoteForLog(filePath) {
  return toPosix(path.relative(projectRoot, filePath));
}

function ensureSips() {
  try {
    execFileSync('sips', ['--help'], { stdio: 'ignore' });
  } catch (_) {
    console.error('需要 macOS 自带的 sips 命令来生成缩略图。');
    process.exit(1);
  }
}

/**
 * 直接 import catalog/index.js 读取歌单（catalog/*.json），与页面使用同一份数据。
 * 需要 Node 22+。
 */
async function collectMusicImages() {
  const { CATEGORIES } = await import(pathToFileURL(path.join(dataDir, 'index.js')).href);
  const images = [];

  for (const { list, folder } of CATEGORIES) {
    for (const music of list) {
      const imgFile = (music.img_file || '').trim();
      if (!imgFile || imgFile.startsWith('http')) continue;

      const sourcePath = imgFile.startsWith('./')
        ? path.join(projectRoot, imgFile)
        : path.join(projectRoot, 'media', folder, imgFile);

      // 默认封面（assets/covers/defaults）由 --defaults 单独处理
      if (!toPosix(sourcePath).includes('/media/')) continue;

      const relativeSource = toPosix(path.relative(projectRoot, sourcePath));
      const thumbRelative = relativeSource
        .replace(/^media\//, 'assets/covers/music-thumbs/')
        .replace(/\.[^.]+$/, '.jpg');

      images.push({
        source: sourcePath,
        target: path.join(projectRoot, thumbRelative)
      });
    }
  }

  return images;
}

function collectDefaultImages() {
  const defaultsDir = path.join(projectRoot, 'assets/covers/defaults');
  if (!fs.existsSync(defaultsDir)) return [];

  return fs.readdirSync(defaultsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
    .map(entry => {
      const source = path.join(defaultsDir, entry.name);
      const target = path.join(
        defaultsDir,
        'thumbs',
        entry.name.replace(/\.[^.]+$/, '.jpg')
      );
      return { source, target };
    });
}

function shouldGenerate(source, target) {
  if (!fs.existsSync(source)) {
    console.warn(`跳过，源图不存在: ${quoteForLog(source)}`);
    return false;
  }

  if (force || !fs.existsSync(target)) return true;

  const targetStats = fs.statSync(target);
  if (targetStats.size <= 0) return true;

  return fs.statSync(source).mtimeMs > targetStats.mtimeMs;
}

function generateThumbnail(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync('sips', [
    '-s',
    'format',
    'jpeg',
    '-Z',
    String(thumbSize),
    source,
    '--out',
    target
  ], { stdio: 'ignore' });
}

ensureSips();

const targets = [
  ...(await collectMusicImages()),
  ...(includeDefaults ? collectDefaultImages() : [])
];
const uniqueTargets = new Map(targets.map(item => [item.target, item]));
const pending = [...uniqueTargets.values()].filter(item => shouldGenerate(item.source, item.target));

if (!pending.length) {
  console.log('所有缩略图都是最新的。');
  process.exit(0);
}

for (const { source, target } of pending) {
  console.log(`${dryRun ? '将生成' : '生成'}: ${quoteForLog(target)} <- ${quoteForLog(source)}`);
  if (!dryRun) {
    generateThumbnail(source, target);
  }
}

console.log(`${dryRun ? '需要生成' : '已生成'} ${pending.length} 张缩略图。`);
