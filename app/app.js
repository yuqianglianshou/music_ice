'use strict';

// 导入必要的模块和依赖
import { CONFIG } from './config.js';
import { LyricsManager } from './lyrics-manager.js';
import { addEventListeners, timeFormatSecondsToMinutes } from './utils.js';
import { getMusicList, MusicStorage, FILE_MUSIC_ROOT } from './music-store.js';

// DOM 选择器简写
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

/**
 * 全局状态管理
 */
const initialMusicList = MusicStorage.getListAllMusic();
const IMPORT_SIGNAL_KEY = 'musicIceCatalogUpdatedAt';
const importChannel = 'BroadcastChannel' in window ? new BroadcastChannel('music-ice-importer') : null;
const state = {
  currentMusicIndex: 0,
  playMode: 0, // 0: 列表循环, 1: 随机播放, 2: 单曲循环
  isShuffle: false,
  wakeLock: null,
  wakeLockEventsBound: false,
  isPlaying: false,
  isListScrolling: false,
  listScrollTimer: null,
  hoverItem: null,
  noticeTimer: null,
  catalogReloadTimer: null,
  playRequestId: 0,
  lastSelectIdentity: '',
  lastSelectAt: 0,
  isSeeking: false,
  currentMusicList: initialMusicList,
  displayMusicList: initialMusicList
};

/**
 * DOM 元素引用
 */
const elements = {
  // 播放信息相关元素
  currentPlayImg400: Array.from($$('[currentPlay-img400]')),
  currentPlayName: $$('[currentPlay-name]'),

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
  contentList: $('[content-list]'),
  playImgBoard: $('[play-img-board]'),
  notice: $('[app-notice]'),

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
  },

  updateAudioSource() {
    if (!normalizeCurrentIndex()) {
      this.audioSource.removeAttribute('src');
      return;
    }

    const currentMusic = state.currentMusicList[state.currentMusicIndex];
    const songDir = currentMusic.song_path || currentMusic.type_path;
    const songFile = currentMusic.song_file || currentMusic.name_path;
    if (!songDir || !songFile) return;

    const audioUrl = FILE_MUSIC_ROOT + songDir + songFile;
    this.audioSource.src = audioUrl;
    progressControl.reset();
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

// 修改默认图片数组的生成方式
const WEBP_DEFAULT_IMAGE_IDS = new Set([18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33]);
const DEFAULT_IMAGES = Array.from({ length: 53 }, (_, i) => {
  const id = i + 1;
  return `./assets/covers/defaults/${id}.${WEBP_DEFAULT_IMAGE_IDS.has(id) ? 'webp' : 'jpg'}`;
});
let defaultImageIndex = 0; // 添加一个索引计数器

// 优化获取随机默认图片的函数
function getRandomDefaultImage() {
  // 使用递增索引而不是随机数，确保均匀分配
  defaultImageIndex = (defaultImageIndex + 1) % DEFAULT_IMAGES.length;
  return DEFAULT_IMAGES[defaultImageIndex];
}

function resolveMusicAssetPath(music, assetPath) {
  const normalized = (assetPath || '').trim();
  if (!normalized) return '';
  if (
    normalized.startsWith('./') ||
    normalized.startsWith('/') ||
    normalized.startsWith('http')
  ) {
    return normalized;
  }
  return `${FILE_MUSIC_ROOT}${music.song_path || music.type_path || ''}${normalized}`;
}

function resolveListThumbnailPath(assetPath) {
  const normalized = (assetPath || '').trim();
  if (!normalized || normalized.startsWith('http') || normalized.startsWith('/')) {
    return normalized;
  }

  const jpgPath = normalized.replace(/\.[^.\/]+$/, '.jpg');
  if (jpgPath.startsWith('./assets/covers/defaults/')) {
    return jpgPath.replace('./assets/covers/defaults/', './assets/covers/defaults/thumbs/');
  }
  if (jpgPath.startsWith('./media/')) {
    return jpgPath.replace('./media/', './assets/covers/music-thumbs/');
  }
  return normalized;
}

function prepareMusicImage(music) {
  const rawImagePath = music.original_img_file ?? music.img_file;
  const normalizedRawPath = (rawImagePath || '').trim();
  const fullImagePath = normalizedRawPath
    ? resolveMusicAssetPath(music, normalizedRawPath)
    : getRandomDefaultImage();

  music.original_img_file = normalizedRawPath || fullImagePath;
  music.img_file = fullImagePath;
  music.list_img_file = resolveListThumbnailPath(fullImagePath) || fullImagePath;
  delete music.imgPath;
}

function normalizeCurrentIndex() {
  const length = state.currentMusicList.length;
  if (!length) {
    state.currentMusicIndex = 0;
    return false;
  }
  state.currentMusicIndex = ((state.currentMusicIndex % length) + length) % length;
  return true;
}

function getMusicIdentity(music) {
  if (!music) return '';
  return `${music.song_path || music.type_path || ''}${music.song_file || music.name_path || ''}`;
}

function getMusicAudioUrl(music) {
  if (!music) return '';
  const songDir = music.song_path || music.type_path;
  const songFile = music.song_file || music.name_path;
  if (!songDir || !songFile) return '';
  return FILE_MUSIC_ROOT + songDir + songFile;
}

function getAbsoluteAssetUrl(assetUrl) {
  try {
    return new URL(assetUrl, window.location.href).href;
  } catch (_) {
    return assetUrl;
  }
}

function getDownloadFileName(music) {
  const songFile = music.song_file || music.name_path || 'music.mp3';
  const extension = songFile.includes('.') ? songFile.slice(songFile.lastIndexOf('.')) : '.mp3';
  const songName = music.song_name || music.title || songFile.replace(/\.[^.]+$/, '') || 'music';
  const author = music.author ? ` - ${music.author}` : '';
  return `${songName}${author}${extension}`.replace(/[\\/:*?"<>|]/g, '_');
}

function isCurrentMusic(music) {
  return getMusicIdentity(music) === getMusicIdentity(state.currentMusicList[state.currentMusicIndex]);
}

function isMobileInteraction() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function canUseHover() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function showNotice(message) {
  if (!elements.notice) return;

  elements.notice.textContent = message;
  elements.notice.classList.add('visible');
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => {
    elements.notice.classList.remove('visible');
  }, 3600);
}

function showPlaybackError(error, prefix = '播放失败') {
  const detail = error?.message ? `：${error.message}` : '';
  showNotice(`${prefix}${detail}，请检查音频文件是否存在或已损坏`);
}

function triggerDownload(url, fileName, revokeUrl = false) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    if (revokeUrl) {
      URL.revokeObjectURL(url);
    }
  }, 3000);
}

