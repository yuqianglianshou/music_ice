'use strict';

// 导入必要的模块和依赖
import { CONFIG } from './config.js';
import { LyricsManager } from './lyrics-manager.js';
import { addEventListeners } from './utils.js';
import { musicRepository, ALL_CATEGORY_ID } from './music-store.js';
import { PlaybackQueue } from './playback-queue.js';
import { mediaSession } from './media-session.js';
import { loadPlaybackSnapshot, savePlaybackSnapshot } from './playback-snapshot.js';
import { showNotice, showPlaybackError } from './notice.js';
import { createWakeLock } from './wake-lock.js';
import { downloadSong } from './download.js';
import { setupServiceWorker } from './service-worker-setup.js';
import { initHoverCard } from './hover-card.js';
import { PlaylistView } from './playlist-view.js';
import { AudioPlayer, MAX_CONSECUTIVE_ERRORS } from './audio-player.js';
import { ProgressBar } from './progress-bar.js';
import { VolumeControl } from './volume-control.js';
import { IMPORT_SIGNAL_KEY, IMPORT_CHANNEL_NAME, CATALOG_UPDATED_MESSAGE } from './shared-constants.js';

// DOM 选择器简写
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

/**
 * 全局状态管理
 */
const importChannel = 'BroadcastChannel' in window ? new BroadcastChannel(IMPORT_CHANNEL_NAME) : null;
const state = {
  playMode: 0, // 0: 列表循环, 1: 随机播放, 2: 单曲循环
  isPlaying: false,
  catalogReloadTimer: null,
  panelReturnFocus: null,
  queueCategory: ALL_CATEGORY_ID,   // 当前播放队列来自哪个分类
  lastSnapshotAt: 0
};

// 播放队列：当前歌曲、上一首/下一首、随机顺序都由它负责
const queue = new PlaybackQueue();
// 歌单视图（分类 tab + 列表），在 init 中创建
let playlistView = null;
// 屏幕常亮只服务于看歌词：正在播放且歌词在屏幕上时才保持亮屏
const wakeLock = createWakeLock(() => state.isPlaying && panelControl.isLyricsVisible());

// 播放过程中保存进度快照的最小间隔
const SNAPSHOT_INTERVAL = 5000;
// 当前歌曲已播放超过该秒数时，“上一首”先回到本曲开头（主流播放器的通行做法）
const PREV_RESTART_THRESHOLD = 3;
/**
 * DOM 元素引用
 */
const elements = {
  // 播放信息相关元素
  currentPlayImg400: Array.from($$('[currentPlay-img400]')),
  currentPlayName: $$('[currentPlay-name]'),
  currentPlayAuthor: $$('[currentPlay-author]'),

  // 进度条相关元素
  playProgress: $$("[play-Progress]"),
  playTotalTime: $$("[play-totalTime]"),
  playCurrentTime: $$("[play-currentTime]"),
  playColorFill: $$("[play-colorFill]"),

  // 控制按钮
  playBtns: $$("[play-btn]"),
  playNextBtns: $$("[play-next-btn]"),
  playPrevBtns: $$("[play-prev-btn]"),
  playModeBtn: $("[play-mode]"),
  downloadCurrentAudioBtn: $("[download-current-audio]"),

  // 音量控制
  volumeRange: $("[play-volume-range]"),
  volumeColorFill: $("[play-volume-colorFill]"),
  volumeIcon: $("[play-volume-icon]"),

  // 其他UI元素
  imgBoard: $('.imgBoard'),
  layoutRight: $('.layout-right'),
  songPanel: $('[song-panel]'),
  panelCloseBtn: $('[panel-close-btn]'),
  panelToggleBtn: $('[lyrics-panel-toggle]'),
  contentList: $('[content-list]'),
  playImgBoard: $('[play-img-board]'),
  playlistCount: $('[playlist-count]'),

  // 播放元素组
  playElements: [
    Array.from($$('[currentPlay-img400]')),
    $$('[currentPlay-name]')
  ]
};

