/**
 * 页面底部的轻提示（toast）
 */

const NOTICE_DURATION = 3600;
let noticeTimer = null;

export function showNotice(message) {
  const notice = document.querySelector('[app-notice]');
  if (!notice) return;

  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.classList.remove('visible');
  }, NOTICE_DURATION);
}

export function showPlaybackError(error, prefix = '播放失败') {
  const detail = error?.message ? `：${error.message}` : '';
  showNotice(`${prefix}${detail}，请检查音频文件是否存在或已损坏`);
}
