/**
 * 歌单悬浮描述卡片
 * 桌面端鼠标停留在列表项上时，在指针旁显示该歌曲的 des 描述；触屏设备不启用。
 */

const HEADER_HEIGHT = 80;   // 顶部导航栏高度，卡片不压住它
const FOOTER_HEIGHT = 100;  // 底部控制栏高度，卡片不压住它
const CARD_WIDTH = 300;
const SHOW_DELAY = 120;
const SCROLL_IDLE_DELAY = 140;

function canUseHover() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function debounce(func, wait) {
  let timeout;
  const debounced = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.list - 歌曲列表容器
 * @param {(item: HTMLElement) => object|null} options.getSongForItem - 由列表项元素取得歌曲模型
 * @param {HTMLElement[]} [options.hideOnEnter] - 鼠标进入这些区域时隐藏卡片（歌词面板、底部控制栏）
 */
export function initHoverCard({ list, getSongForItem, hideOnEnter = [] }) {
  const card = document.getElementById('hoverWindow');
  const content = document.getElementById('hoverContent');
  if (!list || !card || !content) return;

  let hoverItem = null;
  let isScrolling = false;
  let scrollTimer = null;

  function hide() {
    card.classList.remove('visible');
    content.textContent = '';
  }

  function show(event) {
    if (!canUseHover() || isScrolling) return;

    // 指针落在顶部导航或底部控制栏区域时不显示
    if (event.clientY <= HEADER_HEIGHT || event.clientY >= window.innerHeight - FOOTER_HEIGHT) {
      hide();
      return;
    }

    const item = event.target.closest('.contentList-item');
    const song = item ? getSongForItem(item) : null;
    if (!song?.des) {
      hide();
      return;
    }

    // 先填内容再取高度，用于计算位置
    content.textContent = song.des;
    const cardHeight = card.offsetHeight;

    let left = event.clientX;
    let top = event.clientY + 20;
    if (left + CARD_WIDTH > window.innerWidth) {
      left = window.innerWidth - CARD_WIDTH - 20;
    }
    if (top + cardHeight > window.innerHeight - FOOTER_HEIGHT) {
      top = event.clientY - cardHeight - 10;
    }
    if (top < HEADER_HEIGHT) {
      top = HEADER_HEIGHT + 10;
    }

    card.style.left = `${Math.max(10, left)}px`;
    card.style.top = `${top}px`;
    requestAnimationFrame(() => {
      card.classList.toggle('visible', content.textContent.trim() !== '');
    });
  }

  const debouncedShow = debounce(show, SHOW_DELAY);

  list.addEventListener('mouseover', event => {
    if (!canUseHover() || isScrolling) return;
    const item = event.target.closest('.contentList-item');
    if (!item || item === hoverItem) return;
    hoverItem = item;
    debouncedShow(event);
  });

  list.addEventListener('mouseleave', () => {
    hoverItem = null;
    debouncedShow.cancel();
    hide();
  });

  // 滚动过程中不显示卡片，停止滚动片刻后恢复
  list.addEventListener('scroll', () => {
    isScrolling = true;
    hoverItem = null;
    hide();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
    }, SCROLL_IDLE_DELAY);
  }, { passive: true });

  hideOnEnter.filter(Boolean).forEach(area => area.addEventListener('mouseenter', hide));

  document.addEventListener('click', event => {
    if (!event.target.closest('.contentList-item')) {
      hide();
    }
  });
}
