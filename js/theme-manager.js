/**
 * 主题管理器
 * 支持多套颜色主题，每5分钟自动切换
 */

// 主题配置
const themes = [
  {
    name: 'cyan', // 青色系（默认）
    primary: '#94f4ee',
    secondary: '#35c7d4',
    theme: '#d8fffb',
    bgBase: '#173f4a',
    bgGradient: ['#236a78', '#122a36'],
    aurora: [
      'rgba(255, 138, 92, 0.45)',
      'rgba(255, 193, 90, 0.35)',
      'rgba(255, 105, 155, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(255, 196, 115, 0.5)', pos: '0% 0%' },
      { color: 'rgba(255, 120, 90, 0.45)', pos: '100% 0%' },
      { color: 'rgba(255, 90, 90, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(100, 208, 255, 0.35)', pos: '20% 20%' },
      { color: 'rgba(255, 157, 226, 0.3)', pos: '80% 0%' },
      { color: 'rgba(84, 106, 255, 0.35)', pos: '50% 80%' }
    ]
  },
  {
    name: 'blue', // 蓝色系
    primary: '#9fd2ff',
    secondary: '#4e9dea',
    theme: '#d9efff',
    bgBase: '#1b385d',
    bgGradient: ['#285f95', '#132940'],
    aurora: [
      'rgba(92, 158, 255, 0.45)',
      'rgba(139, 197, 255, 0.35)',
      'rgba(105, 155, 255, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(115, 196, 255, 0.5)', pos: '0% 0%' },
      { color: 'rgba(90, 120, 255, 0.45)', pos: '100% 0%' },
      { color: 'rgba(90, 90, 255, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(100, 208, 255, 0.4)', pos: '20% 20%' },
      { color: 'rgba(157, 226, 255, 0.35)', pos: '80% 0%' },
      { color: 'rgba(84, 106, 255, 0.4)', pos: '50% 80%' }
    ]
  },
  {
    name: 'purple', // 紫色系
    primary: '#d4b3ff',
    secondary: '#9270e8',
    theme: '#eadcff',
    bgBase: '#342c57',
    bgGradient: ['#5e4a95', '#211c38'],
    aurora: [
      'rgba(138, 92, 255, 0.45)',
      'rgba(193, 90, 255, 0.35)',
      'rgba(105, 155, 255, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(196, 115, 255, 0.5)', pos: '0% 0%' },
      { color: 'rgba(120, 90, 255, 0.45)', pos: '100% 0%' },
      { color: 'rgba(90, 90, 255, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(157, 100, 255, 0.4)', pos: '20% 20%' },
      { color: 'rgba(226, 157, 255, 0.35)', pos: '80% 0%' },
      { color: 'rgba(106, 84, 255, 0.4)', pos: '50% 80%' }
    ]
  },
  {
    name: 'green', // 绿色系
    primary: '#9df0c7',
    secondary: '#3ec885',
    theme: '#dcffed',
    bgBase: '#1d4939',
    bgGradient: ['#2f755a', '#142f27'],
    aurora: [
      'rgba(92, 255, 138, 0.45)',
      'rgba(139, 255, 193, 0.35)',
      'rgba(105, 255, 155, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(115, 255, 196, 0.5)', pos: '0% 0%' },
      { color: 'rgba(90, 255, 120, 0.45)', pos: '100% 0%' },
      { color: 'rgba(90, 255, 90, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(100, 255, 208, 0.4)', pos: '20% 20%' },
      { color: 'rgba(157, 255, 226, 0.35)', pos: '80% 0%' },
      { color: 'rgba(84, 255, 106, 0.4)', pos: '50% 80%' }
    ]
  },
  {
    name: 'pink', // 粉色系
    primary: '#ff9cc8',
    secondary: '#e85b98',
    theme: '#ffddeb',
    bgBase: '#563246',
    bgGradient: ['#8a4b68', '#352130'],
    aurora: [
      'rgba(255, 92, 138, 0.45)',
      'rgba(255, 139, 193, 0.35)',
      'rgba(255, 105, 155, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(255, 115, 196, 0.5)', pos: '0% 0%' },
      { color: 'rgba(255, 90, 120, 0.45)', pos: '100% 0%' },
      { color: 'rgba(255, 90, 90, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(255, 100, 208, 0.4)', pos: '20% 20%' },
      { color: 'rgba(255, 157, 226, 0.35)', pos: '80% 0%' },
      { color: 'rgba(255, 84, 106, 0.4)', pos: '50% 80%' }
    ]
  },
  {
    name: 'orange', // 桔红色系
    primary: '#ffd28a',
    secondary: '#ff8a5d',
    theme: '#ffe8bd',
    bgBase: '#563726',
    bgGradient: ['#8c5a36', '#2f211b'],
    aurora: [
      'rgba(92, 255, 232, 0.45)',
      'rgba(139, 255, 241, 0.35)',
      'rgba(105, 255, 235, 0.35)'
    ],
    radialGradients: [
      { color: 'rgba(115, 255, 244, 0.5)', pos: '0% 0%' },
      { color: 'rgba(90, 255, 240, 0.45)', pos: '100% 0%' },
      { color: 'rgba(90, 255, 255, 0.25)', pos: '50% 80%' }
    ],
    bodyAurora: [
      { color: 'rgba(100, 255, 248, 0.4)', pos: '20% 20%' },
      { color: 'rgba(157, 255, 246, 0.35)', pos: '80% 0%' },
      { color: 'rgba(84, 255, 246, 0.4)', pos: '50% 80%' }
    ]
  }
];

