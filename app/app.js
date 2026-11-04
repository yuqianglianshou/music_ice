'use strict';

// 导入必要的模块和依赖
import { CONFIG } from './config.js';
import { LyricsManager } from './lyrics-manager.js';
import { addEventListeners, timeFormatSecondsToMinutes } from './utils.js';
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

// DOM 选择器简写
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

/**
 * 全局状态管理
 */
const IMPORT_SIGNAL_KEY = 'musicIceCatalogUpdatedAt';
const importChannel = 'BroadcastChannel' in window ? new BroadcastChannel('music-ice-importer') : null;
const state = {
  playMode: 0, // 0: 列表循环, 1: 随机播放, 2: 单曲循环
  isPlaying: false,
  catalogReloadTimer: null,
  playRequestId: 0,
  isSeeking: false,
  panelReturnFocus: null,
  queueCategory: ALL_CATEGORY_ID,   // 当前播放队列来自哪个分类
  wantsPlay: false,         // 用户意图是否为“正在播放”，用于区分加载失败时是否自动跳歌
  consecutiveErrors: 0,     // 连续加载失败次数，防止整列表损坏时无限跳歌
  pendingRestore: null,     // 待恢复的播放进度 { songId, time }，等音频元数据就绪后再应用
  lastSnapshotAt: 0
};

// 播放队列：当前歌曲、上一首/下一首、随机顺序都由它负责
const queue = new PlaybackQueue();
// 歌单视图（分类 tab + 列表），在 init 中创建
let playlistView = null;
// 屏幕常亮只服务于看歌词：正在播放且歌词在屏幕上时才保持亮屏
const wakeLock = createWakeLock(() => state.isPlaying && panelControl.isLyricsVisible());

// 连续跳过多少首失败歌曲后停止自动跳歌
const MAX_CONSECUTIVE_ERRORS = 3;
// 播放过程中保存进度快照的最小间隔
const SNAPSHOT_INTERVAL = 5000;
// 当前歌曲已播放超过该秒数时，“上一首”先回到本曲开头（主流播放器的通行做法）
const PREV_RESTART_THRESHOLD = 3;
// 当前歌曲剩余不足该秒数时预加载下一首
const PRELOAD_LEAD_TIME = 30;

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

/**
 * 音频控制相关
 */
const audioControl = {
  audioSource: null,

  initAudioSource() {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = CONFIG.VOLUME.DEFAULT;
    return audio;
  },

  init() {
    this.audioSource = this.initAudioSource();
    this.bindEvents();
    this.updateAudioSource();
  },

  bindEvents() {
    const audio = this.audioSource;
    audio.addEventListener('loadedmetadata', progressControl.updateRange.bind(progressControl));
    audio.addEventListener('durationchange', progressControl.updateRange.bind(progressControl));
    audio.addEventListener('timeupdate', progressControl.updateRunningTime.bind(progressControl));
    audio.addEventListener('ended', playbackControl.handleEnded.bind(playbackControl));
    audio.addEventListener('error', playbackControl.handleAudioError.bind(playbackControl));
    audio.addEventListener('loadedmetadata', applyPendingRestore);

    // 系统也可能直接暂停/恢复音频（来电、拔耳机、蓝牙断开、通知栏按钮），
    // 以音频元素的真实状态为准同步 UI，避免按钮显示“播放中”但实际已停。
    audio.addEventListener('playing', () => {
      state.consecutiveErrors = 0;
      playbackControl.updateUIForPlaying();
      wakeLock.request();
      mediaSession.setPositionState(audio);
    });
    audio.addEventListener('pause', () => {
      playbackControl.updateUIForPaused();
      wakeLock.release();
      mediaSession.setPositionState(audio);
      savePlaybackState();
    });
    ['durationchange', 'seeked', 'ratechange'].forEach(eventName => {
      audio.addEventListener(eventName, () => mediaSession.setPositionState(audio));
    });
  },

  updateAudioSource() {
    const song = queue.current;
    if (!song?.audioUrl) {
      this.audioSource.removeAttribute('src');
      return;
    }

    this.audioSource.src = song.audioUrl;
    preloadControl.release();
    progressControl.reset();
    mediaSession.setPositionState(this.audioSource);
  }
};

