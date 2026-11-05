/**
 * 音量控制：音量滑块、静音按钮和移动端触摸调节。
 *
 * 直接读写 AudioPlayer 的 volume / muted；音量变化需要落盘时调用 onPersist（由 app.js 保存播放快照）。
 * iOS 只能用系统音量调节，页面滑块会被禁用。
 */
export class VolumeControl {
  /**
   * @param {object} options
   * @param {HTMLInputElement} options.rangeEl 音量滑块
   * @param {HTMLElement} options.fillEl 滑块填充条
   * @param {HTMLElement} options.iconEl 音量/静音图标（点击切换静音）
   * @param {{ volume: number, muted: boolean }} options.player 音频播放器
   * @param {number} options.defaultVolume 默认音量
   * @param {() => void} options.onPersist 需要保存音量时调用
   */
  constructor({ rangeEl, fillEl, iconEl, player, defaultVolume, onPersist }) {
    this.rangeEl = rangeEl;
    this.fillEl = fillEl;
    this.iconEl = iconEl;
    this.player = player;
    this.defaultVolume = defaultVolume;
    this.onPersist = onPersist;

    // 最近一次非零音量，取消静音时恢复到它，也写入播放快照
    this.lastVolume = defaultVolume;
    this.systemVolumeOnly = false;
  }

  /**
   * 按快照恢复音量并绑定事件
   */
  init(snapshot) {
    this.systemVolumeOnly = isSystemVolumeOnly();
    document.documentElement.classList.toggle('system-volume-only', this.systemVolumeOnly);
    this.rangeEl.disabled = this.systemVolumeOnly;

    // iOS 只能用系统音量，不恢复页面音量
    const savedVolume = Number(snapshot?.volume);
    const canRestore = !this.systemVolumeOnly && Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1;
    const initialVolume = canRestore ? savedVolume : this.defaultVolume;
    this.player.volume = initialVolume;
    this.lastVolume = initialVolume;
    this.rangeEl.value = initialVolume;
    this.setFillWidth(initialVolume);

    if (canRestore && snapshot.muted) {
      this.player.muted = true;
      this.rangeEl.value = 0;
      this.fillEl.style.width = '0%';
    }

    this.updateIcon();
    this.bindEvents();
  }

  bindEvents() {
    const handleTouch = e => this.handleTouch(e);
    const stop = e => e.stopPropagation();

    const slider = this.rangeEl.closest('.options-soundSlider');
    slider?.addEventListener('click', stop);
    slider?.addEventListener('pointerdown', stop);
    slider?.addEventListener('touchstart', handleTouch, { passive: false });
    slider?.addEventListener('touchmove', handleTouch, { passive: false });
    slider?.addEventListener('touchend', handleTouch, { passive: false });

    this.rangeEl.addEventListener('input', e => this.change(e));
    this.rangeEl.addEventListener('change', e => this.change(e));
    this.rangeEl.addEventListener('click', stop);
    this.rangeEl.addEventListener('pointerdown', stop);
    this.rangeEl.addEventListener('touchstart', handleTouch, { passive: false });
    this.rangeEl.addEventListener('touchmove', handleTouch, { passive: false });
    this.rangeEl.addEventListener('touchend', handleTouch, { passive: false });
    this.iconEl.addEventListener('click', e => this.toggleMute(e));
  }

  change(e) {
    e?.stopPropagation?.();

    const volume = Math.max(0, Math.min(1, Number(this.rangeEl.value)));
    // 拖动中的 input 事件只更新音量和界面，松手触发 change 时才落盘，避免拖动时频繁同步写 localStorage
    this.applyVolume(volume, { persist: e?.type !== 'input' });
  }

  applyVolume(volume, { persist = true } = {}) {
    this.rangeEl.value = volume;
    this.player.volume = volume;
    this.player.muted = volume === 0;
    if (volume > 0) {
      this.lastVolume = volume;
    }
    this.setFillWidth(volume);

    this.updateIcon();
    if (persist) {
      this.onPersist();
    }
  }

  changeByClientX(clientX, options) {
    const rect = this.rangeEl.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const min = Number(this.rangeEl.min) || 0;
    const max = Number(this.rangeEl.max) || 1;
    const volume = min + (max - min) * ratio;
    this.applyVolume(Number(volume.toFixed(2)), options);
  }

  handleTouch(e) {
    e.stopPropagation();
    e.preventDefault();

    if (this.systemVolumeOnly) return;

    const touch = e.touches?.[0] || e.changedTouches?.[0];
    if (!touch) return;
    // touchstart/touchmove 期间只调音量，手指抬起（touchend）时再保存快照
    this.changeByClientX(touch.clientX, { persist: e.type === 'touchend' });
  }

  toggleMute(e) {
    e.stopPropagation();
    e.preventDefault();

    this.player.muted = !this.player.muted;

    if (this.player.muted) {
      this.rangeEl.value = 0;
      this.fillEl.style.width = '0%';
    } else {
      const restoredVolume = this.lastVolume > 0 ? this.lastVolume : this.defaultVolume;
      this.player.volume = restoredVolume;
      this.rangeEl.value = restoredVolume;
      this.setFillWidth(this.player.volume);
    }

    this.updateIcon();
    this.onPersist();
  }

  setFillWidth(volume) {
    const percentage = (volume / Number(this.rangeEl.max)) * 100;
    this.fillEl.style.width = `${percentage}%`;
  }

  updateIcon() {
    const isSilent = this.player.muted || this.player.volume === 0;
    this.iconEl.classList.toggle('mute', isSilent);
    this.iconEl.classList.toggle('sound', !isSilent);
  }
}

function isSystemVolumeOnly() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
