

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
  const minutes = Math.floor(duration / 60)
  const seconds = Math.ceil(duration - (minutes * 60))
  const totalTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
  return totalTime
}