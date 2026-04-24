// 导入所需的配置
import { CONFIG } from './config.js';
import { addEventListeners } from './utils.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 歌词管理类
 * 负责歌词的加载、解析、渲染和滚动等功能
 * 
 * 主要功能：
 * 1. 歌词解析：支持两种不同格式的歌词解析
 * 2. 歌词渲染：将歌词文本渲染到DOM中
 * 3. 歌词滚动：根据播放进度自动滚动，当前行居中显示
 * 4. 歌词高亮：当前播放行高亮显示
 */
export class LyricsManager {
    /**
     * 初始化歌词管理器
     */
    constructor() {
        // 歌词数据相关属性
        this.currentLyrics = [];      // 当前歌词文本数组
        this.timerArray = [];         // 歌词时间点数组
        this.currentIndex = -1;       // 当前播放的歌词索引
        this.lyricLines = [];         // 实际歌词行节点缓存
        this.activeLine = null;       // 当前高亮行节点缓存
        this.lineMetrics = [];        // 歌词行布局缓存
        this.lyricsTotalHeight = 0;   // 歌词内容总高度缓存
        this.wrapHeight = 0;          // 歌词可视容器高度缓存

        // 滚动控制相关属性
        this.lineHeight = 0;          // 每行歌词的实际高度（动态计算）
        this.isAutoScrolling = true;  // 自动滚动标志
        this.scrollTimer = null;      // 滚动定时器
        this.resizeTimer = null;      // 尺寸变化重算定时器
        this.lastWheelTime = 0;       // 上次滚轮事件时间
        this.wheelThreshold = 50;     // 滚轮事件节流阈值（毫秒）

        // DOM 元素
        this.initDOMElements();

        // 配置参数
        this.initConfig();

        // 事件处理
        this.bindEvents();

        // 回调函数
        this.onTimeUpdate = null;     // 时间更新回调函数
    }

    /**
     * 初始化DOM元素并设置基础样式
     * @private
     */
    initDOMElements() {
        this.lyricsContainer = document.querySelector('[play-lyrics]');
        this.wrapLyrics = document.querySelector('[wrap-lyrics]');

        if (this.wrapLyrics) {
            this.wrapLyrics.style.position = 'relative';
            this.wrapLyrics.style.overflow = 'hidden';
        }
        if (this.lyricsContainer) {
            this.lyricsContainer.style.position = 'absolute';
            this.lyricsContainer.style.width = '100%';
        }
    }

    /**
     * 初始化配置参数
     * @private
     */
    initConfig() {
        this.config = {
            scrollSpeed: CONFIG.SCROLL_SPEED,
            transition: {
                delay: CONFIG.TRANSITION.DELAY,
                interval: CONFIG.TRANSITION.INTERVAL,
                reduce: CONFIG.TRANSITION.REDUCE
            }
        };
    }

    /**
     * 计算实际的歌词行高度
     * @private
     */
    calculateLineHeight() {
        if (!this.lyricsContainer || !this.wrapLyrics) {
            this.lineHeight = 30; // 默认值
            return;
        }

        // 如果已经有歌词行，直接测量第一行
        const firstLine = this.lyricLines[0] || this.lyricsContainer.querySelector('.lyric:not(.padding)');
        if (firstLine) {
            const rect = firstLine.getBoundingClientRect();
            this.lineHeight = rect.height;
            if (this.lineHeight > 0 && this.lineHeight < 200) {
                return; // 使用测量到的值
            }
        }

        // 如果没有歌词行，创建临时元素测量
        const tempLine = document.createElement('div');
        tempLine.className = 'lyric';
        tempLine.innerHTML = '<span>测试行</span>';
        tempLine.style.visibility = 'hidden';
        tempLine.style.position = 'absolute';
        tempLine.style.top = '-9999px';
        
        this.wrapLyrics.appendChild(tempLine);
        const height = tempLine.offsetHeight;
        this.wrapLyrics.removeChild(tempLine);
        
        this.lineHeight = height > 0 && height < 200 ? height : 30;
    }

