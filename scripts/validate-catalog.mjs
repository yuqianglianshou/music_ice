#!/usr/bin/env node

/**
 * 歌单校验脚本：检查 catalog/ 与 media/、缩略图是否一致。
 *
 * 用法（在仓库根目录）：
 *   node scripts/validate-catalog.mjs              # 基础校验
 *   node scripts/validate-catalog.mjs --durations  # 额外用 ffprobe 核对 time 字段与音频实际时长
 *
 * 错误（退出码 1）：缺少必填字段、引用的文件不存在（含仅大小写或 Unicode 组合方式不同，
 *   这类在 macOS 能读到、线上 Linux 会 404）、歌曲 id 重复、分类目录不存在。
 * 警告：缺 des、time 格式不对、缩略图缺失、展示文本未 NFC 规范化、文件名含日文假名/韩文、
 *   扩展名大写、media/ 下有未被歌单引用的文件、（--durations）时长与 time 相差超过 2 秒。
 *
 * 需要 Node 22+（通过 catalog/index.js 读取 catalog/*.json）。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const checkDurations = process.argv.includes('--durations');
const DURATION_TOLERANCE = 2;
const KANA_OR_HANGUL = /[぀-ヿᄀ-ᇿ㄰-㆏가-힯]/;

const errors = [];
const warnings = [];
const error = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const { CATEGORY_META } = await import(pathToFileURL(path.join(projectRoot, 'catalog/categories.js')).href);
const { ENTRY_FIELDS } = await import(pathToFileURL(path.join(projectRoot, 'app/catalog-json.js')).href);

// 歌单文件缺失或 JSON 语法错误时 catalog/index.js 会直接抛错，这里转成可读的提示
let CATEGORIES;
try {
  ({ CATEGORIES } = await import(pathToFileURL(path.join(projectRoot, 'catalog/index.js')).href));
} catch (loadError) {
  console.log(`歌单加载失败：${loadError.message}`);
  process.exit(1);
}
const { DEFAULT_COVERS } = await import(pathToFileURL(path.join(projectRoot, 'app/shared-constants.js')).href);

// 默认封面清单（编号与 jpg/webp 格式）是手写的，核对每张原图及其缩略图都存在
for (const coverPath of DEFAULT_COVERS) {
  const absolute = path.join(projectRoot, coverPath);
  if (!fs.existsSync(absolute)) {
    error(`默认封面不存在：${coverPath}（检查 app/shared-constants.js 中的默认封面编号和格式）`);
  }
  const thumbPath = path.join(path.dirname(absolute), 'thumbs', path.basename(absolute).replace(/\.[^.]+$/, '.jpg'));
  if (!fs.existsSync(thumbPath)) {
    warn(`默认封面缺少缩略图：${path.relative(projectRoot, thumbPath)}（运行 node scripts/generate-thumbnails.mjs --defaults）`);
  }
}

// catalog/ 下没有对应分类的 JSON 文件（常见于删除或改名分类后的残留）
const catalogFiles = new Set(CATEGORY_META.map(meta => meta.catalogFile));
for (const fileName of fs.readdirSync(path.join(projectRoot, 'catalog'))) {
  if (fileName.endsWith('.json') && !catalogFiles.has(fileName)) {
    warn(`catalog/${fileName} 未在 catalog/categories.js 中登记，页面不会加载它`);
  }
}

// 这些字段已改为由所属分类推导或改用 instrumental，页面不再读取；留在条目里会造成误导
const LEGACY_FIELDS = {
  song_type: '分类名称由所属分类决定',
  song_path: '资源目录由所属分类决定，迁移歌曲时把条目移到目标分类文件即可',
  lyrics_type: '纯音乐请改用 instrumental: true'
};

// 目录内容缓存：key 为目录绝对路径，value 为文件名数组（保留磁盘上的原始写法）
const dirCache = new Map();
function listDir(dir) {
  if (!dirCache.has(dir)) {
    dirCache.set(dir, fs.existsSync(dir) ? fs.readdirSync(dir) : null);
  }
  return dirCache.get(dir);
}

/**
 * 按“线上 Linux 静态服务器”的规则检查文件是否存在：文件名必须逐字节一致。
 * @returns {'ok' | 'missing' | 'case' | 'unicode'}
 */
function checkFile(dir, fileName) {
  const names = listDir(dir);
  if (!names) return 'missing';
  if (names.includes(fileName)) return 'ok';
  if (names.some(name => name.normalize('NFC') === fileName.normalize('NFC'))) return 'unicode';
  if (names.some(name => name.toLowerCase() === fileName.toLowerCase())) return 'case';
  return 'missing';
}

const FILE_PROBLEMS = {
  missing: '文件不存在',
  case: '文件名仅大小写不同（macOS 可读，线上 Linux 会 404）',
  unicode: '文件名 Unicode 组合方式不同（如 NFD/NFC，线上可能 404）'
};

function getDurationSeconds(file) {
  const output = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file
  ], { encoding: 'utf8' });
  return Number.parseFloat(output);
}

function parseTime(time) {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

if (checkDurations) {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
  } catch (_) {
    console.error('--durations 需要 ffprobe（brew install ffmpeg）。');
    process.exit(1);
  }
}

const seenIds = new Map();
const referencedFiles = new Set();
let songCount = 0;