// 音频播放器、进度条、音量控制，在 init 中创建
let player = null;
let progressBar = null;
let volumeControl = null;

/**
 * 创建音频播放器，并把音频事件接到界面、屏幕常亮、系统媒体控制和快照上
 */
function createPlayer() {
  return new AudioPlayer({
    defaultVolume: CONFIG.VOLUME.DEFAULT,
    getNextSong: () => queue.peekNext(),
    // 单曲循环时下一首还是本曲，不需要预加载
    canPreload: () => state.playMode !== 2,
    hasAlternative: () => queue.length > 1,
    on: {
      playing: () => {
        playbackControl.updateUIForPlaying();
        wakeLock.request();
      },
      pause: () => {
        playbackControl.updateUIForPaused();
        wakeLock.release();
        savePlaybackState();
      },
      ended: () => playbackControl.handleEnded(),
      timeUpdate: handleTimeUpdate,
      durationChange: duration => progressBar.setDuration(duration),
      sourceChange: () => progressBar.reset(),
      positionChange: () => mediaSession.setPositionState(player.audio),
      restore: time => seekTo(time),
      loadError: detail => playbackControl.handleLoadError(detail)
    }
  });
}

function handleTimeUpdate(currentTime) {
  // 用户正在拖动进度条时不更新进度、歌词和快照
  if (!progressBar.setTime(currentTime)) return;
  if (!player.paused) {
    lyricsManager.update(currentTime);
  }

  // 播放中定期保存进度，后台被系统直接回收时也能恢复到接近的位置
  if (!player.paused && Date.now() - state.lastSnapshotAt > SNAPSHOT_INTERVAL) {
    savePlaybackState();
  }
}

/**
 * 跳转到指定秒数，页面进度条、系统媒体控制（通知栏拖动）和进度恢复共用
 */
function seekTo(time, { fast = false, sourceProgress } = {}) {
  const currentTime = player.seek(time, { fast });
  if (currentTime === null) return;

  progressBar.sync(currentTime, sourceProgress);
  lyricsManager.isAutoScrolling = true;
  lyricsManager.update(currentTime);
}

/**
 * 歌词管理器初始化：点击歌词行跳到对应时间
 */
const lyricsManager = new LyricsManager();
lyricsManager.setTimeUpdateCallback((time) => {
  if (player) {
    player.currentTime = time;
    lyricsManager.update(time);
  }
});

function isCurrentMusic(song) {
  return !!song && song.id === queue.current?.id;
}

function scheduleCatalogReload() {
  clearTimeout(state.catalogReloadTimer);
  state.catalogReloadTimer = setTimeout(() => {
    window.location.reload();
  }, 900);
}

function handleCatalogUpdatedSignal() {
  showNotice('歌单已更新，正在刷新列表...');
  scheduleCatalogReload();
}

/**
 * 播放控制相关函数
 */