/**
 * 预加载下一首：当前歌曲快结束时提前请求下一首的音频、封面和歌词，切歌时更快出声。
 * 单曲循环、暂停、省流量模式下不预加载。
 */
const preloadControl = {
  audio: null,
  preloadedId: '',

  maybePreload() {
    const audio = audioControl.audioSource;
    if (audio.paused || state.playMode === 2 || navigator.connection?.saveData) return;

    const remaining = audio.duration - audio.currentTime;
    if (!Number.isFinite(remaining) || remaining > PRELOAD_LEAD_TIME) return;

    const next = queue.peekNext();
    if (!next || next.id === queue.current?.id || next.id === this.preloadedId) return;
    this.preloadedId = next.id;

    if (next.audioUrl) {
      // 用独立的静音 Audio 元素拉取音频，数据进入浏览器缓存，主播放器切歌时可直接复用
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.muted = true;
      }
      this.audio.src = next.audioUrl;
      this.audio.load();
    }
    if (next.coverUrl) {
      new Image().src = next.coverUrl;
    }
    if (next.lyricsUrl && !next.isInstrumental) {
      fetch(next.lyricsUrl).catch(() => {});
    }
  },

  // 切歌后释放预加载元素占用的解码资源（已下载的数据仍留在缓存中）
  release() {
    this.preloadedId = '';
    if (this.audio?.getAttribute('src')) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }
};

/**
 * 歌词管理器初始化
 */
