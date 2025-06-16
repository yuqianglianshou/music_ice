// 导入所需的配置
import { CONFIG } from './config.js';
import { addEventListeners } from './utils.js';
import { lyricsList } from './musicLyrics.js';
import { lyricsList2 } from './musicLyrics2.js';

/**
 * 歌词管理类
 * 负责歌词的加载、解析、渲染和滚动等功能
 * 
 * 主要功能：
 * 1. 歌词解析：支持两种不同格式的歌词解析
 * 2. 歌词渲染：将歌词文本渲染到DOM中
 * 3. 歌词滚动：支持自动滚动和手动滚动
 * 4. 交互控制：支持点击跳转和滚轮控制
 */
export class LyricsManager {
    /**
     * 初始化歌词管理器
     * 设置基础属性、DOM元素、样式和事件监听
     */
    constructor() {
        // 歌词数据相关属性
        this.currentLyrics = [];      // 当前歌词文本数组
        this.timeouts = [];          // 歌词滚动计时器数组
        this.timerArray = [];        // 歌词时间点数组
        this.currentIndex = 0;       // 当前播放的歌词索引 

        // 滚动控制相关属性
        this.lineHeight = 80;        // 每行歌词的高度
        this.isAutoScrolling = true; // 自动滚动标志
        this.scrollTimer = null;     // 滚动定时器
        this.lastWheelTime = 0;      // 上次滚轮事件时间
        this.wheelThreshold = 50;    // 滚轮事件节流阈值（毫秒）
        this.currentScrollTop = 0;   // 当前滚动位置

        // DOM 元素
        this.initDOMElements();

        // 配置参数
        this.initConfig();

        // 事件处理
        this.bindEvents();

        // 回调函数
        this.onTimeUpdate = null;    // 时间更新回调函数
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
            this.lyricsContainer.style.transition = 'transform 0.3s ease-out';
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
     * 绑定歌词相关事件
     */
    bindEvents() {
        // 双击歌词跳转
        addEventListeners(this.lyricsContainer, {
            'dblclick': (e) => this.handleLyricClick(e)
        });

        // 鼠标滚轮控制
        addEventListeners(this.wrapLyrics, {
            'wheel': (e) => this.handleScroll(e),
            'scroll': (e) => this.handleScrollEnd(e)
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
        if (musicData.type_load_lyrics === CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue) {
            this.currentLyrics = ['纯音乐请欣赏。'];
            this.timerArray = [0];
            this.render();
            this.scrollToActiveLine(false);
            return;
        }

        let lyrics = null;
        if (musicData.type_load_lyrics === CONFIG.LOAD_LYRICS_TYPE.TYPE_1) {
            lyrics = this.parseLyricsType1(musicData);
        } else if (musicData.type_load_lyrics === CONFIG.LOAD_LYRICS_TYPE.TYPE_2) {
            lyrics = this.parseLyricsType2(musicData);
        } else if (musicData.type_load_lyrics === CONFIG.LOAD_LYRICS_TYPE.TYPE_file) {
            if(musicData.lyrics_path && musicData.lyrics_path.trim() !== ''){
                lyrics = await this.parseLyricsType3(musicData);
            }else{
                lyrics = ""
            }
        }

        if (lyrics) {
            this.currentLyrics = lyrics.text;
            this.timerArray = lyrics.timer;
            this.render();
            this.scrollToCenter(0, false);
        } else {
            this.currentLyrics = ['暂无歌词提供。'];
            this.timerArray = [0];
            this.render();
            this.scrollToActiveLine(false);
        }
    }
    /**
     * 解析第一种格式的歌词
     */
    parseLyricsType1(musicData) {
        const currentLyrics = lyricsList.find(item =>
            item.name_path === musicData.name_path
        );

        if (!currentLyrics) return null;

        const lyricsText = currentLyrics.lyrics.map(line =>
            line.substring(line.indexOf(']') + 1)
        );

        const lyricsTimer = currentLyrics.lyrics.map(line => {
            const timeStr = line.substring(1, 10);
            const [minutes, secondsAndMilliseconds] = timeStr.split(':');
            const [seconds, milliseconds] = secondsAndMilliseconds.split('.').map(parseFloat);
            return (parseFloat(minutes) * 60 + parseFloat(seconds) + milliseconds / 1000);
        });

        return { text: lyricsText, timer: lyricsTimer };
    }
    /**
     * 解析第二种格式的歌词
     */
    parseLyricsType2(musicData) {
        const currentLyrics = lyricsList2.find(item =>
            item.name_path === musicData.name_path
        );

        if (!currentLyrics) return null;

        const lyricsText = currentLyrics.lyrics.split('\n');
        const lyricsRegex = /\[(\d{2}:\d{2}(?:\.\d{2,3})?)\](.*)/;

        const lyricsData = lyricsText
            .map(line => {
                const match = line.match(lyricsRegex);
                if (!match) return null;

                const timeStr = match[1];
                const lyricsLine = match[2];
                const [minutes, secondsAndMilliseconds] = timeStr.split(':');
                const [seconds, milliseconds] = secondsAndMilliseconds.split('.').map(parseFloat);
                const timer = parseFloat(minutes) * 60 + parseFloat(seconds) + milliseconds / 1000;

                return { time: timer, text: lyricsLine };
            })
            .filter(line => line !== null);

        return {
            text: lyricsData.map(line => line.text),
            timer: lyricsData.map(line => line.time)
        };
    }
    /**
     * 解析第三种格式的歌词
     */
    async parseLyricsType3(musicData) {
        try {
            const basePath = './music_lyrics/';
            const lyricsPath = basePath + musicData.lyrics_path.split('/').pop();

            const response = await fetch(lyricsPath);
            if (!response.ok) {
                throw new Error(`无法加载歌词文件: ${lyricsPath}`);
            }
            const lyricsContent = await response.text();
            const lyricsText = lyricsContent.split('\n');

            // 支持两种时间格式的正则表达式
            const lyricsRegex = /\[(\d{2}:\d{2}[\.:]?\d{0,3})\](.*)/;

            const lyricsData = lyricsText
                .map(line => {
                    const match = line.match(lyricsRegex);
                    if (!match) return null;

                    const timeStr = match[1];
                    const lyricsLine = match[2].trim();

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
                .filter(line => line !== null);

            return {
                text: lyricsData.map(line => line.text),
                timer: lyricsData.map(line => line.time)
            };
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

        // 添加空白行以确保第一行和最后一行也能滚动到中间
        const paddingLines = Math.floor(this.wrapLyrics.clientHeight / (2 * this.lineHeight));

        // 构建歌词HTML
        const lyricsHTML = [
            // 顶部填充
            ...Array(paddingLines).fill('<div class="lyric padding"><span></span></div>'),
            // 实际歌词
            ...this.currentLyrics.map((text, index) => `
                <div id="line-${index + 1}" 
                     data-time="${this.timerArray[index] || 0}" 
                     class="lyric ${index === 0 ? "active" : ""}">
                    <span>${text}</span>
                </div>
            `),
            // 底部填充
            ...Array(paddingLines).fill('<div class="lyric padding"><span></span></div>')
        ].join('');

        this.lyricsContainer.innerHTML = lyricsHTML;
    }

    /**
   * 更新歌词滚动
   * @param {number} currentTime - 当前播放时间
   */
    update(currentTime) {
        if (!this.timerArray.length) return;
        // 查找当前应该显示的歌词索引
        let currentIndex = this.timerArray.findIndex(time => time > currentTime) - 1;

        // 处理边界情况
        if (currentIndex === -2) { // findIndex 返回 -1 时
            currentIndex = this.timerArray.length - 1;
        } else if (currentIndex === -1) { // 第一句歌词之前
            currentIndex = 0;
        }
        // 只有当索引变化时才更新
        if (currentIndex !== this.currentIndex) {
            this.currentIndex = currentIndex;
            this.updateActiveLine(currentIndex);
            // 只有在自动滚动模式下才滚动到中间
            if (this.isAutoScrolling) {
                this.scrollToCenter(currentIndex);
            }
        }
    }

    /**
     * 将指定行滚动到中间
     * @param {number} index - 歌词索引
     * @param {boolean} smooth - 是否使用平滑滚动
     */
    scrollToCenter(index, smooth = true) {
        if (!this.lyricsContainer || !this.wrapLyrics) return;

        // 考虑顶部填充的行数
        const paddingLines = Math.floor(this.wrapLyrics.clientHeight / (2 * this.lineHeight));
        const adjustedIndex = index + paddingLines;

        const containerHeight = this.wrapLyrics.clientHeight;
        const totalHeight = this.lyricsContainer.scrollHeight;

        // 计算目标偏移量，使当前行居中显示
        let targetOffset = (adjustedIndex * this.lineHeight) - (containerHeight / 2) + (this.lineHeight / 2);

        // 确保不会超出边界
        targetOffset = Math.max(0, Math.min(targetOffset, totalHeight - containerHeight));

        // 更新当前滚动位置
        this.currentScrollTop = targetOffset;

        // 应用滚动
        this.lyricsContainer.style.transition = smooth ? 'transform 0.3s ease-out' : 'none';
        this.lyricsContainer.style.transform = `translateY(-${targetOffset}px)`;
    }

    /**
     * 滚动到活动行
     * @param {boolean} smooth - 是否使用平滑滚动
     */
    scrollToActiveLine(smooth = true) {
        if (!this.lyricsContainer || !this.wrapLyrics) return;

        const containerHeight = this.wrapLyrics.clientHeight;
        const totalHeight = this.currentLyrics.length * this.lineHeight;

        // 计算目标偏移量，使当前行居中显示
        let targetOffset = (this.currentIndex * this.lineHeight) - (containerHeight / 2) + (this.lineHeight / 2);

        // 确保不会超出边界
        targetOffset = Math.max(0, Math.min(targetOffset, totalHeight - containerHeight));

        // 应用滚动
        this.lyricsContainer.style.transition = smooth ? 'transform 0.3s ease-out' : 'none';
        this.lyricsContainer.style.transform = `translateY(-${targetOffset}px)`;
    }
    /**
     * 滚动到指定行
     */
    scrollToLine(index) {
        if (index < 0 || !this.lyricsContainer) return;

        const lineHeight = 80; // 每行歌词的高度
        const containerHeight = this.wrapLyrics.clientHeight;
        const maxScroll = (this.currentLyrics.length - 1) * lineHeight;

        // 计算目标偏移量，使当前行居中显示
        let offset = (lineHeight * index) - (containerHeight / 2) + (lineHeight / 2);

        // 确保不会超出边界
        offset = Math.max(0, Math.min(offset, maxScroll));

        // 使用 transform 进行平滑滚动
        this.lyricsContainer.style.transition = 'transform 0.3s ease-out';
        this.lyricsContainer.style.transform = `translateY(-${offset}px)`;
    }

    /**
     * 更新活动行样式
     */
    updateActiveLine(index) {
        if (!this.lyricsContainer) return;

        // 考虑顶部填充的行数
        const paddingLines = Math.floor(this.wrapLyrics.clientHeight / (2 * this.lineHeight));
        const adjustedIndex = index + paddingLines;

        const lines = this.lyricsContainer.children;
        Array.from(lines).forEach((line, i) => {
            line.classList.toggle('active', i === adjustedIndex);
        });
    }

    /**
    * 处理歌词点击
    */
    handleLyricClick(e) {
        const line = e.target.closest('.lyric');
        if (!line || line.classList.contains('padding')) return;

        const time = parseFloat(line.dataset.time);
        if (isNaN(time)) return;

        // 考虑填充行的偏移
        const paddingLines = Math.floor(this.wrapLyrics.clientHeight / (2 * this.lineHeight));
        const index = Array.from(this.lyricsContainer.children).indexOf(line) - paddingLines;

        this.currentIndex = index;
        this.isAutoScrolling = true;

        if (typeof this.onTimeUpdate === 'function') {
            this.onTimeUpdate(time);
        }

        this.updateActiveLine(index);
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

        // 计算新的滚动位置
        const scrollStep = 160;  // 每次滚动的步长
        const deltaY = e.deltaY > 0 ? scrollStep : -scrollStep;
        this.currentScrollTop += deltaY;

        // 获取容器和内容的高度
        const containerHeight = this.wrapLyrics.clientHeight;
        const contentHeight = this.lyricsContainer.scrollHeight;

        // 限制滚动范围
        this.currentScrollTop = Math.max(0, Math.min(this.currentScrollTop, contentHeight - containerHeight));

        // 应用滚动
        this.lyricsContainer.style.transition = 'transform 0.3s ease-out';
        this.lyricsContainer.style.transform = `translateY(-${this.currentScrollTop}px)`;

        // 清除之前的定时器
        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
        }

        // 3秒后恢复自动滚动
        this.scrollTimer = setTimeout(() => {
            this.isAutoScrolling = true;
            // 获取当前最接近的歌词索引
            const currentIndex = Math.floor(this.currentScrollTop / this.lineHeight);
            this.scrollToCenter(currentIndex);
        }, 3000);
    }

    /**
     * 处理滚动结束
     */
    handleScrollEnd(e) {
        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
        }

        this.scrollTimer = setTimeout(() => {
            this.scrollToLine(this.currentIndex - 1);
        }, this.config.transition.delay);
    }

    /**
     * 清除所有计时器
     */
    clear() {
        this.timeouts.forEach(clearTimeout);
        this.timeouts = [];
        this.currentLyrics = [];
        this.timerArray = [];
        this.currentIndex = 0;
        this.currentScrollTop = 0;  // 重置滚动位置

        if (this.lyricsContainer) {
            this.lyricsContainer.style.transform = 'translateY(0)';
            this.lyricsContainer.innerHTML = '';
        }

        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
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