for (const category of CATEGORIES) {
  category.list.forEach((music, index) => {
    songCount += 1;
    const label = `[${category.label} #${index + 1}] ${music?.song_name || '(无歌名)'}`;

    for (const field of ['song_name', 'song_file', 'author']) {
      if (!music?.[field]) error(`${label}：缺少 ${field}`);
    }
    if (!music || typeof music !== 'object' || Array.isArray(music)) {
      error(`${label}：条目应为对象`);
      return;
    }
    for (const field of Object.keys(music)) {
      if (LEGACY_FIELDS[field]) {
        error(`${label}：已废弃字段 ${field}，请删除（${LEGACY_FIELDS[field]}）`);
      } else if (!ENTRY_FIELDS.includes(field)) {
        warn(`${label}：未知字段 ${field}，页面不会读取（可用字段：${ENTRY_FIELDS.join('、')}）`);
      } else if (field !== 'instrumental' && typeof music[field] !== 'string') {
        error(`${label}：${field} 应为字符串`);
      }
    }
    // 纯音乐用 instrumental: true 标记；有歌词文件的歌曲不应标为纯音乐
    if (music && 'instrumental' in music && music.instrumental !== true) {
      error(`${label}：instrumental 只能写 true，非纯音乐请删除该字段`);
    }
    if (music?.instrumental === true && music.lyrics_file) {
      error(`${label}：标记为纯音乐（instrumental）却有 lyrics_file，二者只能保留一个`);
    }
    if (music && music.instrumental !== true && !music.lyrics_file) {
      warn(`${label}：没有歌词文件；如果是纯音乐请加 instrumental: true`);
    }
    if (!music?.song_file) return;

    const mediaDir = path.join(projectRoot, 'media', category.folder);
    if (!listDir(mediaDir)) {
      error(`${label}：分类目录不存在 media/${category.folder}/`);
      return;
    }

    // 歌曲 id 与页面 music-store.js 的派生规则一致：文件名去扩展名
    const id = music.song_file.replace(/\.[^.]+$/, '').normalize('NFC');
    if (seenIds.has(id)) {
      warn(`${label}：歌曲 id「${id}」与 ${seenIds.get(id)} 重复，页面会退回带目录的 id，建议改名`);
    } else {
      seenIds.set(id, label);
    }

    // 音频、封面、歌词三类文件
    const assets = [
      ['音频', music.song_file],
      ['封面', music.img_file],
      ['歌词', music.lyrics_file]
    ];
    for (const [kind, rawName] of assets) {
      const fileName = (rawName || '').trim();
      if (!fileName || /^https?:/.test(fileName)) continue;

      const isDirectPath = fileName.startsWith('./') || fileName.startsWith('/');
      const absolute = isDirectPath
        ? path.join(projectRoot, fileName.replace(/^\.?\//, ''))
        : path.join(mediaDir, fileName);
      const result = checkFile(path.dirname(absolute), path.basename(absolute));
      if (result !== 'ok') {
        error(`${label}：${kind}「${fileName}」${FILE_PROBLEMS[result]}`);
        continue;
      }
      referencedFiles.add(absolute);

      if (!isDirectPath && KANA_OR_HANGUL.test(fileName)) {
        warn(`${label}：${kind}文件名含日文假名或韩文，建议改用 ASCII slug：${fileName}`);
      }
      if (/\.[A-Z0-9]+$/.test(fileName) && /[A-Z]/.test(path.extname(fileName))) {
        warn(`${label}：${kind}扩展名为大写，建议统一小写：${fileName}`);
      }

      // media/ 下的封面应有对应缩略图
      if (kind === '封面' && !isDirectPath) {
        const thumb = path.join(projectRoot, 'assets/covers/music-thumbs', category.folder,
          fileName.replace(/\.[^.]+$/, '.jpg'));
        if (!fs.existsSync(thumb)) {
          warn(`${label}：缺少列表缩略图，请运行 node scripts/generate-thumbnails.mjs`);
        }
      }
    }

    if (!music.des?.trim()) warn(`${label}：缺少 des 描述`);

    const seconds = parseTime(music.time);
    if (seconds === null) {
      warn(`${label}：time「${music.time ?? ''}」不是 mm:ss 格式`);
    } else if (checkDurations) {
      const actual = getDurationSeconds(path.join(mediaDir, music.song_file));
      if (Number.isFinite(actual) && Math.abs(actual - seconds) > DURATION_TOLERANCE) {
        const minutes = Math.floor(actual / 60);
        const rest = String(Math.floor(actual % 60)).padStart(2, '0');
        warn(`${label}：time 为 ${music.time}，实际时长约 ${String(minutes).padStart(2, '0')}:${rest}`);
      }
    }

    for (const field of ['song_name', 'author', 'des']) {
      const value = music[field];
      if (typeof value === 'string' && value !== value.normalize('NFC')) {
        warn(`${label}：${field} 未 NFC 规范化（含组合字符），请转换为正常字符`);
      }
    }
  });
}

// media/ 下未被任何歌单条目引用的文件（常见于迁移分类后的残留）
const mediaRoot = path.join(projectRoot, 'media');
const orphans = [];
for (const dirName of listDir(mediaRoot) || []) {
  const dir = path.join(mediaRoot, dirName);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const fileName of listDir(dir)) {
    if (fileName.startsWith('.')) continue;
    if (!referencedFiles.has(path.join(dir, fileName))) {
      orphans.push(`media/${dirName}/${fileName}`);
    }
  }
}
if (orphans.length) {
  warn(`media/ 下有 ${orphans.length} 个文件未被歌单引用：\n    ${orphans.join('\n    ')}`);
}

console.log(`已检查 ${CATEGORIES.length} 个分类、${songCount} 首歌曲。`);
if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 条：`);
  warnings.forEach(message => console.log(`  ⚠ ${message}`));
}
if (errors.length) {
  console.log(`\n错误 ${errors.length} 条：`);
  errors.forEach(message => console.log(`  ✗ ${message}`));
  process.exit(1);
}
console.log(warnings.length ? '\n没有错误。' : '\n全部通过。');