const playbackControl = {
  async startPlayback() {
    const started = await player.play();
    if (started) {
      this.updateUIForPlaying();
      wakeLock.request();
    }
    return started;
  },

  stopPlayback() {
    player.pause();
    this.updateUIForPaused();
    wakeLock.release();
  },

  updateUIForPlaying() {
    state.isPlaying = true;
    elements.playBtns.forEach(btn => {
      btn.classList.add("playing");
      btn.classList.remove("pause");
      btn.setAttribute('aria-label', '暂停');
    });
    elements.playImgBoard.classList.add('active');
    mediaSession.setPlaybackState(true);

    playlistView?.updateActiveItem();
  },

  updateUIForPaused() {
    state.isPlaying = false;
    elements.playBtns.forEach(btn => {
      btn.classList.add("pause");
      btn.classList.remove("playing");
      btn.setAttribute('aria-label', '播放');
    });
    elements.playImgBoard.classList.remove('active');
    mediaSession.setPlaybackState(false);
  },

  async playMusic(e) {
    if (e) e.stopPropagation();

    try {
      if (player.paused) {
        await this.startPlayback();
      } else {
        this.stopPlayback();
      }
    } catch (error) {
      console.error('播放失败:', error);
      showPlaybackError(error);
    }
  },
  async playSkipNext(e) {
    if (e) e.stopPropagation();
    if (!queue.next()) return;

    nowPlayingControl.updatePlayInfo();
    await this.startPlayback().catch(error => {
      console.error('播放失败:', error);
      showPlaybackError(error);
    });
  },

  async playSkipPrev(e) {
    if (e) e.stopPropagation();
    if (!queue.length) return;

    // 已播放一段时间时先回到本曲开头，再按一次才切到上一首
    if (!player.hasError && player.currentTime > PREV_RESTART_THRESHOLD) {
      seekTo(0);
    } else {
      queue.prev();
      nowPlayingControl.updatePlayInfo();
    }
    await this.startPlayback().catch(error => {
      console.error('播放失败:', error);
      showPlaybackError(error);
    });
  },

  async handleEnded() {
    this.updateUIForPaused();

    if (state.playMode === 2) return;

    await this.playSkipNext().catch(error => {
      console.error('自动播放下一首失败:', error);
      showPlaybackError(error);
    });
  },

  /**
   * 音频加载失败：是否自动跳歌由 AudioPlayer 判断（用户想播放、还有别的歌、未超过连续失败上限），这里只负责界面
   */
  handleLoadError({ song, skipped, reachedLimit }) {
    const songName = song?.name || '当前歌曲';
    this.updateUIForPaused();

    if (!skipped) {
      wakeLock.release();
      showNotice(reachedLimit
        ? `连续 ${MAX_CONSECUTIVE_ERRORS + 1} 首无法播放，已停止自动跳过，请检查音频文件`
        : `音频加载失败：${songName}，请检查音频文件是否存在或已损坏`);
      return;
    }

    showNotice(`音频加载失败：${songName}，已自动跳到下一首`);
    this.playSkipNext().catch(error => {
      console.error('自动跳过失败歌曲后播放失败:', error);
    });
  }

};
/**
 * 面板控制
 */
