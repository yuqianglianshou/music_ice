

/**
 * 重构事件监听器添加方法
 * @param {Element|NodeList|Array} elements - DOM元素、NodeList或元素数组
 * @param {Object} events - 事件映射对象 {eventName: handler}
 */
export const addEventListeners = (elements, events) => {
  // 将 NodeList 转换为数组
  if (elements instanceof NodeList) {
    elements = Array.from(elements);
  }

  // 确保 elements 是数组
  if (!Array.isArray(elements)) {
    elements = [elements];
  }

  // 过滤掉无效的元素
  elements = elements.filter(el => el && el.addEventListener);

  elements.forEach(element => {
    Object.entries(events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });
  });
}

/** 
 * timeFormatSecondsToMinutes()
 * 秒 -> 分（170s -> 2m50s）
 */
export const timeFormatSecondsToMinutes = function (duration) {
  // 使用向下取整避免显示“多一秒”的问题
  const safeDuration = Math.max(0, duration);
  const totalSeconds = Math.floor(safeDuration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const totalTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  return totalTime;
}
/**
 * 转义 HTML 特殊字符，拼接 innerHTML 前必须调用，
 * 避免歌名、歌手、歌词中含有 < & " 等字符时破坏结构或被当作标签执行。
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
