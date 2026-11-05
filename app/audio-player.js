/**
 * 音频播放器：封装唯一的 <audio> 元素，不碰任何 DOM 界面。
 *
 * 负责：加载音源、播放/暂停请求（处理快速连点导致的过期请求）、跳转、预加载下一首、
 * 加载失败时的自动跳歌策略、启动时待恢复的播放进度。
 * 界面更新、提示、歌词、快照等都由 app.js 通过构造时传入的回调完成。
 */

// 连续跳过多少首失败歌曲后停止自动跳歌
export const MAX_CONSECUTIVE_ERRORS = 3;
// 当前歌曲剩余不足该秒数时预加载下一首
const PRELOAD_LEAD_TIME = 30;

const noop = () => {};

/**
 * 预加载下一首：当前歌曲快结束时提前请求下一首的音频、封面和歌词，切歌时更快出声。
 */
class NextSongPreloader {
  constructor() {
    this.audio = null;
    this.preloadedId = '';
  }

  preload(song) {
    if (song.id === this.preloadedId) return;
    this.preloadedId = song.id;

    if (song.audioUrl) {
      // 用独立的静音 Audio 元素拉取音频，数据进入浏览器缓存，主播放器切歌时可直接复用
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.muted = true;
      }
      this.audio.src = song.audioUrl;
      this.audio.load();
    }
    if (song.coverUrl) {
      new Image().src = song.coverUrl;
    }
    if (song.lyricsUrl && !song.isInstrumental) {
      fetch(song.lyricsUrl).catch(() => {});
    }
  }

  // 切歌后释放预加载元素占用的解码资源（已下载的数据仍留在缓存中）
  release() {
    this.preloadedId = '';
    if (this.audio?.getAttribute('src')) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }
}

export class AudioPlayer {
  /**
   * @param {object} options
   * @param {number} options.defaultVolume 初始音量
   * @param {() => object|null} options.getNextSong 下一首歌曲模型，用于预加载
   * @param {() => boolean} options.canPreload 当前是否允许预加载（如单曲循环时不需要）
   * @param {() => boolean} options.hasAlternative 加载失败时是否还有别的歌可跳
   * @param {object} options.on 事件回调：playing、pause、ended、timeUpdate(currentTime)、
   *   durationChange(duration)、sourceChange()、positionChange()、
   *   restore(time)、loadError({ song, skipped, reachedLimit })
   */
  constructor({ defaultVolume, getNextSong, canPreload, hasAlternative, on = {} }) {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = defaultVolume;

    this.getNextSong = getNextSong;
    this.canPreload = canPreload;
    this.hasAlternative = hasAlternative;
    this.on = {
      playing: noop,
      pause: noop,
      ended: noop,
      timeUpdate: noop,
      durationChange: noop,
      sourceChange: noop,
      positionChange: noop,
      restore: noop,
      loadError: noop,
      ...on
    };

    this.song = null;
    this.preloader = new NextSongPreloader();
    // 每次播放/暂停/切歌请求递增，晚到的 play() 结果据此判断是否已过期
    this.requestId = 0;
    // 用户意图是否为“正在播放”，用于区分加载失败时是否自动跳歌
    this.wantsPlay = false;
    // 连续加载失败次数，防止整列表损坏时无限跳歌
    this.consecutiveErrors = 0;
    // 待恢复的播放进度 { songId, time }，等音频元数据就绪后再应用
    this.pendingRestore = null;

    this.bindEvents();
  }

  bindEvents() {
    const audio = this.audio;
    audio.addEventListener('loadedmetadata', () => {
      this.on.durationChange(this.duration);
      this.applyPendingRestore();
    });
    audio.addEventListener('durationchange', () => this.on.durationChange(this.duration));
    audio.addEventListener('timeupdate', () => {
      this.on.timeUpdate(audio.currentTime);
      this.maybePreloadNext();
    });
    audio.addEventListener('ended', () => this.on.ended());
    audio.addEventListener('error', () => this.handleLoadError());

    // 系统也可能直接暂停/恢复音频（来电、拔耳机、蓝牙断开、通知栏按钮），
    // 以音频元素的真实状态为准通知界面，避免按钮显示“播放中”但实际已停。
    audio.addEventListener('playing', () => {
      this.consecutiveErrors = 0;
      this.on.playing();
      this.on.positionChange();
    });
    audio.addEventListener('pause', () => {
      this.on.pause();
      this.on.positionChange();
    });
    ['durationchange', 'seeked', 'ratechange'].forEach(eventName => {
      audio.addEventListener(eventName, () => this.on.positionChange());
    });
  }

  // ==================== 状态读写 ====================

  get paused() {
    return this.audio.paused;
  }

  get currentTime() {
    return this.audio.currentTime || 0;
  }

  set currentTime(time) {
    this.audio.currentTime = time;
  }

