/**
 * 播放队列：维护当前播放列表、播放位置和随机顺序。
 *
 * 随机模式用 Fisher–Yates 预先洗出“一轮”顺序：
 * - 一轮内每首歌只播一次，不会连续重复；
 * - “上一首”沿着这一轮的顺序回退，相当于播放历史；
 * - 一轮播完再洗下一轮，并避免新一轮第一首与刚播完的那首相同。
 */
export class PlaybackQueue {
  constructor() {
    this.songs = [];
    this.index = -1;
    this.shuffle = false;
    this.order = [];     // 随机模式下的播放顺序（存放 songs 的下标）
    this.orderPos = 0;   // 当前歌曲在 order 中的位置
  }

  get length() {
    return this.songs.length;
  }

  get current() {
    return this.songs[this.index] ?? null;
  }

  /**
   * 替换整个队列并定位到指定歌曲（用户从列表点歌、启动恢复时调用）
   */
  setSongs(songs, startIndex = 0) {
    this.songs = Array.from(songs);
    this.index = this.songs.length
      ? Math.max(0, Math.min(this.songs.length - 1, startIndex))
      : -1;
    this.resetOrder();
  }

  setShuffle(enabled) {
    if (this.shuffle === enabled) return;
    this.shuffle = enabled;
    this.resetOrder();
  }

  next() {
    if (!this.length) return null;

    if (!this.shuffle) {
      this.index = (this.index + 1) % this.length;
      return this.current;
    }

    this.orderPos += 1;
    if (this.orderPos >= this.order.length) {
      this.startNewRound();
    }
    this.index = this.order[this.orderPos];
    return this.current;
  }

  /**
   * 查看 next() 将要播放的歌曲但不移动位置，用于预加载。
   * 随机模式一轮刚好播完时下一轮尚未洗牌，无法预知，返回 null。
   */
  peekNext() {
    if (!this.length) return null;
    if (!this.shuffle) {
      return this.songs[(this.index + 1) % this.length];
    }
    const nextPos = this.orderPos + 1;
    return nextPos < this.order.length ? this.songs[this.order[nextPos]] : null;
  }

  prev() {
    if (!this.length) return null;

    if (!this.shuffle) {
      this.index = (this.index - 1 + this.length) % this.length;
      return this.current;
    }

    // 回退到本轮开头之前时，绕到本轮末尾
    this.orderPos = (this.orderPos - 1 + this.order.length) % this.order.length;
    this.index = this.order[this.orderPos];
    return this.current;
  }

  // 以当前歌曲为第一首，重新洗出本轮剩余顺序
  resetOrder() {
    this.orderPos = 0;
    if (!this.shuffle || !this.length) {
      this.order = [];
      return;
    }
    const rest = this.songs.map((_, i) => i).filter(i => i !== this.index);
    this.order = [this.index, ...shuffleArray(rest)];
  }

  // 一轮播完后洗新一轮，避免新一轮第一首与刚播完的那首相同
  startNewRound() {
    const lastIndex = this.index;
    const order = shuffleArray(this.songs.map((_, i) => i));
    if (order.length > 1 && order[0] === lastIndex) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    this.order = order;
    this.orderPos = 0;
  }
}

function shuffleArray(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
