import { escapeHtml } from './utils.js';

// 同一首歌在该间隔内的重复点击视为误触（双击、触屏抖动），只响应一次
const REPEAT_SELECT_GUARD = 360;

/**
 * 歌单视图：分类 tab + 歌曲列表
 *
 * 只负责展示和用户输入，不直接操作播放：
 * - 当前展示哪个分类、哪些歌曲由视图自己维护；
 * - 哪首是“正在播放”通过 isCurrent(song) 询问外部；
 * - 用户点歌时调用 onSelect(songs, index, categoryId)，由外部决定如何播放。
 */
export class PlaylistView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.listEl - 歌曲列表容器
   * @param {HTMLElement} [options.countEl] - 显示“N 首”的元素
   * @param {HTMLElement} options.tabListEl - 分类 tab 容器
   * @param {{id: string, label: string}[]} options.categories - 分类列表（含“全部”）
   * @param {(categoryId: string) => object[]} options.getSongs
   * @param {(song: object) => boolean} options.isCurrent
   * @param {(songs: object[], index: number, categoryId: string) => void} options.onSelect
   */
  constructor({ listEl, countEl, tabListEl, categories, getSongs, isCurrent, onSelect }) {
    this.listEl = listEl;
    this.countEl = countEl;
    this.tabListEl = tabListEl;
    this.getSongs = getSongs;
    this.isCurrent = isCurrent;
    this.onSelect = onSelect;

    this.categoryId = '';
    this.songs = [];
    this.lastSelect = { id: '', at: 0 };
    this.activeItem = null;   // 当前高亮的列表项缓存，切歌时只改新旧两项

    this.renderTabs(categories);
    this.bindListEvents();
  }

  /**
   * 切换到指定分类并重新渲染列表（已是当前分类时不重复渲染）
   */
  showCategory(categoryId) {
    if (categoryId === this.categoryId) return;
    this.categoryId = categoryId;
    this.songs = this.getSongs(categoryId);
    this.syncTabs();
    this.renderList();
  }

  getSongForItem(item) {
    const index = Number.parseInt(item?.dataset.id, 10);
    return Number.isInteger(index) ? this.songs[index] ?? null : null;
  }

  /**
   * 根据 isCurrent 刷新高亮项，并保证列表始终有一项可通过 Tab 键聚焦
   */
  updateActiveItem() {
    // 在数据数组里找当前歌曲（纯 JS，很便宜），列表项顺序与 songs 一致，可直接按下标取节点
    const index = this.songs.findIndex(song => this.isCurrent(song));
    const nextItem = index >= 0 ? this.listEl.children[index] ?? null : null;
    if (nextItem === this.activeItem) return;

    const firstItem = this.listEl.children[0];
    if (this.activeItem) {
      this.activeItem.classList.remove('active');
      this.activeItem.setAttribute('aria-selected', 'false');
      this.activeItem.tabIndex = -1;
    }
    if (nextItem) {
      nextItem.classList.add('active');
      nextItem.setAttribute('aria-selected', 'true');
      nextItem.tabIndex = 0;
    }
    // 没有高亮项时保证第一项可通过 Tab 键聚焦；有高亮项时第一项只作普通项
    if (firstItem && firstItem !== nextItem) {
      firstItem.tabIndex = nextItem ? -1 : 0;
    }
    this.activeItem = nextItem;
  }

  scrollToActive() {
    this.listEl.querySelector('.contentList-item.active')?.scrollIntoView({ block: 'center' });
  }

  // ==================== 分类 tab ====================

  renderTabs(categories) {
    if (!this.tabListEl) return;

    const fragment = document.createDocumentFragment();
    categories.forEach(category => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.category = category.id;
      tab.textContent = category.label;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', this.listEl.id || 'playlist');
      tab.addEventListener('click', () => this.showCategory(category.id));
      tab.addEventListener('keydown', event => this.handleTabKeydown(event));
      fragment.appendChild(tab);
    });
    this.tabListEl.replaceChildren(fragment);
  }

  syncTabs() {
    this.getTabs().forEach(tab => {
      const isActive = tab.dataset.category === this.categoryId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
  }

  getTabs() {
    return Array.from(this.tabListEl?.querySelectorAll('button[data-category]') || []);
  }

  // 左右方向键在 tab 间循环切换，Home/End 跳到首尾（WAI-ARIA tabs 键盘约定）
  handleTabKeydown(event) {
    const tabs = this.getTabs();
    const currentIndex = tabs.indexOf(event.currentTarget);
    const keyOffset = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -currentIndex,
      End: tabs.length - currentIndex - 1
    }[event.key];

    if (keyOffset === undefined) return;
    event.preventDefault();
    const nextTab = tabs[(currentIndex + keyOffset + tabs.length) % tabs.length];
    if (!nextTab) return;
    nextTab.focus();
    this.showCategory(nextTab.dataset.category);
  }

  // ==================== 歌曲列表 ====================

  renderList() {
    if (this.countEl) {
      this.countEl.textContent = `${this.songs.length} 首`;
    }

    // 两三百首规模不大，保留稳定的常规列表，性能交给 CSS 绘制层优化
    const fragment = document.createDocumentFragment();
    this.songs.forEach((song, index) => {
      const item = document.createElement('button');
      const songName = song.name || '未知歌曲';
      const author = song.author || '未知歌手';
      item.type = 'button';
      item.className = 'contentList-item flex fs-14 fw-5';
      item.dataset.id = index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('aria-label', `${songName}，${author}，时长 ${song.time || '未知'}`);
      item.tabIndex = index === 0 ? 0 : -1;
      // 歌单文本来自导入工具的手工输入，拼接 innerHTML 前统一转义
      item.innerHTML = `
        <div class="item-index" aria-hidden="true">${index + 1}</div>
        <div class="item-img" aria-hidden="true">
          <img src="${escapeHtml(song.thumbUrl)}" data-full-src="${escapeHtml(song.coverUrl)}" loading="lazy" decoding="async" alt="">
        </div>
        <div class="item-copy">
          <div class="item-title text-ol">${escapeHtml(songName)}</div>
          <div class="item-author text-ol">${escapeHtml(author)}</div>
        </div>
        <div class="item-album text-ol">${escapeHtml(song.categoryLabel)}</div>
        <div class="item-totalTime text-ol flex">${escapeHtml(song.time)}</div>
      `;
      fragment.appendChild(item);
    });

    this.listEl.replaceChildren(fragment);
    // 列表已整体重建，旧缓存节点失效
    this.activeItem = null;
    this.updateActiveItem();
  }

  bindListEvents() {
    // 缩略图缺失时回退到封面原图（error 事件不冒泡，需在捕获阶段监听）
    this.listEl.addEventListener('error', event => {
      const image = event.target;
      if (image?.tagName !== 'IMG') return;
      const fullSrc = image.dataset.fullSrc;
      if (fullSrc && image.getAttribute('src') !== fullSrc) {
        image.src = fullSrc;
      }
    }, true);

    this.listEl.addEventListener('click', event => this.handleItemClick(event));
    this.listEl.addEventListener('keydown', event => this.handleListKeydown(event));
  }

  handleItemClick(event) {
    const item = event.target.closest('.contentList-item');
    if (!item) return;
    event.stopPropagation();

    const index = Number.parseInt(item.dataset.id, 10);
    const song = this.songs[index];
    if (!song) {
      console.error('无效的音乐索引:', item.dataset.id);
      return;
    }

    const now = Date.now();
    if (song.id === this.lastSelect.id && now - this.lastSelect.at < REPEAT_SELECT_GUARD) {
      return;
    }
    this.lastSelect = { id: song.id, at: now };
    this.onSelect(this.songs, index, this.categoryId);
  }

  // 上下方向键在列表项间移动焦点，Home/End 跳到首尾
  handleListKeydown(event) {
    const item = event.target.closest('.contentList-item');
    if (!item) return;

    const items = Array.from(this.listEl.querySelectorAll('.contentList-item'));
    const currentIndex = items.indexOf(item);
    const keyOffset = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: -currentIndex,
      End: items.length - currentIndex - 1
    }[event.key];

    if (keyOffset === undefined) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + keyOffset));
    items[nextIndex]?.focus();
  }
}