const panelControl = {
  isOpen() {
    return elements.songPanel?.classList.contains('active');
  },

  // 桌面端歌词常驻右侧；移动端只有打开面板时歌词才在屏幕上
  isLyricsVisible() {
    return !window.matchMedia('(max-width: 768px)').matches || this.isOpen();
  },

  setPanelOpen(isOpen) {
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
    if (isOpen) {
      state.panelReturnFocus = document.activeElement;
    }

    elements.imgBoard?.classList.toggle('active', isOpen);
    elements.songPanel?.classList.toggle('active', isOpen);
    elements.layoutRight?.classList.toggle('panel-open', isOpen);
    elements.panelToggleBtn?.setAttribute('aria-expanded', String(isOpen));

    if (isMobileViewport && !isOpen && state.panelReturnFocus?.focus) {
      state.panelReturnFocus.focus();
      state.panelReturnFocus = null;
    }

    if (elements.layoutRight) {
      if (isMobileViewport) {
        elements.layoutRight.setAttribute('aria-hidden', String(!isOpen));
        elements.layoutRight.inert = !isOpen;
      } else {
        elements.layoutRight.removeAttribute('aria-hidden');
        elements.layoutRight.inert = false;
      }
    }

    if (isMobileViewport && isOpen) {
      requestAnimationFrame(() => elements.panelCloseBtn?.focus());
    }

    // 屏幕常亮只服务于看歌词：面板关闭后立即释放，避免听歌时一直亮屏耗电
    if (this.isLyricsVisible()) {
      wakeLock.request();
    } else {
      wakeLock.release();
    }
  },

  syncAccessibility() {
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
    const isOpen = this.isOpen();
    if (!elements.layoutRight) return;

    if (isMobileViewport) {
      elements.layoutRight.setAttribute('aria-hidden', String(!isOpen));
      elements.layoutRight.inert = !isOpen;
    } else {
      elements.layoutRight.removeAttribute('aria-hidden');
      elements.layoutRight.inert = false;
    }
    elements.panelToggleBtn?.setAttribute('aria-expanded', String(isOpen));
  },

  togglePanel(e) {
    if (e) e.stopPropagation();

    if (document.fullscreenElement) {
      this.exitFullscreen();
    }

    this.setPanelOpen(!this.isOpen());
  },

  closePanel(e) {
    if (e) e.stopPropagation();
    this.setPanelOpen(false);
  },

  exitFullscreen() {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
};

/**
 * 当前播放信息（封面、歌名、歌手、系统媒体信息、音源、歌词）
 */
const nowPlayingControl = {
  updatePlayInfo() {
    const song = queue.current;
    if (!song) return;
    const songName = song.name || '未知歌曲';
    const author = song.author || '未知歌手';

    elements.playElements.forEach((elementGroup, index) => {
      elementGroup.forEach(element => {
        if (index === 0) {
          // 更新图片
          element.src = song.coverUrl;
          element.alt = element.classList.contains('footer-current-cover') ? '' : `${songName}封面`;
        } else if (index === 1) {
          // 更新歌曲名称
          element.textContent = songName;
          element.title = songName;
        }
      });
    });
    this.scheduleMarqueeCheck();

    elements.currentPlayAuthor.forEach(element => {
      element.textContent = author;
      element.title = author;
    });
    elements.panelToggleBtn?.setAttribute('aria-label', `打开《${songName}》的歌词`);

    mediaSession.setMetadata({
      title: songName,
      artist: author,
      album: song.categoryLabel || 'Music Icee',
      artwork: [song.coverUrl, song.thumbUrl]
    });

    player.load(song);
    playlistView?.updateActiveItem();
    savePlaybackState();

    if (lyricsManager) {
      lyricsManager.clear();
      lyricsManager.loadLyrics(song);
    }
  },

  marqueeFrame: 0,

  /**
   * 歌名溢出时加跑马灯。所有歌名的写入完成后在下一帧统一测量一次，
   * 避免每个元素各起一个定时器、各自强制同步布局；快速切歌时只保留最后一次测量。
   */
  scheduleMarqueeCheck() {
    cancelAnimationFrame(this.marqueeFrame);
    this.marqueeFrame = requestAnimationFrame(() => {
      const measurements = Array.from(elements.currentPlayName, element => {
        const container = element.closest('.song-name');
        return container && { container, overflow: element.scrollWidth > container.offsetWidth };
      }).filter(Boolean);
      // 先集中读取，再集中写 class，读写不交错
      measurements.forEach(({ container, overflow }) => {
        container.classList.toggle('marquee', overflow);
      });
    });
  }
};

/**
 * 用户在歌单中点歌：以当前展示的分类作为新的播放队列
 */
function selectSong(songs, index, categoryId) {
  player.cancelPendingPlay();
  queue.setSongs(songs, index);
  state.queueCategory = categoryId;

  nowPlayingControl.updatePlayInfo();
  playbackControl.startPlayback().catch(error => {
    console.error('播放失败:', error);
    showPlaybackError(error);
  });
}

/**
 * 播放模式控制
 */
const PLAY_MODES = [
  { className: 'listLoop', label: '列表循环' },
  { className: 'randomLoop', label: '随机播放' },
  { className: 'singleLoop', label: '单曲循环' }
];

const playModeControl = {
  cycle(e) {
    e?.stopPropagation();
    this.apply((state.playMode + 1) % PLAY_MODES.length);
    savePlaybackState();
  },

  // 统一设置播放模式及按钮外观，点击切换和启动恢复共用
  apply(mode) {
    state.playMode = PLAY_MODES[mode] ? mode : 0;
    queue.setShuffle(state.playMode === 1);
    player.loop = state.playMode === 2;

    const button = elements.playModeBtn;
    if (!button) return;
    const { className, label } = PLAY_MODES[state.playMode];
    PLAY_MODES.forEach(item => button.classList.remove(item.className));
    button.classList.add(className);
    button.setAttribute('aria-label', `播放模式：${label}`);
    button.title = label;
  }
};

/**
 * 事件监听器初始化
 */
function initEventListeners() {
  // 播放控制事件
  addEventListeners(elements.playBtns, {
    'click': playbackControl.playMusic.bind(playbackControl),
    'dblclick': e => e.stopPropagation()
  });
  addEventListeners(elements.playNextBtns, {
    'click': playbackControl.playSkipNext.bind(playbackControl),
    'dblclick': e => e.stopPropagation()
  });

  addEventListeners(elements.playPrevBtns, {
    'click': playbackControl.playSkipPrev.bind(playbackControl),
    'dblclick': e => e.stopPropagation()
  });

  // 面板控制事件
  elements.panelToggleBtn?.addEventListener('click', panelControl.togglePanel.bind(panelControl));
  elements.layoutRight?.addEventListener('click', panelControl.closePanel.bind(panelControl));

  // 防止面板内部点击关闭
  $('.song_panel')?.addEventListener('click', e => e.stopPropagation());
  elements.panelCloseBtn?.addEventListener('click', panelControl.closePanel.bind(panelControl));
  elements.downloadCurrentAudioBtn?.addEventListener('click', event => {
    event.stopPropagation();
    downloadSong(queue.current);
  });

  initHoverCard({
    list: elements.contentList,
    getSongForItem: item => playlistView?.getSongForItem(item),
    hideOnEnter: [elements.layoutRight, document.querySelector('.app_footer')]
  });

  // 播放模式事件
  elements.playModeBtn.addEventListener("click", playModeControl.cycle.bind(playModeControl));

  // 键盘事件
  document.addEventListener('keydown', handleKeyboardEvents);
  window.addEventListener('resize', () => panelControl.syncAccessibility());
}

/**
 * 键盘事件处理
 */
const keyActionMap = {
  'Enter': () => document.getElementById("btn-play").click(),
  ' ': () => document.getElementById("btn-play").click(),
  'ArrowLeft': () => document.getElementById("btn-prev").click(),
  'ArrowRight': () => document.getElementById("btn-next").click(),
  // “/” 快速聚焦歌单搜索框（常见网页搜索快捷键）
  '/': () => playlistView?.focusSearch()
};

function isEditableTarget(target) {
  if (!target) return false;
  const editableSelector = 'input, textarea, [contenteditable="true"], [contenteditable=""]';
  return !!target.closest?.(editableSelector) || target.isContentEditable === true;
}

function isInteractiveTarget(target) {
  return !!target?.closest?.('button, a, select, input, textarea, [role="option"], [contenteditable]');
}

function handleKeyboardEvents(event) {
  const { key, target } = event;
  if (isEditableTarget(target)) return;

  if (key === 'Escape' && panelControl.isOpen()) {
    event.preventDefault();
    panelControl.closePanel(event);
    return;
  }

  if (isInteractiveTarget(target)) return;

  if (keyActionMap[key]) {
    event.preventDefault();
    keyActionMap[key]();
  }
}

function bindCatalogUpdateEvents() {
  window.addEventListener('storage', event => {
    if (event.key === IMPORT_SIGNAL_KEY && event.newValue) {
      handleCatalogUpdatedSignal();
    }
  });

  importChannel?.addEventListener('message', event => {
    if (event.data?.type === CATALOG_UPDATED_MESSAGE) {
      handleCatalogUpdatedSignal();
    }
  });
}

/**
 * 保存播放状态快照。进度尚未恢复完成时沿用待恢复的进度，避免启动后马上离开把进度覆盖成 0。
 */
function savePlaybackState() {
  const song = queue.current;
  if (!player || !song) return;

  const songId = song.id;
  const pendingTime = player.getPendingRestoreTime(songId);

  state.lastSnapshotAt = Date.now();
  savePlaybackSnapshot({
    songId,
    category: state.queueCategory,
    currentTime: pendingTime ?? player.currentTime,
    playMode: state.playMode,
    volume: volumeControl?.lastVolume ?? CONFIG.VOLUME.DEFAULT,
    muted: player.muted
  });
}

/**
 * 启动时读取快照，定位上次播放的歌曲。只恢复位置，不自动播放（浏览器也会拦截无交互的自动播放）。
 * @returns {object|null} 快照，供音量、播放模式等后续恢复使用
 */
function restorePlaybackSnapshot() {
  const snapshot = loadPlaybackSnapshot();
  if (!snapshot) return null;

  // 先在原分类里找，分类被删或歌曲已迁移到别的分类时退回“全部”
  const candidateCategories = Array.from(new Set([snapshot.category, ALL_CATEGORY_ID]))
    .filter(categoryId => musicRepository.hasCategory(categoryId));
  for (const categoryId of candidateCategories) {
    const list = musicRepository.getSongs(categoryId);
    const index = list.findIndex(song => song.id === snapshot.songId);
    if (index < 0) continue;

    state.queueCategory = categoryId;
    queue.setSongs(list, index);
    player.setPendingRestore(snapshot.songId, Number(snapshot.currentTime));
    break;
  }

  return snapshot;
}

function bindSnapshotEvents() {
  // Android 切到后台或关闭标签页时都会触发这两个事件之一，此时及时落盘
  window.addEventListener('pagehide', savePlaybackState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      savePlaybackState();
    }
  });
}

