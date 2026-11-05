import { escapeHtml } from './utils.js';

// 同一首歌在该间隔内的重复点击视为误触（双击、触屏抖动），只响应一次
const REPEAT_SELECT_GUARD = 360;

/**
 * 搜索用的归一化：NFKC 统一全角/半角和兼容字符，转小写并去掉空白，
 * 让“周杰伦”“Jay Chou”“jaychou”这类输入都能匹配。
 */
function normalizeForSearch(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

/**
 * 转义文本并把与关键词相同的片段包上 <mark>。
 * 高亮只按原文做不区分大小写的查找；归一化后才能匹配上的（如忽略空格）只过滤、不高亮。
 */
function highlightText(text, keyword) {
  const source = String(text || '');
  const needle = keyword.trim().toLowerCase();
  const start = needle ? source.toLowerCase().indexOf(needle) : -1;
  if (start < 0) return escapeHtml(source);

  const end = start + needle.length;
  return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(source.slice(start, end))}</mark>${escapeHtml(source.slice(end))}`;
}

/**
 * 歌单视图：分类 tab + 搜索框 + 歌曲列表
 *
 * 只负责展示和用户输入，不直接操作播放：
 * - 当前展示哪个分类、搜索关键词、哪些歌曲由视图自己维护；
 * - 搜索只在当前分类内按歌名、歌手过滤，切换分类时保留关键词；
 * - 哪首是“正在播放”通过 isCurrent(song) 询问外部；
 * - 用户点歌时调用 onSelect(songs, index, categoryId)，由外部决定如何播放。
 *   songs 始终是整个分类的列表（不是搜索结果），清空搜索后上一首/下一首仍按完整分类走。
 */
export class PlaylistView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.listEl - 歌曲列表容器
   * @param {HTMLElement} [options.countEl] - 显示“N 首”的元素
   * @param {HTMLElement} options.tabListEl - 分类 tab 容器
   * @param {HTMLInputElement} [options.searchInput] - 搜索输入框
   * @param {HTMLElement} [options.searchClearBtn] - 清空搜索按钮
   * @param {{id: string, label: string}[]} options.categories - 分类列表（含“全部”）
   * @param {(categoryId: string) => object[]} options.getSongs
   * @param {(song: object) => boolean} options.isCurrent
   * @param {(songs: object[], index: number, categoryId: string) => void} options.onSelect
   */
  constructor({ listEl, countEl, tabListEl, searchInput, searchClearBtn, categories, getSongs, isCurrent, onSelect }) {
    this.listEl = listEl;
    this.countEl = countEl;
    this.tabListEl = tabListEl;
    this.searchInput = searchInput;
    this.searchClearBtn = searchClearBtn;
    this.getSongs = getSongs;
    this.isCurrent = isCurrent;
    this.onSelect = onSelect;

    this.categoryId = '';
    this.categorySongs = [];  // 当前分类的完整歌曲列表
    this.songs = [];          // 实际展示的歌曲（搜索过滤后），列表项 data-id 是它的下标
    this.query = '';
    this.lastSelect = { id: '', at: 0 };
    this.activeItem = null;   // 当前高亮的列表项缓存，切歌时只改新旧两项
    this.searchKeys = new WeakMap(); // 歌曲 -> 归一化后的检索文本，避免每次输入重复计算

    this.renderTabs(categories);
    this.bindListEvents();
    this.bindSearchEvents();
  }

  /**
   * 切换到指定分类并重新渲染列表（已是当前分类时不重复渲染）
   */
  showCategory(categoryId) {
    if (categoryId === this.categoryId) return;
    this.categoryId = categoryId;
    this.categorySongs = this.getSongs(categoryId);
    this.syncTabs();
    this.applyFilter();
  }

  /**
   * 设置搜索关键词并刷新列表
   */
  setQuery(query) {
    const nextQuery = String(query || '');
    if (nextQuery === this.query) return;
    this.query = nextQuery;
    this.searchClearBtn?.toggleAttribute('hidden', !nextQuery);
    this.applyFilter();
    // 结果变了就回到顶部，避免停在旧滚动位置看到空白
    this.listEl.scrollTop = 0;
  }

  focusSearch() {
    this.searchInput?.focus();
    this.searchInput?.select();
  }

  getSearchKey(song) {
    let key = this.searchKeys.get(song);
    if (key === undefined) {
      key = normalizeForSearch(`${song.name || ''}\n${song.author || ''}`);
      this.searchKeys.set(song, key);
    }
    return key;
  }

  applyFilter() {
    const keyword = normalizeForSearch(this.query);
    this.songs = keyword
      ? this.categorySongs.filter(song => this.getSearchKey(song).includes(keyword))
      : this.categorySongs;
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

    // 列表为空时 children[0] 是空状态提示，不参与 Tab 焦点
    const firstItem = this.songs.length ? this.listEl.children[0] : null;
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
    const isSearching = !!normalizeForSearch(this.query);
    if (this.countEl) {
      this.countEl.textContent = isSearching
        ? `${this.songs.length} / ${this.categorySongs.length} 首`
        : `${this.songs.length} 首`;
    }

    if (!this.songs.length) {
      const empty = document.createElement('div');
      empty.className = 'contentList-empty';
      empty.textContent = isSearching ? `没有找到与“${this.query.trim()}”相关的歌曲` : '这个分类还没有歌曲';
      this.listEl.replaceChildren(empty);
      this.activeItem = null;
      return;
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
          <div class="item-title text-ol">${highlightText(songName, this.query)}</div>
          <div class="item-author text-ol">${highlightText(author, this.query)}</div>
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
    // 播放队列用完整分类，从被点的那首开始
    const queueIndex = this.categorySongs.indexOf(song);
    this.onSelect(this.categorySongs, queueIndex >= 0 ? queueIndex : 0, this.categoryId);
  }

  // ==================== 搜索 ====================

  bindSearchEvents() {
    const input = this.searchInput;
    if (!input) return;

    // 两三百首的过滤和重绘只需几毫秒，直接同步处理，输入即见结果
    const scheduleFilter = () => this.setQuery(input.value);

    input.addEventListener('input', event => {
      // 中文输入法拼写过程中（拼音还没上屏）不过滤，等 compositionend 再处理，避免列表闪成空结果
      if (event.isComposing) return;
      scheduleFilter();
    });
    input.addEventListener('compositionend', scheduleFilter);

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && input.value) {
        // 有内容时 Esc 只清空搜索，不冒泡去关闭歌词面板等
        event.preventDefault();
        event.stopPropagation();
        this.clearSearch();
      } else if (event.key === 'ArrowDown' || (event.key === 'Enter' && !event.isComposing)) {
        // 方向下键 / 回车进入结果列表，回车直接播放第一条结果
        const firstItem = this.listEl.querySelector('.contentList-item');
        if (!firstItem) return;
        event.preventDefault();
        if (event.key === 'Enter') {
          firstItem.click();
        } else {
          firstItem.focus();
        }
      }
    });

    this.searchClearBtn?.addEventListener('click', () => {
      this.clearSearch();
      input.focus();
    });
  }

  clearSearch() {
    if (this.searchInput) this.searchInput.value = '';
    this.setQuery('');
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

    // 在第一项按上方向键回到搜索框
    if (event.key === 'ArrowUp' && currentIndex === 0 && this.searchInput) {
      event.preventDefault();
      this.searchInput.focus();
      return;
    }

    if (keyOffset === undefined) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + keyOffset));
    items[nextIndex]?.focus();
  }
}
