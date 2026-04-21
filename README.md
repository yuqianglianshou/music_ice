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
├── data/music/                # 按分类拆分的歌单数据
├── js/                        # 页面逻辑
└── music/                     # 音频、歌词、歌曲封面原资源
```

## 命名约定

- JS 模块统一使用 kebab-case，例如 `lyrics-manager.js`、`music-store.js`。
- 歌单数据按分类拆分到 `data/music/`，由 `data/music/index.js` 汇总导出。
- 页面通用静态资源统一放在 `assets/` 下。