async function downloadCurrentAudio(event) {
  event?.stopPropagation();

  if (!normalizeCurrentIndex()) {
    showNotice('暂无可下载的音频');
    return;
  }

  const currentMusic = state.currentMusicList[state.currentMusicIndex];
  const audioUrl = getMusicAudioUrl(currentMusic);
  const fileName = getDownloadFileName(currentMusic);
  if (!audioUrl) {
    showNotice('音频文件不可用，请检查文件路径');
    return;
  }

  showNotice('正在准备下载音频...');

  try {
    const response = await fetch(getAbsoluteAssetUrl(audioUrl));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('empty audio file');
    }

    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, fileName, true);
    showNotice('开始下载音频');
  } catch (error) {
    console.warn('Blob 下载失败，尝试直接下载:', error);
    triggerDownload(getAbsoluteAssetUrl(audioUrl), fileName);
    showNotice('开始下载音频');
  }
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
    try {
      await audioControl.audioSource.play();
      if (requestId !== state.playRequestId) return false;
      this.updateUIForPlaying();
      requestWakeLock();
      return true;
    } catch (error) {
      if (requestId !== state.playRequestId || error?.name === 'AbortError') {
        return false;
      }
      console.error('播放失败:', error);
      throw error;
    }
  },

  stopPlayback() {
    state.playRequestId += 1;
    audioControl.audioSource.pause();
    this.updateUIForPaused();
    releaseWakeLock();
  },

  updateUIForPlaying() {
    state.isPlaying = true;
    elements.playBtns.forEach(btn => {
      btn.classList.add("playing");
      btn.classList.remove("pause");
    });
    elements.playImgBoard.classList.add('active');

    playlistControl.updateActiveItem();
  },

  updateUIForPaused() {
    state.isPlaying = false;
    elements.playBtns.forEach(btn => {
      btn.classList.add("pause");
      btn.classList.remove("playing");
    });
    elements.playImgBoard.classList.remove('active');
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
    if (!normalizeCurrentIndex()) return;
    const length = state.currentMusicList.length;

    if (state.isShuffle) {
      playModeControl.shuffleMusic();
    } else {
      state.currentMusicIndex = (state.currentMusicIndex + 1) % length;
    }

    playlistControl.updatePlayInfo();
    await this.startPlayback().catch(error => {
      console.error('播放失败:', error);
      showPlaybackError(error);
    });
  },

  async playSkipPrev(e) {
    if (e) e.stopPropagation();
    if (!normalizeCurrentIndex()) return;
    const length = state.currentMusicList.length;

    if (state.isShuffle) {
      playModeControl.shuffleMusic();
    } else {
      state.currentMusicIndex = (state.currentMusicIndex - 1 + length) % length;
    }

    playlistControl.updatePlayInfo();
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
    const currentMusic = state.currentMusicList[state.currentMusicIndex];
    const songName = currentMusic?.song_name || currentMusic?.title || '当前歌曲';
    console.error('音频加载失败:', audioControl.audioSource.error, currentMusic);
    this.updateUIForPaused();
    showNotice(`音频加载失败：${songName}，请检查音频文件是否存在或已损坏`);
  }

};
/**
 * 面板控制
 */