    /**
     * 缓存歌词行节点和布局数据，避免播放过程中重复查询和强制布局。
     * @private
     */
    cacheLyricLayout() {
        if (!this.lyricsContainer || !this.wrapLyrics) return;

        this.lyricLines = Array.from(this.lyricsContainer.querySelectorAll('.lyric:not(.padding)'));
        this.activeLine = this.lyricsContainer.querySelector('.lyric.active:not(.padding)');
        this.wrapHeight = this.wrapLyrics.clientHeight;
        this.lyricsTotalHeight = this.lyricsContainer.scrollHeight;
        this.lineMetrics = this.lyricLines.map(line => ({
            offsetTop: line.offsetTop,
            height: line.offsetHeight
        }));
        this.calculateLineHeight();
    }

    /**
     * 用二分查找当前歌词行，避免每次从尾部线性扫描。
     * @private
     */
    findLyricIndex(currentTime) {
        let left = 0;
        let right = this.timerArray.length - 1;
        let result = 0;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.timerArray[mid] <= currentTime) {
                result = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return Math.max(0, Math.min(result, this.timerArray.length - 1));
    }

    /**
     * 绑定歌词相关事件
     */
    bindEvents() {
        // 双击歌词跳转
        addEventListeners(this.lyricsContainer, {
            'dblclick': (e) => this.handleLyricClick(e)
        });

        // 鼠标滚轮控制
        addEventListeners(this.wrapLyrics, {
            'wheel': (e) => this.handleScroll(e)
        });

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.cacheLyricLayout();
                if (this.currentIndex >= 0) {
                    this.scrollToCenter(this.currentIndex, false);
                }
            }, 150);
        });
    }

    /**
     * 加载歌词
     * @param {Object} musicData - 音乐数据对象
     */
    async loadLyrics(musicData) {
        if (!musicData) return;

        // 清除现有歌词
        this.clear();
        this.isAutoScrolling = true; // 重置自动滚动标志

        // 处理纯音乐
        const lyricsType = musicData.lyrics_type ?? musicData.type_load_lyrics;

        if (lyricsType === CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue) {
            this.currentLyrics = ['纯音乐请欣赏。'];
            this.timerArray = [0];
            this.render();
            return;
        }

        let lyrics = null;
        if (lyricsType === CONFIG.LOAD_LYRICS_TYPE.TYPE_file) {
            const lyricFile = musicData.lyrics_file ?? musicData.lyrics_path;
            if (lyricFile && lyricFile.trim() !== '') {
                lyrics = await this.parseLyricsType(musicData);
            } else {
                lyrics = null;
            }
        }

        if (lyrics) {
            this.currentLyrics = lyrics.text;
            this.timerArray = lyrics.timer;
            this.render();
            this.currentIndex = -1; // 重置索引
        } else {
            this.currentLyrics = ['暂无歌词提供。'];
            this.timerArray = [0];
            this.render();
            this.currentIndex = -1;
        }
    }
    /**
     * 解析歌词文件
     */
    async parseLyricsType(musicData) {
        try {
            const rawPath = (musicData.lyrics_file || musicData.lyrics_path || '').trim();
            const isDirectPath = (
                rawPath.startsWith('./') ||
                rawPath.startsWith('/') ||
                rawPath.startsWith('http')
            );

            const fileName = rawPath.split('/').pop();
            const typeScopedPath = `./media/${musicData.song_path || musicData.type_path || ''}${fileName}`;
            const legacyPath = `./assets/lyrics/${fileName}`;
            const candidates = isDirectPath
                ? Array.from(new Set([rawPath, typeScopedPath, legacyPath]))
                : [typeScopedPath, legacyPath];

            let response = null;
            let lyricsPath = '';
            for (const candidate of candidates) {
                response = await fetch(candidate);
                if (response.ok) {
                    lyricsPath = candidate;
                    break;
                }
            }

            if (!response || !response.ok) {
                throw new Error(`无法加载歌词文件: ${candidates.join(' | ')}`);
            }
            const lyricsContent = await response.text();
            const lyricsText = lyricsContent.split('\n');

            // 支持两种时间格式的正则表达式
            const lyricsRegex = /\[(\d{2}:\d{2}[\.:]?\d{0,3})\](.*)/;

            // 解析所有歌词行
            const allLyricsData = lyricsText
                .map(line => {
                    const match = line.match(lyricsRegex);
                    if (!match) return null;

                    const timeStr = match[1];
                    let lyricsLine = match[2].trim();
                    
                    // 处理可能在同一行有重复标题的情况（如第45行）
                    // 如果行中包含 [ti: 等标签，只取时间戳后的第一部分
                    if (lyricsLine.includes('[ti:')) {
                        lyricsLine = lyricsLine.split('[ti:')[0].trim();
                    }

                    // 处理时间戳
                    let timer = 0;
                    if (timeStr.includes('.')) {
                        // 处理 00:29.299 格式
                        const [minutes, secondsAndMilliseconds] = timeStr.split(':');
                        const [seconds, milliseconds] = secondsAndMilliseconds.split('.');
                        timer = parseFloat(minutes) * 60 +
                            parseFloat(seconds) +
                            parseFloat(milliseconds) / (milliseconds.length === 2 ? 100 : 1000);
                    } else {
                        // 处理 00:15:50 格式
                        const [minutes, seconds, milliseconds] = timeStr.split(':');
                        timer = parseFloat(minutes) * 60 +
                            parseFloat(seconds) +
                            (milliseconds ? parseFloat(milliseconds) / 100 : 0);
                    }

                    return { time: timer, text: lyricsLine };
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

            // 检查是否有重复时间戳
            const hasTranslation = Array.from(timeMap.values()).some(texts => texts.length > 1);

            if (hasTranslation) {
                // 有翻译的情况：合并相同时间戳的原文和翻译
                const mergedData = [];
                const processedTimes = new Set();

                allLyricsData.forEach(item => {
                    if (processedTimes.has(item.time)) return;
                    processedTimes.add(item.time);

                    const texts = timeMap.get(item.time);
                    if (texts.length > 1) {
                        // 有多个文本，合并为一行（原文 + 翻译）
                        // 通常第一个是原文，后面的是翻译
                        const mergedText = texts.join('\n');
                        mergedData.push({ time: item.time, text: mergedText });
                    } else {
                        // 只有一个文本，直接使用
                        mergedData.push(item);
                    }
                });

                // 按时间排序
                mergedData.sort((a, b) => a.time - b.time);

                return {
                    text: mergedData.map(line => line.text),
                    timer: mergedData.map(line => line.time)
                };
            } else {
                // 没有翻译的情况：使用原有逻辑
                return {
                    text: allLyricsData.map(line => line.text),
                    timer: allLyricsData.map(line => line.time)
                };
            }
        } catch (error) {
            console.error('解析歌词文件失败:', error);
            return null;
        }
    }

    /**
     * 渲染歌词
     */
    render() {
        if (!this.lyricsContainer) return;

        // 计算需要添加的填充行数（使第一行和最后一行也能居中）
        const containerHeight = this.wrapLyrics ? this.wrapLyrics.clientHeight : 400;
        const estimatedLineHeight = 30; // 临时估算值
        const paddingLines = Math.ceil(containerHeight / (2 * estimatedLineHeight));

        // 构建歌词HTML
        const lyricsHTML = [
            // 顶部填充
            ...Array(paddingLines).fill('<div class="lyric padding"><span></span></div>'),
            // 实际歌词
            ...this.currentLyrics.map((text, index) => {
                const safeText = escapeHtml(text).replace(/\n/g, '<br>');
                return `
                <div class="lyric" data-index="${index}" data-time="${this.timerArray[index] || 0}">
                    <span>${safeText}</span>
                </div>
            `;
            }),
            // 底部填充
            ...Array(paddingLines).fill('<div class="lyric padding"><span></span></div>')
        ].join('');

        this.lyricsContainer.innerHTML = lyricsHTML;
        this.currentIndex = -1;
        this.lyricLines = Array.from(this.lyricsContainer.querySelectorAll('.lyric:not(.padding)'));
        this.activeLine = null;

        // 渲染后缓存布局，播放过程中直接复用。
        requestAnimationFrame(() => {
            this.cacheLyricLayout();
        });
    }

    /**
     * 更新歌词滚动和高亮
     * @param {number} currentTime - 当前播放时间
     */
    update(currentTime) {
        if (!this.timerArray.length || !this.lyricsContainer) return;

        const currentIndex = this.findLyricIndex(currentTime);

        // 如果索引变化了，更新高亮和滚动
        if (currentIndex !== this.currentIndex) {
            this.currentIndex = currentIndex;
            this.updateHighlight(currentIndex);
            if (this.isAutoScrolling) {
                this.scrollToCenter(currentIndex);
            }
        }
    }

    /**
     * 更新高亮状态
     * @param {number} index - 歌词索引（实际歌词索引，不包括padding）
     */
    updateHighlight(index) {
        if (!this.lyricsContainer || this.lyricLines.length === 0) return;

        // 确保索引在有效范围内
        const validIndex = Math.max(0, Math.min(index, this.lyricLines.length - 1));
        const nextLine = this.lyricLines[validIndex];
        if (!nextLine || nextLine === this.activeLine) return;

        this.activeLine?.classList.remove('active');
        nextLine.classList.add('active');
        this.activeLine = nextLine;
    }

    /**
     * 将指定行滚动到中间
     * @param {number} index - 歌词索引（实际歌词索引，不包括padding）
     * @param {boolean} smooth - 是否使用平滑滚动
     */
    scrollToCenter(index, smooth = true) {
        if (!this.lyricsContainer || !this.wrapLyrics) return;
        if (!this.lyricLines.length || !this.lineMetrics.length) {
            this.cacheLyricLayout();
        }
        if (!this.lyricLines.length || !this.lineMetrics.length) return;

        // 确保索引在有效范围内
        const validIndex = Math.max(0, Math.min(index, this.lineMetrics.length - 1));
        const targetMetric = this.lineMetrics[validIndex];
        if (!targetMetric) return;

        // 计算目标偏移量，使目标行的中心点对齐到容器的中心点
        const targetOffset = targetMetric.offsetTop + targetMetric.height / 2 - this.wrapHeight / 2;

        // 确保不会超出边界
        const finalOffset = Math.max(0, Math.min(targetOffset, this.lyricsTotalHeight - this.wrapHeight));

        // 应用滚动
        this.lyricsContainer.style.transition = smooth
            ? 'transform 0.52s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'none';
        this.lyricsContainer.style.transform = `translate3d(0, -${finalOffset}px, 0)`;
    }

    /**
     * 处理歌词点击
     */
    handleLyricClick(e) {
        const line = e.target.closest('.lyric');
        if (!line || line.classList.contains('padding')) return;

        const index = parseInt(line.dataset.index);
        if (isNaN(index)) return;

        const time = parseFloat(line.dataset.time);
        if (isNaN(time)) return;

        this.currentIndex = index;
        this.isAutoScrolling = true;

        if (typeof this.onTimeUpdate === 'function') {
            this.onTimeUpdate(time);
        }

        this.updateHighlight(index);
        this.scrollToCenter(index);
    }

    /**
     * 处理滚动
     */
    handleScroll(e) {
        e.preventDefault();
        const now = Date.now();

        // 节流处理
        if (now - this.lastWheelTime < this.wheelThreshold) {
            return;
        }
        this.lastWheelTime = now;

        // 暂时禁用自动滚动
        this.isAutoScrolling = false;

        // 清除之前的定时器
        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
        }

        // 3秒后恢复自动滚动
        this.scrollTimer = setTimeout(() => {
            this.isAutoScrolling = true;
            // 恢复到当前播放行
            if (this.currentIndex >= 0) {
                this.scrollToCenter(this.currentIndex);
            }
        }, 3000);
    }

    /**
     * 清除所有计时器
     */
    clear() {
        this.currentLyrics = [];
        this.timerArray = [];
        this.currentIndex = -1;
        this.lyricLines = [];
        this.activeLine = null;
        this.lineMetrics = [];
        this.lyricsTotalHeight = 0;
        this.wrapHeight = 0;
        this.lineHeight = 0;

        if (this.lyricsContainer) {
            this.lyricsContainer.style.transform = 'translate3d(0, 0, 0)';
            this.lyricsContainer.innerHTML = '';
        }

        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
            this.scrollTimer = null;
        }
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        this.isAutoScrolling = true; // 重置自动滚动标志
    }

    /**
     * 设置时间更新回调
     * @param {Function} callback - 时间更新回调函数
     */
    setTimeUpdateCallback(callback) {
        this.onTimeUpdate = callback;
    }
}
