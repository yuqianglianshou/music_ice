#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, 'data/music');
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

function parseConstants(source) {
  const constants = new Map();
  const constantPattern = /const\s+([A-Za-z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = constantPattern.exec(source))) {
    constants.set(match[1], match[2]);
  }

  return constants;
}

function parseStringField(block, fieldName) {
  const fieldPattern = new RegExp(`${fieldName}\\s*:\\s*(['"])(.*?)\\1`);
  return block.match(fieldPattern)?.[2] || '';
}

function parseSongPath(block, constants) {
  const songPathMatch = block.match(/song_path\s*:\s*([^,\n]+)/);
  if (!songPathMatch) return '';

  const rawValue = songPathMatch[1].trim().replace(/['"]/g, '');
  return constants.get(rawValue) || rawValue;
}

function collectMusicImages() {
  const images = [];

  for (const fileName of fs.readdirSync(dataDir).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dataDir, fileName), 'utf8');
    const constants = parseConstants(source);
    const objectPattern = /\{\s*song_type:[\s\S]*?\n\s*\}/g;
    let match;

    while ((match = objectPattern.exec(source))) {
      const block = match[0];
      const imgFile = parseStringField(block, 'img_file').trim();
      if (!imgFile || imgFile === ' ' || imgFile.startsWith('http')) continue;

      const songPath = parseSongPath(block, constants);
      const sourcePath = imgFile.startsWith('./')
        ? path.join(projectRoot, imgFile)
        : path.join(projectRoot, 'music', songPath, imgFile);

      if (!toPosix(sourcePath).includes('/music/')) continue;

      const relativeSource = toPosix(path.relative(projectRoot, sourcePath));
      const thumbRelative = relativeSource
        .replace(/^music\//, 'assets/covers/music-thumbs/')
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
  return fs.statSync(source).mtimeMs > fs.statSync(target).mtimeMs;
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
  ...collectMusicImages(),
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