class ThemeManager {
  constructor() {
    this.currentThemeIndex = 0;
    this.switchInterval = null;
    // this.switchDuration = 1 * 5 * 1000; // 5秒钟（毫秒）
    this.switchDuration = 5 * 60 * 1000; // 5分钟（毫秒）
    this.init();
  }

  /**
   * 初始化主题管理器
   */
  init() {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this._initialize();
      });
    } else {
      this._initialize();
    }
  }

  /**
   * 内部初始化方法
   */
  _initialize() {
    // 从localStorage读取上次的主题索引
    const savedIndex = localStorage.getItem('themeIndex');
    if (savedIndex !== null) {
      this.currentThemeIndex = parseInt(savedIndex, 10);
      // 确保索引有效
      if (this.currentThemeIndex >= themes.length) {
        this.currentThemeIndex = 0;
      }
    }

    // 应用初始主题
    this.applyTheme(themes[this.currentThemeIndex]);

    // 启动自动切换
    this.startAutoSwitch();
  }

  /**
   * 应用主题
   */
  applyTheme(theme) {
    const root = document.documentElement;
    const body = document.body;

    // 更新CSS变量
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--secondary-color', theme.secondary);
    root.style.setProperty('--theme-color', theme.theme);
    root.style.setProperty('--aurora-a', theme.aurora[0]);
    root.style.setProperty('--aurora-b', theme.aurora[1]);
    root.style.setProperty('--aurora-c', theme.aurora[2]);

    // 更新背景色
    root.style.setProperty('--bg-base', theme.bgBase);
    root.style.setProperty('--bg-gradient-start', theme.bgGradient[0]);
    root.style.setProperty('--bg-gradient-end', theme.bgGradient[1]);

    // 更新body背景。保持轻量，避免滚动时大面积径向渐变重绘。
    body.style.backgroundColor = theme.bgBase;
    body.style.backgroundImage = `
      linear-gradient(135deg, ${theme.bgGradient[0]} 0%, ${theme.bgBase} 52%, ${theme.bgGradient[1]} 100%)
    `;

    // 设置data-theme属性用于CSS选择器
    root.setAttribute('data-theme', theme.name);

    // 保存当前主题索引
    localStorage.setItem('themeIndex', this.currentThemeIndex.toString());
  }

  /**
   * 切换到下一个主题
   */
  switchToNext() {
    this.currentThemeIndex = (this.currentThemeIndex + 1) % themes.length;
    this.applyTheme(themes[this.currentThemeIndex]);
  }

  /**
   * 切换到指定主题
   */
  switchTo(index) {
    if (index >= 0 && index < themes.length) {
      this.currentThemeIndex = index;
      this.applyTheme(themes[this.currentThemeIndex]);
      // 重启自动切换计时器
      this.restartAutoSwitch();
    }
  }

  /**
   * 启动自动切换
   */
  startAutoSwitch() {
    // 清除现有定时器
    if (this.switchInterval) {
      clearInterval(this.switchInterval);
    }

    // 设置新的定时器
    this.switchInterval = setInterval(() => {
      this.switchToNext();
    }, this.switchDuration);
  }

  /**
   * 重启自动切换
   */
  restartAutoSwitch() {
    this.startAutoSwitch();
  }

  /**
   * 停止自动切换
   */
  stopAutoSwitch() {
    if (this.switchInterval) {
      clearInterval(this.switchInterval);
      this.switchInterval = null;
    }
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme() {
    return themes[this.currentThemeIndex];
  }

  /**
   * 获取所有主题
   */
  getAllThemes() {
    return themes;
  }
}

// 创建全局主题管理器实例
const themeManager = new ThemeManager();

// 导出供其他模块使用
export { themeManager, themes };