  // 元数据未就绪时为 0
  get duration() {
    return Number.isFinite(this.audio.duration) ? Math.max(0, this.audio.duration) : 0;
  }

  get hasError() {
    return !!this.audio.error;
  }

  get volume() {
    return this.audio.volume;
  }

  set volume(value) {
    this.audio.volume = value;
  }

  get muted() {
    return this.audio.muted;
  }

  set muted(value) {
    this.audio.muted = value;
  }

  set loop(value) {
    this.audio.loop = value;
  }

  // ==================== 播放控制 ====================

  /**
   * 切换到指定歌曲的音源（不自动播放）
   */
  load(song) {
    this.song = song || null;
    if (!song?.audioUrl) {
      this.audio.removeAttribute('src');
      return;
    }

    this.audio.src = song.audioUrl;
    this.preloader.release();
    this.on.sourceChange();
    this.on.positionChange();
  }

  /**
   * 开始播放。
   * @returns {Promise<boolean>} true 表示已开始播放；false 表示请求已过期或失败已由 error 事件处理
   * @throws 其他播放失败（如浏览器拦截自动播放），由调用方提示
   */
  async play() {
    const requestId = ++this.requestId;
    const audio = this.audio;
    this.wantsPlay = true;
    // 之前加载失败的音源不会自动重试，重新 load 一次；若仍失败会再次触发 error 事件进入自动跳歌流程
    if (audio.error) {
      audio.load();
    }
    try {
      await audio.play();
      return requestId === this.requestId;
    } catch (error) {
      if (requestId !== this.requestId || error?.name === 'AbortError') {
        return false;
      }
      // 音源加载失败时 error 事件已负责提示和自动跳歌，这里不再重复报错覆盖提示
      if (error?.name === 'NotSupportedError' && audio.error) {
        return false;
      }
      console.error('播放失败:', error);
      throw error;
    }
  }

  pause() {
    this.requestId += 1;
    this.wantsPlay = false;
    this.audio.pause();
  }

  // 让尚未完成的 play() 请求作废（例如用户点了另一首歌）
  cancelPendingPlay() {
    this.requestId += 1;
  }

  /**
   * 跳转到指定秒数。
   * @returns {number|null} 实际跳转到的秒数；时长未知时返回 null 且不跳转
   */
  seek(time, { fast = false } = {}) {
    const duration = this.duration;
    if (duration <= 0) return null;
    const target = Math.max(0, Math.min(duration, Number(time) || 0));

    try {
      if (fast && typeof this.audio.fastSeek === 'function') {
        this.audio.fastSeek(target);
      } else {
        this.audio.currentTime = target;
      }
    } catch (error) {
      this.audio.currentTime = target;
    }
    return target;
  }

  // ==================== 进度恢复 ====================

  setPendingRestore(songId, time) {
    this.pendingRestore = time > 0 ? { songId, time } : null;
  }

  // 进度尚未恢复完成时返回待恢复的秒数，保存快照时沿用它，避免启动后马上离开把进度覆盖成 0
  getPendingRestoreTime(songId) {
    return this.pendingRestore?.songId === songId ? this.pendingRestore.time : null;
  }

  /**
   * 音频元数据就绪后应用待恢复的进度。只对快照对应的那首歌生效，用户已切歌则丢弃。
   */
  applyPendingRestore() {
    const pending = this.pendingRestore;
    if (!pending) return;
    this.pendingRestore = null;

    if (this.song?.id !== pending.songId) return;

    // 上次几乎听完的就从头开始
    const duration = this.audio.duration;
    if (!Number.isFinite(duration) || pending.time >= duration - 1) return;

    this.on.restore(pending.time);
  }

  // ==================== 预加载与出错处理 ====================

  // 单曲循环、暂停、省流量模式下不预加载
  maybePreloadNext() {
    const audio = this.audio;
    if (audio.paused || !this.canPreload() || navigator.connection?.saveData) return;

    const remaining = audio.duration - audio.currentTime;
    if (!Number.isFinite(remaining) || remaining > PRELOAD_LEAD_TIME) return;

    const next = this.getNextSong();
    if (!next || next.id === this.song?.id) return;
    this.preloader.preload(next);
  }

  handleLoadError() {
    const song = this.song;
    console.error('音频加载失败:', this.audio.error, song);

    // 只有用户正处于“想要播放”的状态才自动跳歌；页面初始化/恢复时加载失败只提示，不擅自开始播放
    const canSkip = this.wantsPlay &&
      this.hasAlternative() &&
      this.consecutiveErrors < MAX_CONSECUTIVE_ERRORS;

    if (!canSkip) {
      const reachedLimit = this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      this.consecutiveErrors = 0;
      this.wantsPlay = false;
      this.on.loadError({ song, skipped: false, reachedLimit });
      return;
    }

    this.consecutiveErrors += 1;
    this.on.loadError({ song, skipped: true, reachedLimit: false });
  }
}
