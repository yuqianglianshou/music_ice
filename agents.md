# Agents Guide

本文件给后续在本仓库中工作的 AI agent / 自动化协作者使用。请先阅读 `README.md`，再根据下面约定修改代码或资源。

## 项目概览

`music_ice` 是一个静态网页个人音乐播放器。入口为 `index.html`，无需构建步骤即可运行；页面逻辑位于 `app/`，样式位于 `css/`，歌单数据位于 `catalog/`，音频、歌词和封面原资源位于 `media/`。

线上地址见 `README.md`。

## 主要目录

- `index.html`：页面结构和资源引用。
- `app/`：播放器逻辑、配置、歌词、主题和导入相关 JS 模块。
- `css/`：页面样式。按区域拆分为 `layout.css`（页面骨架）、`player-bar.css`（底部播放栏）、`library-header.css`（歌单头部、分类标签、搜索）、`song-panel.css`（封面、歌曲信息、歌词）、`playlist.css`（歌曲列表、悬浮卡片）、`overrides.css`（后置覆盖规则）；另有 `common.css`（重置与基础样式）、`rules.css`（CSS 变量与工具类）、`response.css`（响应式）、`importer.css`（导入工具）。
- `catalog/`：按分类拆分的歌单数据。`catalog/categories.js` 的 `CATEGORY_META` 是分类元数据的唯一来源（id、名称、目录、歌单文件、tab 顺序），页面、导入工具和校验脚本都读它；`catalog/index.js` 把元数据和歌单数组组装成 `CATEGORIES`。
- `media/`：歌曲音频、歌词和封面原图。
- `assets/`：图标、截图、默认封面及歌曲封面缩略图。
- `tools/import-song.html`：本地浏览器导入歌曲工具。
- `scripts/generate-thumbnails.mjs`：根据歌单数据生成封面缩略图。
- `tests/`：纯逻辑单元测试（`node:test`），运行 `node --test tests/*.test.mjs`。

## 开发与运行

