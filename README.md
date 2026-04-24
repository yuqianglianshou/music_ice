# music_ice
网页版个人音乐播放器

## 目录结构

```txt
.
├── index.html
├── assets/
│   ├── icons/                 # 页面图标和 SVG symbol
│   └── covers/
│       ├── defaults/          # 默认封面原图
│       ├── defaults/thumbs/   # 默认封面列表缩略图
│       └── music-thumbs/      # 歌曲封面列表缩略图
├── css/                       # 页面样式
├── app/                       # 页面逻辑
├── catalog/                   # 按分类拆分的歌单数据
└── media/                     # 音频、歌词、歌曲封面原资源
```

## 命名约定

- JS 模块统一使用 kebab-case，例如 `lyrics-manager.js`、`music-store.js`。
- 歌单数据按分类拆分到 `catalog/`，由 `catalog/index.js` 汇总导出。
- 页面通用静态资源统一放在 `assets/` 下。

## 生成封面缩略图

添加歌曲封面大图到 `media/` 对应分类目录后，运行：

```bash
node scripts/generate-thumbnails.mjs
```

脚本会读取 `catalog/*.js` 中的 `img_file`，自动生成缺失或过期的 `assets/covers/music-thumbs/**/*.jpg` 列表小图。
如需同时更新默认封面缩略图，可追加 `--defaults`。