/**
 * 注册系统媒体控制：通知栏、锁屏、蓝牙耳机/车机按键都会走这里
 */
function bindMediaSessionHandlers() {
  mediaSession.bindHandlers({
    play: () => {
      playbackControl.startPlayback().catch(error => showPlaybackError(error));
    },
    pause: () => playbackControl.stopPlayback(),
    previoustrack: () => playbackControl.playSkipPrev(),
    nexttrack: () => playbackControl.playSkipNext(),
    seekto: details => {
      if (details?.seekTime == null) return;
      seekTo(details.seekTime, { fast: !!details.fastSeek });
    }
  });
}

/**
 * 应用初始化
 */
function init() {
  player = createPlayer();
  progressBar = new ProgressBar({
    progressEls: elements.playProgress,
    currentTimeEls: elements.playCurrentTime,
    totalTimeEls: elements.playTotalTime,
    fillEls: elements.playColorFill,
    onSeek: seekTo
  });
  volumeControl = new VolumeControl({
    rangeEl: elements.volumeRange,
    fillEl: elements.volumeColorFill,
    iconEl: elements.volumeIcon,
    player,
    defaultVolume: CONFIG.VOLUME.DEFAULT,
    onPersist: savePlaybackState
  });

  queue.setSongs(musicRepository.getSongs(ALL_CATEGORY_ID), 0);
  // 恢复快照会设置播放器的待恢复进度，必须在 player 创建之后
  const snapshot = restorePlaybackSnapshot();

  volumeControl.init(snapshot);
  playModeControl.apply(snapshot?.playMode ?? 0);

  playlistView = new PlaylistView({
    listEl: elements.contentList,
    countEl: elements.playlistCount,
    tabListEl: document.querySelector('.list-tab'),
    searchInput: document.querySelector('[playlist-search]'),
    searchClearBtn: document.querySelector('[playlist-search-clear]'),
    categories: musicRepository.getCategories(),
    getSongs: categoryId => musicRepository.getSongs(categoryId),
    isCurrent: isCurrentMusic,
    onSelect: selectSong
  });
  // 列表默认展示当前播放队列所在的分类（恢复快照时即上次的分类）
  playlistView.showCategory(state.queueCategory);

  bindCatalogUpdateEvents();
  initEventListeners();
  wakeLock.bindEvents();
  bindMediaSessionHandlers();
  bindSnapshotEvents();
  nowPlayingControl.updatePlayInfo();
  playbackControl.updateUIForPaused();
  panelControl.syncAccessibility();

  if (snapshot) {
    // 恢复后把上次播放的歌曲滚动到可见位置
    playlistView.scrollToActive();
  }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', async () => {
  const isReloadingForServiceWorkerCleanup = await setupServiceWorker();
  if (isReloadingForServiceWorkerCleanup) return;
  init();
});