这是静态站点。可在仓库根目录启动本地服务：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/`。

注意：`python3 -m http.server` 不支持 Range 请求，本地无法拖动音频进度、恢复播放进度也会看起来失效；需要验证进度相关功能时，换用支持 Range 的静态服务器。
页面会注册 `sw.js`。JS/CSS/歌单为网络优先，一般不影响调试；如遇异常，可在浏览器开发者工具中注销 Service Worker 并清除站点数据。

如果只修改 HTML、CSS、JS 或歌单数据，通常不需要安装依赖。

## 代码约定

- JS 模块文件名使用 kebab-case，例如 `lyrics-manager.js`、`music-store.js`。
- 保持 ES module 写法，优先沿用现有模块边界和命名风格。
- 修改播放器行为时，优先查看 `app/app.js`、`app/audio-player.js`、`app/music-store.js`、`app/playback-queue.js`、`app/lyrics-manager.js` 和 `app/config.js`。
- 模块分工：`music-store.js` 把 catalog 原始条目转换为只读歌曲模型（`id`、`audioUrl`、`coverUrl`、`thumbUrl`、`lyricsUrl` 等），页面代码只读模型、不要改写 catalog 原始对象；`playback-queue.js` 负责上一首/下一首和随机顺序；`media-session.js` 对接系统媒体控制；`playback-snapshot.js` 保存/恢复播放状态；`playlist-view.js` 负责分类 tab、歌单搜索和歌曲列表的渲染与交互（搜索只在当前分类内按歌名/歌手过滤；点歌通过 `onSelect` 回调交给 `app.js`，传入的始终是完整分类列表而非搜索结果）；`hover-card.js`、`notice.js`、`wake-lock.js`、`download.js`、`service-worker-setup.js` 分别负责悬浮描述、提示、屏幕常亮、下载和 Service Worker 注册（含旧版清理）。`audio-player.js` 封装唯一的 `<audio>` 元素（加载、播放/暂停请求、跳转、预加载下一首、加载失败自动跳歌、启动时恢复进度），不碰界面，通过构造时传入的 `on` 回调通知 `app.js`；`progress-bar.js`、`volume-control.js` 分别负责进度条和音量控件的界面与交互。`lrc-parser.js` 是不依赖 DOM 的 LRC 解析纯函数（时间格式、双语合并），`lyrics-manager.js` 负责歌词加载、渲染、高亮和滚动；调整歌词解析规则时改 `lrc-parser.js` 并补测试。`app.js` 只做播放编排（把播放器事件接到界面、歌词、媒体控制、屏幕常亮和快照，以及面板、播放模式、键盘）和模块组装。`shared-constants.js` 存放播放器与导入工具共用的常量（默认封面清单、导入更新通知的 key 和频道名），两边不要各自重复定义。
- 歌曲 `id` 由音频文件名去扩展名派生，会写入播放状态快照；修改音频文件名会让该歌曲的已保存进度失效，属预期行为。
- 修改视觉样式时，先确认 `css/` 下对应区域文件、`css/common.css`、`css/rules.css`、`css/response.css` 中是否已有可复用规则。`index.html` 中样式文件的加载顺序决定同优先级规则谁生效，不要调换顺序；新规则放进对应区域文件，只有需要覆盖其他文件的规则才放 `overrides.css`。
- 不要为小改动引入构建工具、包管理器或新的运行时依赖。
- 修改程序代码时，给出必要的中文注释，尤其是新增流程、兼容处理或不易一眼看懂的逻辑；不要为显而易见的赋值或简单结构添加冗余注释。

## 歌曲与资源约定

- 新增歌曲时，音频、歌词、封面原图应放入 `media/对应分类/`。
- 歌单条目添加到对应的 `catalog/*.js` 文件中。新增分类时在 `catalog/categories.js` 的 `CATEGORY_META` 中追加一项，新建歌单文件（只导出一个歌单数组），再在 `catalog/index.js` 的 `LISTS_BY_ID` 中登记歌单数组；导入工具会自动读取，无需另配。改完运行 `node scripts/validate-catalog.mjs` 核对一致性。
- 歌单条目字段：`song_name`、`song_file`、`img_file`、`lyrics_file`、`author`、`time`、`des`；纯音乐不写 `lyrics_file`，改写 `instrumental: true`。条目不写 `song_type`、`song_path`、`lyrics_type`（已废弃，校验脚本会报错）：分类名称和资源目录 `media/<分类目录>/` 都由条目所在的歌单文件决定。
- 歌词文件通常使用 `.lrc`。
- 封面原图可放在 `media/` 对应分类下，列表缩略图由脚本生成到 `assets/covers/music-thumbs/`。
- 如果歌曲当前没有专属头像，`img_file` 可能指向 `./assets/covers/defaults/*.jpg` 默认随机图。用户提供图片并说明“给到某首歌的头像”时，应将图片复制到该歌曲所在分类的 `media/对应分类/` 下，使用与歌曲匹配的封面文件名，更新对应 `catalog/*.js` 条目的 `img_file`，再运行 `node scripts/generate-thumbnails.mjs` 生成或更新列表缩略图。
- 用户明确要求封面文件名与歌曲文件名一致时，封面原图应使用 `song_file` 去掉扩展名后的完整文件名，图片扩展名按实际图片格式设置，并同步更新 `img_file` 和对应缩略图文件名。
- 为歌曲替换头像时，不只修改原图；还要确认 `assets/covers/music-thumbs/对应分类/` 下缩略图同步更新，并检查歌单中的 `img_file` 不再指向旧封面或默认封面。
- 新导入歌曲可能缺少 `des` 描述信息。用户要求“补上 des 信息”时，应在对应 `catalog/*.js` 条目中补齐 `des` 字段，描述应简洁、中文、贴合歌曲/歌手/影视或专辑背景，风格与已有歌单描述保持一致；不要改动歌曲名、文件名或排序，除非用户同时要求。
- 资源文件名优先使用 ASCII slug（如 `gangnam-style - psy.mp3`），避免直接使用日文、韩文、带音标字符或其他 Unicode 组合字符作为音频、歌词、封面、缩略图文件名。
- `song_name`、`des` 等展示文本可以保留原文，但应使用 NFC 规范化后的正常字符；不要保留韩文 Jamo 分解字符、日文组合浊点等看起来一样但编码不同的字符。
- 修改资源文件名时，必须同步更新歌单中的 `song_file`、`img_file`、`lyrics_file`，以及 `assets/covers/music-thumbs/` 下对应缩略图，避免本地 macOS 可读取但线上 Linux/静态服务器 404。
- 不要手动改动大量二进制媒体文件，除非任务明确要求。

## 歌词时间轴约定

- 用户说“歌词慢了，提前 Xs”时，应将相关 LRC 时间轴减去 X 秒。
- 用户说“歌词快了，慢 Xs”或“放慢 Xs”时，应将相关 LRC 时间轴加上 X 秒。
- 用户说“这句及以后”时，应包含用户指定的这一句本身，以及它之后的所有歌词时间轴；前面的歌词不动。
- 调整 LRC 时应保留原时间精度：原来是两位毫秒就保留两位，原来是三位毫秒就保留三位；时间不得小于 `00:00.000`。
- 双语歌词要特别小心：如果文件是“英文整段 + 中文整段”的结构，不能简单按文件行号处理“这句及以后”；应按时间点处理，让同一时间点及之后的英文和中文翻译同步调整。
- 用户要求双语歌词“一句歌词一句翻译”时，应在不改变时间轴的前提下，按原顺序交错排列为“原文一行、译文一行”。交错前先确认原文行数和译文行数能一一对应。

## 歌单排序与迁移约定

- 用户要求“排序某分类前 N 首”时，只把指定歌曲移动到该分类列表最前面并按给定顺序排列；未指定歌曲保持原有相对顺序。
- 排序时优先按 `song_name` 精确匹配；用户给的是简称时，可用包含关系匹配，但要避免误匹配，例如“她”不能误选“她说”。
- 排序或批量移动歌单对象后，必须运行 `node --check catalog/对应文件.js`，并用 ES module import 抽查列表数量、空条目和前 N 首顺序。
- 将歌曲从一个分类迁到另一个分类时，必须同步迁移 `media/源分类/` 下的音频、歌词、封面原图，以及 `assets/covers/music-thumbs/源分类/` 下对应缩略图；优先用 `git mv` 保留重命名/移动历史。
- 迁移歌曲后，必须从源 `catalog/*.js` 删除该歌曲对象，并原样加到目标 `catalog/*.js`；资源目录由所在歌单文件决定，条目本身无需改动。
- 迁移完成后，应检查源分类 media 和缩略图目录中没有残留同名资源，并确认目标分类中资源文件存在。

生成或检查缩略图：

```bash
node scripts/generate-thumbnails.mjs
```

同时更新默认封面缩略图：

```bash
node scripts/generate-thumbnails.mjs --defaults
```

仅查看将要生成的文件：

```bash
node scripts/generate-thumbnails.mjs --dry-run
```

注意：缩略图脚本依赖 macOS 自带的 `sips` 命令；脚本通过 import `catalog/index.js` 读取歌单，需要 Node 22+。

校验歌单（引用文件是否存在、大小写/Unicode 是否一致、缺 des、缺缩略图、media 残留文件等）：

```bash
node scripts/validate-catalog.mjs
```

追加 `--durations` 可用 `ffprobe` 核对 `time` 字段与音频实际时长。

## 导入工具

`tools/import-song.html` 用于本地浏览器导入歌曲。修改该工具时，需要同时关注：

- 浏览器 File System Access API 的兼容性。
- 写入 `media/`、追加 `catalog/`、生成缩略图这几类操作是否仍然一致。
- 页面样式应放在 `css/importer.css` 或复用已有样式。

## 验证建议

根据改动范围选择验证方式：

- HTML/CSS/JS 改动：启动本地服务并在桌面和移动视口检查播放器。改动 `app/` 下的逻辑模块时先运行 `node --test tests/*.test.mjs`；新增或修改纯逻辑（不依赖 DOM 的部分）时同步补充测试，测试只用 Node 自带模块，不引入依赖。
- 歌单数据改动：运行 `node scripts/validate-catalog.mjs` 确认没有错误，再确认页面能加载分类、歌曲可播放、封面和歌词路径正确。
- `sw.js` 改动：音频请求必须保持不经过 Service Worker；修改缓存结构时递增 `CACHE_VERSION`。新增音频格式时同步更新 `sw.js` 中的 `AUDIO_PATTERN`。
- 封面资源改动：运行 `node scripts/generate-thumbnails.mjs --dry-run` 或实际生成缩略图。
- 导入工具改动：用本地服务打开 `tools/import-song.html`，至少跑通一次导入流程或手动检查关键路径。

## 协作注意事项

- 仓库包含大量音频和图片资源，搜索文件时优先用 `rg` 或限定目录，避免无谓扫描二进制文件。
- 不要删除或重命名媒体资源，除非已同步更新所有引用它们的歌单数据。
- 保持 README 中的目录说明、命名约定和脚本说明与实际项目一致。
- 修改已有文件前，留意工作区中可能已有用户改动；不要覆盖与当前任务无关的更改。
