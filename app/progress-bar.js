import { addEventListeners, timeFormatSecondsToMinutes } from './utils.js';

/**
 * 播放进度条（页面上有桌面端和底栏两组，始终保持同步）。
 *
 * 只负责界面：显示时长/当前时间、填充条、拖动预览。拖动松手后通过 onSeek 交给 app.js 真正跳转音频。
 */
export class ProgressBar {
  /**
   * @param {object} options
   * @param {NodeList|HTMLInputElement[]} options.progressEls range 输入框
   * @param {NodeList|HTMLElement[]} options.currentTimeEls 当前时间文本，与 progressEls 一一对应
   * @param {NodeList|HTMLElement[]} options.totalTimeEls 总时长文本，与 progressEls 一一对应
   * @param {NodeList|HTMLElement[]} options.fillEls 填充条
   * @param {(time: number, options: { fast: boolean, sourceProgress: HTMLInputElement }) => void} options.onSeek
   */
  constructor({ progressEls, currentTimeEls, totalTimeEls, fillEls, onSeek }) {
    this.progressEls = progressEls;
    this.currentTimeEls = currentTimeEls;
    this.totalTimeEls = totalTimeEls;
    this.fillEls = fillEls;
    this.onSeek = onSeek;

    // 用户正在拖动时不让 timeupdate 把滑块拉回去
    this.isSeeking = false;
    // 上次写入的当前时间文本；timeupdate 每秒触发约 4 次，秒数变了才改 DOM 文本
    this.lastTimeText = '';

    this.bindEvents();
  }

  bindEvents() {
    addEventListeners(this.progressEls, {
      'pointerdown': e => this.beginSeek(e),
      'touchstart': e => this.beginSeek(e),
      'input': e => this.previewSeek(e),
      'change': e => this.commitSeek(e),
      'pointerup': e => this.commitSeek(e),
      'touchend': e => this.commitSeek(e),
      'click': e => e.stopPropagation()
    });
  }

  // 切歌时清零
  reset() {
    this.isSeeking = false;
    this.progressEls.forEach((progress, i) => {
      progress.value = 0;
      progress.max = 0;
      this.currentTimeEls[i].textContent = '00:00';
      this.totalTimeEls[i].textContent = '00:00';
    });
    this.fillEls.forEach(fill => {
      fill.style.transform = 'scaleX(0)';
    });
    this.lastTimeText = '00:00';
  }

  setDuration(duration) {
    this.progressEls.forEach((progress, i) => {
      // 保留原始时长给进度条，展示文本统一由格式化函数向下取整，避免比歌单多显示 1 秒。
      progress.max = duration;
      this.totalTimeEls[i].textContent = timeFormatSecondsToMinutes(duration);
    });
    this.syncFromProgress();
  }

  /**
   * 播放中更新当前时间。
   * @returns {boolean} 用户正在拖动时不更新并返回 false
   */
  setTime(currentTime) {
    if (this.isSeeking) return false;
    const currentTimeText = timeFormatSecondsToMinutes(currentTime);
    const textChanged = currentTimeText !== this.lastTimeText;
    this.lastTimeText = currentTimeText;
    this.progressEls.forEach((progress, i) => {
      progress.value = currentTime;
      if (textChanged) {
        this.currentTimeEls[i].textContent = currentTimeText;
        progress.setAttribute('aria-valuetext', currentTimeText);
      }
    });
    this.updateFill(currentTime, Number(this.progressEls[0]?.max));
    return true;
  }

  /**
   * 跳转后立即同步所有进度条，不等下一次 timeupdate
   */
  sync(currentTime, sourceProgress = this.progressEls[0]) {
    this.progressEls.forEach(progress => {
      progress.max = sourceProgress.max;
      progress.value = currentTime;
    });
    this.lastTimeText = timeFormatSecondsToMinutes(currentTime);
    this.currentTimeEls.forEach(el => {
      el.textContent = this.lastTimeText;
    });
    this.syncFromProgress(sourceProgress);
  }

  // 以某个进度条的值为准，同步其他进度条和填充条
  syncFromProgress(sourceProgress = this.progressEls[0]) {
    this.progressEls.forEach(progress => {
      if (progress !== sourceProgress) progress.value = sourceProgress.value;
    });
    this.updateFill(Number(sourceProgress.value), Number(sourceProgress.max));
  }

  // 填充条固定为满宽，用 scaleX 表示进度：只触发合成，不引起重排，也不重绘发光阴影所在区域
  updateFill(value, max) {
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    this.fillEls.forEach(fill => {
      fill.style.transform = `scaleX(${ratio})`;
    });
  }

  beginSeek(e) {
    e.stopPropagation();
    this.isSeeking = true;
  }

  previewSeek(e) {
    e.stopPropagation();
    const currentTime = this.getSeekTime(e);
    if (currentTime === null) return;
    this.sync(currentTime, e.target);
  }

  commitSeek(e) {
    e.stopPropagation();
    const currentTime = this.getSeekTime(e);
    this.isSeeking = false;
    if (currentTime === null) return;
    this.onSeek(currentTime, { fast: true, sourceProgress: e.target });
  }

  getSeekTime(e) {
    const progress = e.target;
    const max = Number(progress.max) || 0;
    if (max <= 0) return null;
    return Math.max(0, Math.min(max, Number(progress.value) || 0));
  }
}