const panelControl = {
  isOpen() {
    return elements.songPanel?.classList.contains('active');
  },

  setPanelOpen(isOpen) {
    elements.imgBoard?.classList.toggle('active', isOpen);
    elements.songPanel?.classList.toggle('active', isOpen);
    elements.layoutRight?.classList.toggle('panel-open', isOpen);
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

  enterFullscreen(element) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  },

  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  },

  toggleFullscreen(e) {
    if (e) e.stopPropagation();

    const songPanel = $('.song_panel');
    if (!songPanel) return;

    if (document.fullscreenElement) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen(songPanel);
    }
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
      elements.playCurrentTime[i].textContent = timeFormatSecondsToMinutes(audioControl.audioSource.currentTime);
    });
    this.updateRangeColor();
    if (lyricsManager && !audioControl.audioSource.paused) {
      lyricsManager.update(audioControl.audioSource.currentTime);
    }
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

  updatePlaytime(e) {
    e.stopPropagation();
    const currentTime = parseFloat(e.target.value);
    audioControl.audioSource.currentTime = currentTime;

    elements.playCurrentTime.forEach(el => {
      el.textContent = timeFormatSecondsToMinutes(currentTime);
    });

    if (lyricsManager) {
      lyricsManager.isAutoScrolling = true;
      lyricsManager.update(currentTime);
    }
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

    try {
      if (typeof audioControl.audioSource.fastSeek === 'function') {
        audioControl.audioSource.fastSeek(currentTime);
      } else {
        audioControl.audioSource.currentTime = currentTime;
      }
    } catch (error) {
      audioControl.audioSource.currentTime = currentTime;
    }

    this.syncProgressUI(currentTime, e.target);
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
  },

  init() {
    this.systemVolumeOnly = this.isSystemVolumeOnly();
    document.documentElement.classList.toggle('system-volume-only', this.systemVolumeOnly);
    elements.volumeRange.disabled = this.systemVolumeOnly;

    const initialVolume = CONFIG.VOLUME.DEFAULT;
    audioControl.audioSource.volume = initialVolume;
    this.lastVolume = initialVolume;
    elements.volumeRange.value = initialVolume;

    const percentage = (initialVolume / elements.volumeRange.max) * 100;
    elements.volumeColorFill.style.width = `${percentage}%`;

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
 * 播放列表控制
 */
const playlistControl = {
  initMusicList() {
    elements.contentList.innerHTML = '';

    // 预处理所有音乐的图片路径
    state.displayMusicList.forEach(music => {
      prepareMusicImage(music);
    });

    // 148首规模不大，保留稳定的常规列表，性能交给CSS绘制层优化。
    const fragment = document.createDocumentFragment();

    state.displayMusicList.forEach((music, idx) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'contentList-item flex fs-14 fw-5';
      itemDiv.dataset.id = idx;
      itemDiv.innerHTML = `
        <div class="item-img">
          <img src="${music.list_img_file || music.img_file}" data-full-src="${music.img_file}" loading="lazy" decoding="async" alt="">
        </div>
        <div class="item-title text-ol ">${music.song_name || music.title}</div>
        <div class="item-author text-ol ">${music.author}</div>
        <div class="item-album text-ol ">${music.song_type || music.type}</div>
        <div class="item-totalTime text-ol flex">${music.time}</div>
      `;
      fragment.appendChild(itemDiv);
    });

    elements.contentList.appendChild(fragment);
    this.updateActiveItem();
  },

  handleScroll() {
    state.isListScrolling = true;
    state.hoverItem = null;
    hideHoverWindow();

    if (state.listScrollTimer) {
      clearTimeout(state.listScrollTimer);
    }
    state.listScrollTimer = setTimeout(() => {
      state.isListScrolling = false;
    }, 140);
  },

  updateActiveItem() {
    elements.contentList.querySelectorAll('.contentList-item').forEach(item => {
      const index = parseInt(item.dataset.id, 10);
      item.classList.toggle('active', isCurrentMusic(state.displayMusicList[index]));
    });
  },

  updatePlayInfo() {
    if (!normalizeCurrentIndex()) return;
    const currentMusic = state.currentMusicList[state.currentMusicIndex];
    // 图片路径已经在初始化时处理过，这里直接使用

    elements.playElements.forEach((elementGroup, index) => {
      elementGroup.forEach(element => {
        if (index === 0) {
          // 更新图片
          element.src = currentMusic.img_file;
          element.alt = '...';
        } else if (index === 1) {
          // 更新歌曲名称
          const songName = currentMusic.song_name || currentMusic.title || '';
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

    audioControl.updateAudioSource();

    if (lyricsManager) {
      lyricsManager.clear();
      lyricsManager.loadLyrics(currentMusic);
    }
  },

  playSelectMusic(e) {
    e.stopPropagation();

    const clickedElement = e.target.closest('.contentList-item');
    if (!clickedElement) return;

    const musicIndex = parseInt(clickedElement.dataset.id);
    if (isNaN(musicIndex) || musicIndex < 0 || musicIndex >= state.displayMusicList.length) {
      console.error('无效的音乐索引:', musicIndex);
      return;
    }

    const selectedMusic = state.displayMusicList[musicIndex];
    const selectedIdentity = getMusicIdentity(selectedMusic);
    const now = Date.now();
    if (selectedIdentity === state.lastSelectIdentity && now - state.lastSelectAt < 360) {
      return;
    }
    state.lastSelectIdentity = selectedIdentity;
    state.lastSelectAt = now;
    state.playRequestId += 1;
    state.currentMusicList = state.displayMusicList;
    state.currentMusicIndex = musicIndex;

    playlistControl.updatePlayInfo();
    playlistControl.updateActiveItem();
    playbackControl.startPlayback().catch(error => {
      console.error('播放失败:', error);
      showPlaybackError(error);
    });
  }
};

function handleListClick(e) {
  if (!isMobileInteraction()) return;
  playlistControl.playSelectMusic(e);
}

function handleListDoubleClick(e) {
  if (isMobileInteraction()) return;
  playlistControl.playSelectMusic(e);
}

/**
 * 播放模式控制
 */
const playModeControl = {
  isPlayMode(e) {
    e.stopPropagation();
    state.playMode = state.playMode >= 2 ? 0 : state.playMode + 1;

    if (state.playMode === 0) {
      state.isShuffle = false;
      audioControl.audioSource.loop = false;
      this.classList.remove("singleLoop");
      this.classList.add("listLoop");
    } else if (state.playMode === 1) {
      state.isShuffle = true;
      audioControl.audioSource.loop = false;
      this.classList.remove("listLoop");
      this.classList.add("randomLoop");
    } else {
      state.isShuffle = false;
      audioControl.audioSource.loop = true;
      this.classList.remove("randomLoop");
      this.classList.add("singleLoop");
    }
  },

  shuffleMusic() {
    state.currentMusicIndex = Math.floor(Math.random() * state.currentMusicList.length);
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
  $('#app-footer')?.addEventListener('click', panelControl.togglePanel.bind(panelControl));
  elements.layoutRight?.addEventListener('click', panelControl.closePanel.bind(panelControl));

  // 防止面板内部点击关闭
  $('.song_panel')?.addEventListener('click', e => e.stopPropagation());
  elements.panelCloseBtn?.addEventListener('click', panelControl.closePanel.bind(panelControl));
  elements.downloadCurrentAudioBtn?.addEventListener('click', downloadCurrentAudio);

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

  const debouncedShowHover = debounce(showHoverWindow, 120);

  const contentList = document.querySelector('.wrapper-contentList');
  if (contentList) {
    contentList.addEventListener('error', (e) => {
      const image = e.target;
      if (image?.tagName !== 'IMG') return;
      const fullSrc = image.dataset.fullSrc;
      if (fullSrc && image.getAttribute('src') !== fullSrc) {
        image.src = fullSrc;
      }
    }, true);

    contentList.addEventListener('mouseover', (e) => {
      if (!canUseHover() || state.isListScrolling) return;
      const listItem = e.target.closest('.contentList-item');
      if (!listItem || listItem === state.hoverItem) return;
      state.hoverItem = listItem;
      debouncedShowHover(e);
    });

    contentList.addEventListener('mouseleave', () => {
      state.hoverItem = null;
      if (debouncedShowHover.cancel) {
        debouncedShowHover.cancel();
      }
      hideHoverWindow();
    });

    contentList.addEventListener('scroll', playlistControl.handleScroll, { passive: true });
    contentList.addEventListener('click', handleListClick);
    contentList.addEventListener('dblclick', handleListDoubleClick);
  }

  // 当鼠标进入歌词面板或底部播放面板时，隐藏浮窗
  const layoutRight = document.querySelector('.layout-right');
  const appFooter = document.querySelector('.app_footer');
  
  if (layoutRight) {
    layoutRight.addEventListener('mouseenter', () => {
      hideHoverWindow();
    });
  }
  
  if (appFooter) {
    appFooter.addEventListener('mouseenter', () => {
      hideHoverWindow();
    });
  }

  // 添加全局点击事件来隐藏悬浮窗
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.contentList-item')) {
      hideHoverWindow();
    }
  });

  // 播放模式事件
  elements.playModeBtn.addEventListener("click", playModeControl.isPlayMode);

  // 键盘事件
  document.addEventListener('keydown', handleKeyboardEvents);
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

function handleKeyboardEvents(event) {
  const { key, target } = event;
  if (isEditableTarget(target)) return;

  if (keyActionMap[key]) {
    event.preventDefault();
    keyActionMap[key]();
  }
}

/**
 * 悬浮窗控制
 */
function showHoverWindow(event) {
  if (!canUseHover() || state.isListScrolling) return;

  const headerHeight = 80;  // 导航栏高度
  const footerHeight = 100; // 底部控制栏高度

  // 检查鼠标是否在有效的内容区域
  if (event.clientY <= headerHeight ||
    event.clientY >= (window.innerHeight - footerHeight)) {
    hideHoverWindow();
    return;
  }

  const item = event.target.closest('.contentList-item');
  if (!item) {
    hideHoverWindow();
    return;
  }

  const dataIndex = parseInt(item.getAttribute('data-id'));
  if (isNaN(dataIndex) || dataIndex < 0 || dataIndex >= state.displayMusicList.length) {
    console.error('无效的音乐索引:', dataIndex);
    hideHoverWindow();
    return;
  }

  const musicData = state.displayMusicList[dataIndex];
  // 检查是否有描述信息，如果没有就隐藏悬浮窗
  if (!musicData?.des || musicData.des.trim() === '') {
    hideHoverWindow();
    return;
  }

  const hoverWindow = document.getElementById('hoverWindow');
  const hoverContent = document.getElementById('hoverContent');
  if (!hoverWindow || !hoverContent) {
    hideHoverWindow();
    return;
  }

  // 再次检查是否还在列表项内（防止防抖延迟导致的问题）
  const currentItem = event.target.closest('.contentList-item');
  if (!currentItem) {
    hideHoverWindow();
    return;
  }

  // 再次检查是否有描述信息
  if (!musicData?.des || musicData.des.trim() === '') {
    hideHoverWindow();
    return;
  }

  // 设置新内容
  hoverContent.textContent = musicData.des;

  // 计算悬浮窗位置，考虑导航栏和底部控制栏
  const hoverWindowWidth = 300;
  // 先设置内容，再获取高度
  const hoverWindowHeight = hoverWindow.offsetHeight;
  const windowWidth = window.innerWidth;

  let left = event.clientX;
  let top = event.clientY + 20;

  // 水平位置调整
  if (left + hoverWindowWidth > windowWidth) {
    left = windowWidth - hoverWindowWidth - 20;
  }

  // 垂直位置调整，确保不会被导航栏和底部控制栏遮挡
  if (top + hoverWindowHeight > (window.innerHeight - footerHeight)) {
    top = event.clientY - hoverWindowHeight - 10;
  }

  // 确保不会超出顶部导航栏
  if (top < headerHeight) {
    top = headerHeight + 10;
  }

  hoverWindow.style.left = `${Math.max(10, left)}px`;
  hoverWindow.style.top = `${top}px`;

  // 只有在所有检查都通过后，才显示浮窗
  requestAnimationFrame(() => {
    // 再次确认内容不为空
    if (hoverContent.textContent.trim() !== '') {
      hoverWindow.classList.add('visible');
    } else {
      hoverWindow.classList.remove('visible');
    }
  });
}

/**
 * 悬浮窗隐藏函数
 */
function hideHoverWindow() {
  const hoverWindow = document.getElementById('hoverWindow');
  const hoverContent = document.getElementById('hoverContent');
  if (hoverWindow) {
    hoverWindow.classList.remove('visible');
    // 清空内容
    if (hoverContent) {
      hoverContent.textContent = '';
    }
  }
}

// 使用防抖优化鼠标移动事件
function debounce(func, wait) {
  let timeout;
  const executedFunction = function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
  // 添加取消方法
  executedFunction.cancel = function() {
    clearTimeout(timeout);
  };
  return executedFunction;
}

/**
 * 屏幕常亮控制
 */
function bindWakeLockEvents() {
  if (state.wakeLockEventsBound) return;
  state.wakeLockEventsBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  window.addEventListener('pagehide', releaseWakeLock);
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    return;
  }

  bindWakeLockEvents();

  if (
    state.wakeLock !== null ||
    !state.isPlaying ||
    document.visibilityState !== 'visible'
  ) {
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
    });
  } catch (error) {
    console.warn('无法获得屏幕常亮权限:', error);
  }
}

function releaseWakeLock() {
  if (state.wakeLock === null) return;
  state.wakeLock.release();
  state.wakeLock = null;
}

/**
 * 清理旧版 Service Worker 和缓存。
 * 当前项目没有使用 Service Worker；旧注册会拦截音频 Range 请求，
 * 对 206 Partial Content 调用 cache.put 会导致播放中断。
 */
async function cleanupLegacyServiceWorkers() {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return false;

    await Promise.all(registrations.map(registration => registration.unregister()));

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    }

    if (navigator.serviceWorker.controller && !sessionStorage.getItem('serviceWorkerCleanupReloaded')) {
      sessionStorage.setItem('serviceWorkerCleanupReloaded', '1');
      window.location.reload();
      return true;
    }
  } catch (error) {
    console.warn('清理旧 Service Worker 失败:', error);
  }

  return false;
}

/**
 * 标签页切换控制
 */
function switchTab(tabElement) {
  if (tabElement.classList.contains('active')) {
    return;
  }

  const tabs = document.querySelectorAll('.list-tab > button');
  tabs.forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });
  tabElement.classList.add('active');
  tabElement.setAttribute('aria-selected', 'true');

  const tabName = tabElement.dataset.tab;
  if (tabName) {
    state.displayMusicList = getMusicList(tabName);
    playlistControl.initMusicList();
  }
}

function initTabs() {
  const tabs = document.querySelectorAll('.list-tab > button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab));
  });
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
 * 应用初始化
 */
function init() {
  if (!state.currentMusicList.length) {
    state.currentMusicList = getMusicList('tab-A');
    state.displayMusicList = state.currentMusicList;
  }

  audioControl.init();
  volumeControl.init();
  initTabs();
  bindCatalogUpdateEvents();
  playlistControl.initMusicList();
  initEventListeners();
  bindWakeLockEvents();
  playlistControl.updatePlayInfo();
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', async () => {
  const isReloadingForServiceWorkerCleanup = await cleanupLegacyServiceWorkers();
  if (isReloadingForServiceWorkerCleanup) return;
  init();
});

// 导出需要的函数
export { switchTab };
