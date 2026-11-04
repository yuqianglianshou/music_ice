import { showNotice } from './notice.js';

/**
 * 下载歌曲音频
 * 优先用 fetch + Blob 下载，保证文件名生效；跨域或内存不足等失败时退回直接链接下载。
 */

function getAbsoluteUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch (_) {
    return url;
  }
}

// 下载文件名统一为“歌名 - 歌手.扩展名”，并替换系统不允许的字符
function getDownloadFileName(song) {
  const fileName = song.fileName || 'music.mp3';
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.mp3';
  const author = song.author ? ` - ${song.author}` : '';
  return `${song.name || 'music'}${author}${extension}`.replace(/[\\/:*?"<>|]/g, '_');
}

function triggerDownload(url, fileName, revokeUrl = false) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    if (revokeUrl) {
      URL.revokeObjectURL(url);
    }
  }, 3000);
}

export async function downloadSong(song) {
  if (!song) {
    showNotice('暂无可下载的音频');
    return;
  }
  if (!song.audioUrl) {
    showNotice('音频文件不可用，请检查文件路径');
    return;
  }

  const audioUrl = getAbsoluteUrl(song.audioUrl);
  const fileName = getDownloadFileName(song);
  showNotice('正在准备下载音频...');

  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('empty audio file');
    }

    triggerDownload(URL.createObjectURL(blob), fileName, true);
  } catch (error) {
    console.warn('Blob 下载失败，尝试直接下载:', error);
    triggerDownload(audioUrl, fileName);
  }
  showNotice('开始下载音频');
}
