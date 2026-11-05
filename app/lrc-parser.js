/**
 * LRC 歌词解析（纯函数，不依赖 DOM，便于测试）。
 *
 * 支持的时间格式：[mm:ss.xx]、[mm:ss.xxx]、[mm:ss:xx]、[mm:ss]。
 * [ti:]、[ar:] 等标签行和空歌词行会被忽略。
 * 同一时间戳出现多行时视为“原文 + 翻译”，合并成一行（用换行分隔）并按时间排序。
 *
 * @param {string} content LRC 文件内容
 * @returns {{ text: string[], timer: number[] }} 每行歌词及其开始秒数，两个数组一一对应
 */
export function parseLrc(content) {
  const lyricsText = String(content ?? '').split('\n');

  // 支持两种时间格式的正则表达式
  const lyricsRegex = /\[(\d{2}:\d{2}[\.:]?\d{0,3})\](.*)/;

  // 解析所有歌词行
  const allLyricsData = lyricsText
    .map(line => {
      const match = line.match(lyricsRegex);
      if (!match) return null;

      const timeStr = match[1];
      let lyricsLine = match[2].trim();

      // 处理可能在同一行有重复标题的情况：
      // 如果行中包含 [ti: 等标签，只取时间戳后的第一部分
      if (lyricsLine.includes('[ti:')) {
        lyricsLine = lyricsLine.split('[ti:')[0].trim();
      }

      return { time: parseTimestamp(timeStr), text: lyricsLine };
    })
    .filter(line => line !== null && line.text !== '');

  // 检测是否有重复的时间戳（说明有翻译）
  const timeMap = new Map();
  allLyricsData.forEach(item => {
    if (!timeMap.has(item.time)) {
      timeMap.set(item.time, []);
    }
    timeMap.get(item.time).push(item.text);
  });

  const hasTranslation = Array.from(timeMap.values()).some(texts => texts.length > 1);
  if (!hasTranslation) {
    // 没有翻译：保持文件中的原有顺序
    return {
      text: allLyricsData.map(line => line.text),
      timer: allLyricsData.map(line => line.time)
    };
  }

  // 有翻译：合并相同时间戳的原文和翻译（通常第一个是原文，后面的是翻译）
  const mergedData = [];
  const processedTimes = new Set();
  allLyricsData.forEach(item => {
    if (processedTimes.has(item.time)) return;
    processedTimes.add(item.time);
    mergedData.push({ time: item.time, text: timeMap.get(item.time).join('\n') });
  });

  // 按时间排序
  mergedData.sort((a, b) => a.time - b.time);

  return {
    text: mergedData.map(line => line.text),
    timer: mergedData.map(line => line.time)
  };
}

function parseTimestamp(timeStr) {
  if (timeStr.includes('.')) {
    // 00:29.299 / 00:29.29 格式
    const [minutes, secondsAndMilliseconds] = timeStr.split(':');
    const [seconds, milliseconds] = secondsAndMilliseconds.split('.');
    return parseFloat(minutes) * 60 +
      parseFloat(seconds) +
      parseFloat(milliseconds) / (milliseconds.length === 2 ? 100 : 1000);
  }
  // 00:15:50 / 00:15 格式
  const [minutes, seconds, milliseconds] = timeStr.split(':');
  return parseFloat(minutes) * 60 +
    parseFloat(seconds) +
    (milliseconds ? parseFloat(milliseconds) / 100 : 0);
}