const lyricsManager = new LyricsManager();
lyricsManager.setTimeUpdateCallback((time) => {
  if (audioControl.audioSource) {
    audioControl.audioSource.currentTime = time;
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
    const requestId = ++state.playRequestId;
    const audio = audioControl.audioSource;
    state.wantsPlay = true;
    // 之前加载失败的音源不会自动重试，重新 load 一次；若仍失败会再次触发 error 事件进入自动跳歌流程
    if (audio.error) {
      audio.load();
    }
    try {
      await audio.play();
      if (requestId !== state.playRequestId) return false;
      this.updateUIForPlaying();
      wakeLock.request();
      return true;
    } catch (error) {
      if (requestId !== state.playRequestId || error?.name === 'AbortError') {
        return false;
      }
      // 音源加载失败时 error 事件已负责提示和自动跳歌，这里不再重复报错覆盖提示
      if (error?.name === 'NotSupportedError' && audio.error) {
        return false;
      }
      console.error('播放失败:', error);
      throw error;
    }
  },

  stopPlayback() {
    state.playRequestId += 1;
    state.wantsPlay = false;
    audioControl.audioSource.pause();
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
      if (audioControl.audioSource.paused) {
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
    const audio = audioControl.audioSource;
    if (!audio.error && audio.currentTime > PREV_RESTART_THRESHOLD) {
      progressControl.seekTo(0);
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

  handleAudioError() {
    const song = queue.current;
    const songName = song?.name || '当前歌曲';
    console.error('音频加载失败:', audioControl.audioSource.error, song);
    this.updateUIForPaused();

    // 只有用户正处于“想要播放”的状态才自动跳歌；页面初始化/恢复时加载失败只提示，不擅自开始播放
    const canSkip = state.wantsPlay &&
      queue.length > 1 &&
      state.consecutiveErrors < MAX_CONSECUTIVE_ERRORS;

    if (!canSkip) {
      const reachedLimit = state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      state.consecutiveErrors = 0;
      state.wantsPlay = false;
      wakeLock.release();
      showNotice(reachedLimit
        ? `连续 ${MAX_CONSECUTIVE_ERRORS + 1} 首无法播放，已停止自动跳过，请检查音频文件`
        : `音频加载失败：${songName}，请检查音频文件是否存在或已损坏`);
      return;
    }

    state.consecutiveErrors += 1;
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
 * 进度条控制
 */
const progressControl = {
  reset() {
    state.isSeeking = false;
    elements.playProgress.forEach((progress, i) => {
      progress.value = 0;
      progress.max = 0;
      elements.playCurrentTime[i].textContent = '00:00';
      elements.playTotalTime[i].textContent = '00:00';
    });
    elements.playColorFill.forEach(fill => {
      fill.style.width = '0%';
    });
  },

  updateRange() {
    const duration = Number.isFinite(audioControl.audioSource.duration)
      ? Math.max(0, audioControl.audioSource.duration)
      : 0;
    elements.playProgress.forEach((progress, i) => {
      // 保留原始时长给进度条，展示文本统一由格式化函数向下取整，避免比歌单多显示 1 秒。
      progress.max = duration;
      elements.playTotalTime[i].textContent = timeFormatSecondsToMinutes(duration);
    });
    this.updateRangeColor();
  },

  updateRunningTime() {
    if (state.isSeeking) return;
    elements.playProgress.forEach((progress, i) => {
      progress.value = audioControl.audioSource.currentTime;
      const currentTimeText = timeFormatSecondsToMinutes(audioControl.audioSource.currentTime);
      elements.playCurrentTime[i].textContent = currentTimeText;
      progress.setAttribute('aria-valuetext', currentTimeText);
    });
    this.updateRangeColor();
    if (lyricsManager && !audioControl.audioSource.paused) {
      lyricsManager.update(audioControl.audioSource.currentTime);
    }

    // 播放中定期保存进度，后台被系统直接回收时也能恢复到接近的位置
    const now = Date.now();
    if (!audioControl.audioSource.paused && now - state.lastSnapshotAt > SNAPSHOT_INTERVAL) {
      savePlaybackState();
    }
    preloadControl.maybePreload();
  },

  updateRangeColor(e) {
    let element = elements.playProgress[0];
    if (e) {
      element = e.target || e;
    }

    const max = Number(element.max);
    const value = Number(element.value);
    const rangeValue = max > 0 ? (value / max) * 100 : 0;
    elements.playColorFill.forEach(fill => {
      fill.style.width = `${rangeValue}%`;
    });

    elements.playProgress.forEach(progress => {
      progress.value = element.value;
    });
  },

  beginSeek(e) {
    e.stopPropagation();
    state.isSeeking = true;
  },

  previewSeek(e) {
    e.stopPropagation();
    const currentTime = this.getSeekTime(e);
    if (currentTime === null) return;
    this.syncProgressUI(currentTime, e.target);
  },

  commitSeek(e) {
    e.stopPropagation();
    const currentTime = this.getSeekTime(e);
    state.isSeeking = false;
    if (currentTime === null) return;
    this.seekTo(currentTime, { fast: true, sourceProgress: e.target });
  },

  /**
   * 跳转到指定秒数，页面进度条和系统媒体控制（通知栏拖动）共用
   */
  seekTo(time, { fast = false, sourceProgress } = {}) {
    const audio = audioControl.audioSource;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const currentTime = Math.max(0, Math.min(duration, Number(time) || 0));

    try {
      if (fast && typeof audio.fastSeek === 'function') {
        audio.fastSeek(currentTime);
      } else {
        audio.currentTime = currentTime;
      }
    } catch (error) {
      audio.currentTime = currentTime;
    }

    this.syncProgressUI(currentTime, sourceProgress);
    if (lyricsManager) {
      lyricsManager.isAutoScrolling = true;
      lyricsManager.update(currentTime);
    }
  },

  getSeekTime(e) {
    const progress = e.target;
    const max = Number(progress.max) || 0;
    if (max <= 0) return null;
    return Math.max(0, Math.min(max, Number(progress.value) || 0));
  },

  syncProgressUI(currentTime, sourceProgress = elements.playProgress[0]) {
    elements.playProgress.forEach(progress => {
      progress.max = sourceProgress.max;
      progress.value = currentTime;
    });
    elements.playCurrentTime.forEach(el => {
      el.textContent = timeFormatSecondsToMinutes(currentTime);
    });
    this.updateRangeColor(sourceProgress);
  }
};

/**
 * 音量控制
 */
const volumeControl = {
  lastVolume: CONFIG.VOLUME.DEFAULT,
  systemVolumeOnly: false,

  change(e) {
    e?.stopPropagation?.();

    const volume = Math.max(0, Math.min(1, Number(elements.volumeRange.value)));
    this.applyVolume(volume);
  },

  applyVolume(volume) {
    const percentage = (volume / Number(elements.volumeRange.max)) * 100;

    elements.volumeRange.value = volume;
    audioControl.audioSource.volume = volume;
    audioControl.audioSource.muted = volume === 0;
    if (volume > 0) {
      this.lastVolume = volume;
    }
    elements.volumeColorFill.style.width = `${percentage}%`;

    this.updateVolumeIcon(volume > 0);
    savePlaybackState();
  },

  changeByClientX(clientX) {
    const rect = elements.volumeRange.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const min = Number(elements.volumeRange.min) || 0;
    const max = Number(elements.volumeRange.max) || 1;
    const volume = min + (max - min) * ratio;
    this.applyVolume(Number(volume.toFixed(2)));
  },

  handleTouch(e) {
    e.stopPropagation();
    e.preventDefault();

    if (this.systemVolumeOnly) return;

    const touch = e.touches?.[0] || e.changedTouches?.[0];
    if (!touch) return;
    this.changeByClientX(touch.clientX);
  },

  updateVolumeIcon(hasSound) {
    if (audioControl.audioSource.muted || audioControl.audioSource.volume === 0) {
      elements.volumeIcon.classList.remove('sound');
      elements.volumeIcon.classList.add('mute');
    } else {
      elements.volumeIcon.classList.add('sound');
      elements.volumeIcon.classList.remove('mute');
    }
  },

  toggleMute(e) {
    e.stopPropagation();
    e.preventDefault();

    audioControl.audioSource.muted = !audioControl.audioSource.muted;

    if (audioControl.audioSource.muted) {
      elements.volumeRange.value = 0;
      elements.volumeColorFill.style.width = '0%';
    } else {
      const restoredVolume = this.lastVolume > 0 ? this.lastVolume : CONFIG.VOLUME.DEFAULT;
      audioControl.audioSource.volume = restoredVolume;
      elements.volumeRange.value = restoredVolume;
      const percentage = (audioControl.audioSource.volume / elements.volumeRange.max) * 100;
      elements.volumeColorFill.style.width = `${percentage}%`;
    }

    this.updateVolumeIcon(!audioControl.audioSource.muted);
    savePlaybackState();
  },

  init(snapshot) {
    this.systemVolumeOnly = this.isSystemVolumeOnly();
    document.documentElement.classList.toggle('system-volume-only', this.systemVolumeOnly);
    elements.volumeRange.disabled = this.systemVolumeOnly;

    // iOS 只能用系统音量，不恢复页面音量
    const savedVolume = Number(snapshot?.volume);
    const canRestore = !this.systemVolumeOnly && Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1;
    const initialVolume = canRestore ? savedVolume : CONFIG.VOLUME.DEFAULT;
    audioControl.audioSource.volume = initialVolume;
    this.lastVolume = initialVolume;
    elements.volumeRange.value = initialVolume;

    const percentage = (initialVolume / elements.volumeRange.max) * 100;
    elements.volumeColorFill.style.width = `${percentage}%`;

    if (canRestore && snapshot.muted) {
      audioControl.audioSource.muted = true;
      elements.volumeRange.value = 0;
      elements.volumeColorFill.style.width = '0%';
    }

    this.updateVolumeIcon(true);
  },

  isSystemVolumeOnly() {
    const ua = navigator.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isiOS;
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
          
          // 检测文本是否溢出，如果溢出则添加跑马灯效果
          setTimeout(() => {
            const songNameContainer = element.closest('.song-name');
            if (songNameContainer) {
              const containerWidth = songNameContainer.offsetWidth;
              const textWidth = element.scrollWidth;
              if (textWidth > containerWidth) {
                songNameContainer.classList.add('marquee');
              } else {
                songNameContainer.classList.remove('marquee');
              }
            }
          }, 100);
        }
      });
    });

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

    audioControl.updateAudioSource();
    playlistView?.updateActiveItem();
    savePlaybackState();

    if (lyricsManager) {
      lyricsManager.clear();
      lyricsManager.loadLyrics(song);
    }
  }
};

/**
 * 用户在歌单中点歌：以当前展示的分类作为新的播放队列
 */
function selectSong(songs, index, categoryId) {
  state.playRequestId += 1;
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
    audioControl.audioSource.loop = state.playMode === 2;

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

  // 进度条事件
  addEventListeners(elements.playProgress, {
    'pointerdown': progressControl.beginSeek.bind(progressControl),
    'touchstart': progressControl.beginSeek.bind(progressControl),
    'input': e => {
      progressControl.previewSeek(e);
    },
    'change': e => {
      progressControl.commitSeek(e);
    },
    'pointerup': progressControl.commitSeek.bind(progressControl),
    'touchend': progressControl.commitSeek.bind(progressControl),
    'click': e => e.stopPropagation()
  });

  // 音量控制事件
  const volumeSlider = elements.volumeRange.closest('.options-soundSlider');
  volumeSlider?.addEventListener("click", e => e.stopPropagation());
  volumeSlider?.addEventListener("pointerdown", e => e.stopPropagation());
  volumeSlider?.addEventListener("touchstart", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  volumeSlider?.addEventListener("touchmove", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  volumeSlider?.addEventListener("touchend", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  elements.volumeRange.addEventListener("input", volumeControl.change.bind(volumeControl));
  elements.volumeRange.addEventListener("change", volumeControl.change.bind(volumeControl));
  elements.volumeRange.addEventListener("click", e => e.stopPropagation());
  elements.volumeRange.addEventListener("pointerdown", e => e.stopPropagation());
  elements.volumeRange.addEventListener("touchstart", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  elements.volumeRange.addEventListener("touchmove", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  elements.volumeRange.addEventListener("touchend", volumeControl.handleTouch.bind(volumeControl), { passive: false });
  elements.volumeIcon.addEventListener("click", volumeControl.toggleMute.bind(volumeControl));

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
  'ArrowRight': () => document.getElementById("btn-next").click()
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
    if (event.data?.type === 'catalog-updated') {
      handleCatalogUpdatedSignal();
    }
  });
}

/**
 * 保存播放状态快照。进度尚未恢复完成时沿用待恢复的进度，避免启动后马上离开把进度覆盖成 0。
 */
function savePlaybackState() {
  const song = queue.current;
  if (!audioControl.audioSource || !song) return;

  const audio = audioControl.audioSource;
  const songId = song.id;
  const pendingTime = state.pendingRestore?.songId === songId ? state.pendingRestore.time : null;

  state.lastSnapshotAt = Date.now();
  savePlaybackSnapshot({
    songId,
    category: state.queueCategory,
    currentTime: pendingTime ?? (audio.currentTime || 0),
    playMode: state.playMode,
    volume: volumeControl.lastVolume,
    muted: audio.muted
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
    const savedTime = Number(snapshot.currentTime);
    state.pendingRestore = savedTime > 0 ? { songId: snapshot.songId, time: savedTime } : null;
    break;
  }

  return snapshot;
}

/**
 * 音频元数据就绪后应用待恢复的进度。只对快照对应的那首歌生效，用户已切歌则丢弃。
 */
function applyPendingRestore() {
  const pending = state.pendingRestore;
  if (!pending) return;
  state.pendingRestore = null;

  const audio = audioControl.audioSource;
  if (queue.current?.id !== pending.songId) return;

  // 上次几乎听完的就从头开始
  const duration = audio.duration;
  if (!Number.isFinite(duration) || pending.time >= duration - 1) return;

  progressControl.seekTo(pending.time);
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
      progressControl.seekTo(details.seekTime, { fast: !!details.fastSeek });
    }
  });
}

/**
 * 应用初始化
 */
function init() {
  queue.setSongs(musicRepository.getSongs(ALL_CATEGORY_ID), 0);
  const snapshot = restorePlaybackSnapshot();

  audioControl.init();
  volumeControl.init(snapshot);
  playModeControl.apply(snapshot?.playMode ?? 0);

  playlistView = new PlaylistView({
    listEl: elements.contentList,
    countEl: elements.playlistCount,
    tabListEl: document.querySelector('.list-tab'),
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

