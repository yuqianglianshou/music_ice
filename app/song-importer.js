// ==================== 配置与状态 ====================

const CATEGORY_CONFIG = [
  { key: 'dongmanyingshi', label: '动漫影视', catalogFile: 'dongmanyingshi.js', folder: 'dongmanyingshi', folderConst: 'FILE_MUSIC_DONGMANYINGSHI' },
  { key: 'huaijiujinqv', label: '怀旧金曲', catalogFile: 'huaijiujinqv.js', folder: 'huaijiujinqv', folderConst: 'FILE_MUSIC_HUAIJIUJINQV' },
  { key: 'jiezoulvdong', label: '节奏律动', catalogFile: 'jiezoulvdong.js', folder: 'jiezoulvdong', folderConst: 'FILE_MUSIC_JIEZOULVDONG' },
  { key: 'liuxingjingdian', label: '流行经典', catalogFile: 'liuxingjingdian.js', folder: 'liuxingjingdian', folderConst: 'FILE_MUSIC_LIUXINGJINGDIAN' },
  { key: 'minyao', label: '民谣', catalogFile: 'minyao.js', folder: 'minyao', folderConst: 'FILE_MUSIC_MINYAO' },
  { key: 'qingyinyue', label: '轻音乐', catalogFile: 'qingyinyue.js', folder: 'qingyinyue', folderConst: 'FILE_MUSIC_QINGYINYUE' },
  { key: 'shangganzhiyu', label: '伤感治愈', catalogFile: 'shangganzhiyu.js', folder: 'shangganzhiyu', folderConst: 'FILE_MUSIC_SHANGGANZHIYU' },
  { key: 'shishipeiyue', label: '史诗配乐', catalogFile: 'shishipeiyue.js', folder: 'shishipeiyue', folderConst: 'FILE_MUSIC_SHISHIPEIYUE' }
];

const THUMB_SIZE = 160;
const ROOT_DB_NAME = 'music-ice-importer';
const ROOT_STORE_NAME = 'settings';
const ROOT_HANDLE_KEY = 'project-root-handle';
const IMPORT_SIGNAL_KEY = 'musicIceCatalogUpdatedAt';
const LAST_CATEGORY_KEY = 'musicIceImporterLastCategory';
const IMPORT_LOCK_NAME = 'music-ice-importer-write';
const IMPORT_LOG_KEY = 'musicIceImporterLogs';
const MAX_IMPORT_LOGS = 120;
const IMPORTER_VERSION = '20260604-05';
const WEBP_DEFAULT_IMAGE_IDS = new Set([18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33]);
const DEFAULT_IMAGE_COUNT = 53;
const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'wav', 'ogg']);
const LYRIC_EXTENSIONS = new Set(['lrc', 'txt']);
const COVER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

const state = {
  projectRootHandle: null,
  importChannel: 'BroadcastChannel' in window ? new BroadcastChannel('music-ice-importer') : null,
  duplicateCheckId: 0,
  catalogSongs: [],
  defaultCoverPath: '',
  isSubmitting: false
};

const elements = {
  pickRoot: document.getElementById('pick-root'),
  rootStatus: document.getElementById('root-status'),
  form: document.getElementById('import-form'),
  category: document.getElementById('category'),
  songName: document.getElementById('song-name'),
  author: document.getElementById('author'),
  time: document.getElementById('time'),
  description: document.getElementById('description'),
  baseName: document.getElementById('base-name'),
  pickSongFolder: document.getElementById('pick-song-folder'),
  songFolderStatus: document.getElementById('song-folder-status'),
  songFile: document.getElementById('song-file'),
  lyricsFile: document.getElementById('lyrics-file'),
  coverFile: document.getElementById('cover-file'),
  songFileName: document.getElementById('song-file-name'),
  lyricsFileName: document.getElementById('lyrics-file-name'),
  coverFileName: document.getElementById('cover-file-name'),
  toolVersion: document.getElementById('tool-version'),
  songSearch: document.getElementById('song-search'),
  searchCategory: document.getElementById('search-category'),
  searchSummary: document.getElementById('search-summary'),
  searchResults: document.getElementById('search-results'),
  preview: document.getElementById('preview'),
  log: document.getElementById('log'),
  resetForm: document.getElementById('reset-form'),
  submitButton: document.querySelector('#import-form button[type="submit"]'),
  formControls: document.querySelectorAll('#import-form input, #import-form select, #import-form textarea, #import-form button'),
  toast: document.getElementById('toast'),
  formStatus: document.getElementById('form-status'),
  resultBanner: document.getElementById('result-banner')
};

let toastTimer = null;

// ==================== 初始化与事件绑定 ====================

init().catch(error => {
  addLog(error.message || '初始化失败', 'error');
});

async function init() {
  renderToolVersion();
  renderCategoryOptions();
  renderSearchCategoryOptions();
  bindEvents();
  restoreLogs();
  renderPreview();
  renderSearchResults();
  updateFileHints();
  checkSupport();
  await restoreProjectRoot();
  setFeedback('等待添加歌曲');
  addLog(`导入工具版本：${IMPORTER_VERSION}`, 'success');
}

function renderToolVersion() {
  if (!elements.toolVersion) return;
  elements.toolVersion.textContent = `导入脚本版本：${IMPORTER_VERSION}`;
}

function checkSupport() {
  if (window.isSecureContext && 'showDirectoryPicker' in window) return;
  addLog('当前浏览器环境不支持直接写入本地文件。请在 Chromium 浏览器里通过 localhost 打开这个页面。', 'error');
}

function bindEvents() {
  elements.pickRoot.addEventListener('click', pickProjectRoot);
  elements.pickSongFolder.addEventListener('click', pickSongFolder);
  elements.form.addEventListener('submit', handleSubmit);
  elements.resetForm.addEventListener('click', resetForm);
  elements.songSearch.addEventListener('input', renderSearchResults);
  elements.searchCategory.addEventListener('change', renderSearchResults);

  for (const input of [elements.category, elements.songName, elements.author, elements.time, elements.description, elements.baseName]) {
    input.addEventListener('input', renderPreview);
    input.addEventListener('change', renderPreview);
    input.addEventListener('input', scheduleDuplicateWarning);
    input.addEventListener('change', scheduleDuplicateWarning);
  }

  elements.category.addEventListener('change', () => {
    persistSelectedCategory();
    updateFileHints();
  });
  elements.baseName.addEventListener('input', updateFileHints);
  elements.baseName.addEventListener('change', updateFileHints);

  elements.songFile.addEventListener('change', async () => {
    handleSongFileChanged();
    updateFileHints();
    await fillDurationFromAudio();
    renderPreview();
    scheduleDuplicateWarning();
  });
  elements.lyricsFile.addEventListener('change', () => {
    updateFileHints();
    renderPreview();
    scheduleDuplicateWarning();
  });
  elements.coverFile.addEventListener('change', () => {
    updateFileHints();
    renderPreview();
    scheduleDuplicateWarning();
  });
}

function renderCategoryOptions() {
  const options = CATEGORY_CONFIG.map(item => `<option value="${item.key}">${item.label}</option>`);
  elements.category.innerHTML = options.join('');
  restoreSelectedCategory();
}

function persistSelectedCategory() {
  localStorage.setItem(LAST_CATEGORY_KEY, elements.category.value);
}

function restoreSelectedCategory() {
  const lastCategory = localStorage.getItem(LAST_CATEGORY_KEY);
  if (CATEGORY_CONFIG.some(item => item.key === lastCategory)) {
    elements.category.value = lastCategory;
  }
}

function renderSearchCategoryOptions() {
  const options = [
    '<option value="">全部分类</option>',
    ...CATEGORY_CONFIG.map(item => `<option value="${item.key}">${item.label}</option>`)
  ];
  elements.searchCategory.innerHTML = options.join('');
}

function updateFileHints() {
  const category = getSelectedCategory();
  const songFile = elements.songFile.files[0] || null;
  const lyricsFile = elements.lyricsFile.files[0] || null;
  const coverFile = elements.coverFile.files[0] || null;
  const canBuildTargets = !!songFile;
  const payload = canBuildTargets ? buildPayload(songFile, lyricsFile, coverFile, category) : null;

  elements.songFileName.textContent = formatFileHint(songFile, payload?.song_file);
  elements.lyricsFileName.textContent = formatFileHint(lyricsFile, payload?.lyrics_file);
  elements.coverFileName.textContent = formatFileHint(coverFile, payload?.img_file);
}

function formatFileHint(file, targetName = '') {
  if (!file && targetName) return `未选择文件\n将使用默认头像：${targetName}`;
  if (!file) return '未选择文件';
  if (!targetName || targetName === file.name) return `已选择：${file.name}`;
  return `已选择：${file.name}\n将保存为：${targetName}`;
}

// ==================== 文件夹导入 ====================

async function pickSongFolder() {
  try {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('当前浏览器不支持选择文件夹，请继续使用下方单个文件选择。');
    }

    const folderHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = await readDirectFilesFromFolder(folderHandle);
    const selectedFiles = selectSongFolderFiles(files);

    if (!selectedFiles.songFile) {
      throw new Error('文件夹中没有找到歌曲文件，请确认包含 mp3、flac、m4a、wav 或 ogg 文件。');
    }

    setFileInputFiles(elements.songFile, selectedFiles.songFile ? [selectedFiles.songFile] : []);
    setFileInputFiles(elements.lyricsFile, selectedFiles.lyricsFile ? [selectedFiles.lyricsFile] : []);
    setFileInputFiles(elements.coverFile, selectedFiles.coverFile ? [selectedFiles.coverFile] : []);
    state.defaultCoverPath = '';
    applyMetadataFromSongFile(selectedFiles.songFile);

    updateFileHints();
    await fillDurationFromAudio();
    renderPreview();
    scheduleDuplicateWarning();

    const parts = [
      `已导入文件夹：${folderHandle.name}`,
      `歌曲：${selectedFiles.songFile.name}`,
      selectedFiles.lyricsFile ? `歌词：${selectedFiles.lyricsFile.name}` : '歌词：未找到',
      selectedFiles.coverFile ? `头像：${selectedFiles.coverFile.name}` : '头像：未找到，将使用默认头像',
      '下一步：确认歌曲信息后点击“添加歌曲”。'
    ];
    elements.songFolderStatus.textContent = parts.join('\n');
    setFeedback('文件夹已填充，请确认歌曲信息后点击“添加歌曲”。', 'success');
    addLog(parts.join('；'), selectedFiles.coverFile ? 'success' : '');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    elements.songFolderStatus.textContent = error.message || '导入歌曲文件夹失败。';
    addLog(error.message || '导入歌曲文件夹失败', 'error');
    showToast(error.message || '导入歌曲文件夹失败', 'error');
  }
}

async function readDirectFilesFromFolder(folderHandle) {
  const files = [];
  for await (const entry of folderHandle.values()) {
    if (entry.kind !== 'file') continue;
    files.push(await entry.getFile());
  }
  return files;
}

function selectSongFolderFiles(files) {
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return {
    songFile: pickLargestFile(sortedFiles.filter(isAudioFile)),
    lyricsFile: sortedFiles.find(isLyricsFile) || null,
    coverFile: pickLargestFile(sortedFiles.filter(isCoverFile))
  };
}

function pickLargestFile(files) {
  return files.sort((a, b) => b.size - a.size)[0] || null;
}

function isAudioFile(file) {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(getNormalizedExtension(file.name));
}

function isLyricsFile(file) {
  return LYRIC_EXTENSIONS.has(getNormalizedExtension(file.name));
}

function isCoverFile(file) {
  return file.type.startsWith('image/') || COVER_EXTENSIONS.has(getNormalizedExtension(file.name));
}

function getNormalizedExtension(fileName) {
  return getFileExtension(fileName).replace('.', '').toLowerCase();
}

function setFileInputFiles(input, files) {
  const dataTransfer = new DataTransfer();
  for (const file of files) {
    dataTransfer.items.add(file);
  }
  input.files = dataTransfer.files;
}

function handleSongFileChanged() {
  const songFile = elements.songFile.files[0] || null;
  state.defaultCoverPath = '';
  elements.time.value = '';

  if (!songFile) {
    renderPreview();
    return;
  }

  applyMetadataFromSongFile(songFile);
}

function applyMetadataFromSongFile(songFile) {
  const baseName = stripFileExtension(songFile.name).trim();
  const metadata = inferMetadataFromFileName(baseName);

  elements.songName.value = metadata.songName;
  elements.author.value = metadata.author;
  elements.description.value = '';
  elements.baseName.value = '';
}

function inferMetadataFromFileName(baseName) {
  const normalized = baseName.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(/\s[-–—]\s/).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      songName: normalized,
      author: parts[parts.length - 1]
    };
  }

  return {
    songName: normalized,
    author: ''
  };
}

// ==================== 项目目录授权 ====================

async function pickProjectRoot() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await verifyProjectRoot(handle);
    state.projectRootHandle = handle;
    await persistProjectRoot(handle);
    elements.rootStatus.textContent = `已连接：${handle.name}`;
    elements.rootStatus.classList.remove('muted');
    addLog(`项目目录已连接：${handle.name}`, 'success');
    await refreshCatalogSongs();
    scheduleDuplicateWarning();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    addLog(error.message || '目录选择失败', 'error');
  }
}

async function verifyProjectRoot(rootHandle) {
  await rootHandle.getDirectoryHandle('catalog');
  await rootHandle.getDirectoryHandle('media');
  await rootHandle.getDirectoryHandle('assets');
}

async function restoreProjectRoot() {
  if (!('showDirectoryPicker' in window) || !('indexedDB' in window)) return;

  try {
    const handle = await idbGet(ROOT_HANDLE_KEY);
    if (!handle) return;

    const permission = await ensurePermission(handle, false);
    if (permission !== 'granted') {
      elements.rootStatus.textContent = '已记住上次目录，请点“选择项目目录”重新授权。';
      return;
    }

    await verifyProjectRoot(handle);
    state.projectRootHandle = handle;
    elements.rootStatus.textContent = `已自动连接：${handle.name}`;
    elements.rootStatus.classList.remove('muted');
    addLog(`已恢复上次项目目录：${handle.name}`, 'success');
    await refreshCatalogSongs();
    scheduleDuplicateWarning();
  } catch (_) {
    elements.rootStatus.textContent = '上次保存的目录已失效，请重新选择项目目录。';
  }
}

async function persistProjectRoot(handle) {
  if (!('indexedDB' in window)) return;
  await idbSet(ROOT_HANDLE_KEY, handle);
}

async function ensurePermission(handle, writable = true) {
  const options = writable ? { mode: 'readwrite' } : {};
  const current = await handle.queryPermission?.(options);
  if (current === 'granted') return current;
  return handle.requestPermission?.(options);
}

async function requireWritableProjectRoot() {
  if (!state.projectRootHandle) {
    throw new Error('请先选择项目根目录。');
  }

  const permission = await ensurePermission(state.projectRootHandle, true);
  if (permission !== 'granted') {
    throw new Error('当前目录没有写入权限，请重新选择项目目录并授权。');
  }
}

// ==================== 添加歌曲 ====================

async function handleSubmit(event) {
  event.preventDefault();

  if (state.isSubmitting) {
    setFeedback('正在添加上一首歌曲，请稍候。', 'error');
    return;
  }

  setSubmitting(true);
  try {
    await requireWritableProjectRoot();
    const category = getSelectedCategory();
    const { songFile, lyricsFile, coverFile } = getSelectedSourceFiles();

    if (!songFile) {
      throw new Error('请先选择歌曲文件。');
    }
    validateRequiredMetadata();
    validateSourceFiles(songFile, lyricsFile, coverFile);

    const payload = buildPayload(songFile, lyricsFile, coverFile, category);
    validatePayloadTargets(payload);
    addLog(`开始导入《${payload.song_name}》到 ${category.label}`, 'info');
    addLog(`目标文件：media/${category.folder}/${payload.song_file}`, 'info');
    if (payload.lyrics_file) {
      addLog(`目标歌词：media/${category.folder}/${payload.lyrics_file}`, 'info');
    } else {
      addLog('本次未选择歌词文件，将按纯音乐写入。', 'info');
    }
    await runImportTransaction(payload, category);

    if (payload.sourceFiles.coverFile) {
      try {
        await generateCoverThumbnail(payload, category);
      } catch (error) {
        addLog(`头像原图已写入，但缩略图生成失败：${error.message || '未知错误'}`, 'error');
      }
    } else {
      addLog(`未选择头像，已使用默认头像：${payload.img_file}`, 'success');
    }

    await refreshCatalogSongs();
    resetForm({ preserveStatus: true });
    addLog(`已添加《${payload.song_name}》到 ${category.label}`, 'success');
    notifyMusicCatalogUpdated();
    showToast(`导入成功：${payload.song_name}`, 'success');
    setFeedback(`导入成功：${payload.song_name}`, 'success');
    renderPreview(payload, category);
  } catch (error) {
    const message = formatErrorMessage(error) || '添加失败';
    addLog(message, 'error');
    showToast(message, 'error');
    setFeedback(message, 'error');
  } finally {
    setSubmitting(false);
  }
}

async function withImportLock(callback) {
  if (navigator.locks?.request) {
    return navigator.locks.request(IMPORT_LOCK_NAME, { mode: 'exclusive' }, callback);
  }
  return callback();
}

function setSubmitting(isSubmitting) {
  state.isSubmitting = isSubmitting;
  elements.formControls.forEach(control => {
    control.disabled = isSubmitting;
  });
  if (elements.submitButton) {
    elements.submitButton.disabled = isSubmitting;
    elements.submitButton.textContent = isSubmitting ? '添加中...' : '添加歌曲';
  }
  elements.pickRoot.disabled = isSubmitting;
  elements.pickSongFolder.disabled = isSubmitting;
}

function getSelectedSourceFiles() {
  return {
    songFile: elements.songFile.files[0] || null,
    lyricsFile: elements.lyricsFile.files[0] || null,
    coverFile: elements.coverFile.files[0] || null
  };
}

function validateRequiredMetadata() {
  if (!elements.songName.value.trim()) {
    elements.songName.focus();
    throw new Error('请填写歌曲名。');
  }
  if (!elements.author.value.trim()) {
    elements.author.focus();
    throw new Error('请填写作者。');
  }
}

function resetForm(options = {}) {
  elements.form.reset();
  restoreSelectedCategory();
  state.defaultCoverPath = '';
  elements.time.value = '';
  updateFileHints();
  renderPreview();
  if (options.preserveStatus) {
    return;
  }
  setFeedback('表单已清空');
}

// ==================== 表单数据与校验 ====================

function getSelectedCategory() {
  const category = CATEGORY_CONFIG.find(item => item.key === elements.category.value);
  if (!category) {
    throw new Error('未找到目标分类。');
  }
  return category;
}

function buildPayload(songFile, lyricsFile, coverFile, category) {
  const baseName = elements.baseName.value.trim();
  const description = elements.description.value.trim();

  const songTargetName = buildTargetFileName(songFile, baseName);
  const normalizedBaseName = stripFileExtension(songTargetName);
  const lyricsTargetName = lyricsFile ? buildSiblingFileName(lyricsFile, normalizedBaseName) : '';
  const coverTargetName = coverFile ? buildSiblingFileName(coverFile, normalizedBaseName) : getDefaultCoverPath();

  return {
    song_type: category.label,
    song_path: `${category.folder}/`,
    song_name: elements.songName.value.trim(),
    song_file: songTargetName,
    img_file: coverTargetName,
    lyrics_file: lyricsTargetName,
    lyrics_type: lyricsFile ? 'CONFIG.LOAD_LYRICS_TYPE.TYPE_file' : 'CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue',
    author: elements.author.value.trim(),
    time: elements.time.value.trim() || '00:00',
    des: description || elements.songName.value.trim(),
    sourceFiles: { songFile, lyricsFile, coverFile }
  };
}

function validateSourceFiles(songFile, lyricsFile, coverFile) {
  if (songFile.size <= 0) {
    throw new Error('歌曲文件为空，请重新选择。');
  }

  const isAudioFile = songFile.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(getNormalizedExtension(songFile.name));
  if (!isAudioFile) {
    throw new Error('歌曲文件格式不正确，请选择 mp3、flac、m4a、wav 或 ogg 文件。');
  }

  if (lyricsFile) {
    if (lyricsFile.size <= 0) {
      throw new Error('歌词文件为空，请重新选择。');
    }

    if (!isLyricsFile(lyricsFile)) {
      throw new Error('歌词文件格式不正确，请选择 lrc 或 txt 文件。');
    }
  }

  if (!coverFile) return;

  if (coverFile.size <= 0) {
    throw new Error('头像文件为空，请重新选择。');
  }

  const isImageFile = coverFile.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(coverFile.name);
  if (!isImageFile) {
    throw new Error('头像文件格式不正确，请选择 jpg、png、webp 等图片文件。');
  }
}

function validatePayloadTargets(payload) {
  validateTargetFileName(payload.song_file, '歌曲');

  if (payload.lyrics_file) {
    validateTargetFileName(payload.lyrics_file, '歌词');
  }

  if (payload.sourceFiles.coverFile) {
    validateTargetFileName(payload.img_file, '头像');
  }
}

function validateTargetFileName(fileName, label) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error(`${label}目标文件名为空。`);
  }

  if (/[\\/]/.test(fileName) || /[\u0000-\u001f]/.test(fileName)) {
    throw new Error(`${label}目标文件名不能包含路径分隔符或控制字符：${fileName}`);
  }
}

function pickDefaultCoverPath() {
  const id = Math.floor(Math.random() * DEFAULT_IMAGE_COUNT) + 1;
  const extension = WEBP_DEFAULT_IMAGE_IDS.has(id) ? 'webp' : 'jpg';
  return `./assets/covers/defaults/${id}.${extension}`;
}

function getDefaultCoverPath() {
  if (!state.defaultCoverPath) {
    state.defaultCoverPath = pickDefaultCoverPath();
  }
  return state.defaultCoverPath;
}

function buildTargetFileName(file, baseName) {
  if (!file) return '';
  const extension = getFileExtension(file.name);
  if (!baseName) return file.name;
  return `${baseName}${extension}`;
}

function buildSiblingFileName(file, baseName) {
  if (!file) return '';
  return `${baseName}${getFileExtension(file.name)}`;
}

function getFileExtension(fileName) {
  const match = fileName.match(/(\.[^.]+)$/);
  return match ? match[1] : '';
}

function stripFileExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

// ==================== 歌单读取与重复检测 ====================

async function ensureNoDuplicate(payload) {
  const duplicate = await findDuplicate(payload);
  if (duplicate) {
    throw new Error(duplicate.message);
  }
}

async function findDuplicate(payload) {
  const songs = state.catalogSongs.length ? state.catalogSongs : await readCatalogSongs();
  const payloadSongName = normalizeDuplicateValue(payload.song_name);
  const payloadSongFile = normalizeDuplicateFile(payload.song_file);
  const payloadSongBaseName = normalizeDuplicateFileBase(payload.song_file);

  const matchedSong = songs.find(song => {
    const songName = normalizeDuplicateValue(song.song_name);
    const songFile = normalizeDuplicateFile(song.song_file);
    const songBaseName = normalizeDuplicateFileBase(song.song_file);
    return (
      songName && songName === payloadSongName ||
      songFile && songFile === payloadSongFile ||
      songBaseName && songBaseName === payloadSongBaseName
    );
  });

  if (matchedSong) {
    return {
      type: 'catalog',
      message: `歌单中已经存在《${matchedSong.song_name || payload.song_name}》（分类：${matchedSong.categoryLabel}），请不要重复添加。`
    };
  }

  const selectedCategory = getSelectedCategory();
  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(selectedCategory.folder, { create: true });

  if (await fileExists(categoryDir, payload.song_file)) {
    addLog(`检测到媒体文件已存在，将复用并更新歌单：media/${selectedCategory.folder}/${payload.song_file}`, 'success');
  }

  return null;
}

async function refreshCatalogSongs() {
  if (!state.projectRootHandle) {
    state.catalogSongs = [];
    renderSearchResults();
    return;
  }

  try {
    state.catalogSongs = await readCatalogSongs();
    renderSearchResults();
  } catch (error) {
    state.catalogSongs = [];
    elements.searchSummary.textContent = error.message || '读取歌单失败。';
    elements.searchSummary.classList.add('muted');
    elements.searchResults.innerHTML = '';
  }
}

async function readCatalogSongs() {
  const catalogDir = await state.projectRootHandle.getDirectoryHandle('catalog');
  const songs = [];

  for (const category of CATEGORY_CONFIG) {
    const fileHandle = await catalogDir.getFileHandle(category.catalogFile);
    const source = await (await fileHandle.getFile()).text();
    songs.push(...extractCatalogSongs(source, category));
  }

  return songs;
}

function extractCatalogSongs(source, category) {
  const entryMatches = source.match(/\{[\s\S]*?\n\s*\}/g) || [];
  return entryMatches.map(entry => ({
    categoryKey: category.key,
    categoryLabel: category.label,
    catalogFile: category.catalogFile,
    folder: category.folder,
    entry,
    song_name: readStringProperty(entry, 'song_name'),
    song_file: readStringProperty(entry, 'song_file'),
    img_file: readStringProperty(entry, 'img_file'),
    lyrics_file: readStringProperty(entry, 'lyrics_file'),
    author: readStringProperty(entry, 'author'),
    time: readStringProperty(entry, 'time')
  })).filter(song => song.song_name || song.song_file);
}

function readStringProperty(entry, key) {
  const match = entry.match(new RegExp(`${key}\\s*:\\s*(["'\`])([\\s\\S]*?)\\1`));
  return match ? match[2] : '';
}

function normalizeDuplicateValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・._\-—–（）()【】\[\]《》<>]/g, '');
}

function normalizeDuplicateFile(fileName) {
  return normalizeDuplicateValue(decodeURIComponent(String(fileName || '')));
}

function normalizeDuplicateFileBase(fileName) {
  return normalizeDuplicateValue(stripFileExtension(decodeURIComponent(String(fileName || ''))));
}

async function fileExists(directoryHandle, fileName) {
  if (!fileName) return false;
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

async function scheduleDuplicateWarning() {
  const checkId = ++state.duplicateCheckId;

  if (!state.projectRootHandle || !elements.songName.value.trim() || !elements.songFile.files[0]) {
    return;
  }

  try {
    const category = getSelectedCategory();
    const payload = buildPayload(
      elements.songFile.files[0],
      elements.lyricsFile.files[0] || null,
      elements.coverFile.files[0] || null,
      category
    );
    const duplicate = await findDuplicate(payload);
    if (checkId !== state.duplicateCheckId) return;

    if (duplicate) {
      setFeedback(duplicate.message, 'error');
    } else {
      setFeedback('未发现重复歌曲，可以添加。', 'success');
    }
  } catch (_) {
    // 实时检查失败不阻塞表单填写，提交时会再次严格校验。
  }
}

// ==================== 搜索与删除 ====================

function renderSearchResults() {
  if (!elements.searchSummary || !elements.searchResults) return;

  if (!state.projectRootHandle) {
    elements.searchSummary.textContent = '选择项目目录后可以搜索现有歌曲。';
    elements.searchSummary.classList.add('muted');
    elements.searchResults.innerHTML = '';
    return;
  }

  const query = normalizeSearchValue(elements.songSearch.value);
  const categoryKey = elements.searchCategory.value;
  const matchedSongs = state.catalogSongs
    .filter(song => !categoryKey || song.categoryKey === categoryKey)
    .filter(song => {
      if (!query) return true;
      return normalizeSearchValue([
        song.song_name,
        song.author,
        song.song_file,
        song.categoryLabel
      ].join(' ')).includes(query);
    });

  const visibleSongs = matchedSongs.slice(0, 10);
  const categoryText = categoryKey
    ? CATEGORY_CONFIG.find(item => item.key === categoryKey)?.label || '当前分类'
    : '全部分类';
  elements.searchSummary.textContent = query
    ? `${categoryText}中找到 ${matchedSongs.length} 首匹配歌曲`
    : `${categoryText}共有 ${matchedSongs.length} 首歌曲`;
  elements.searchSummary.classList.toggle('muted', matchedSongs.length === 0);

  elements.searchResults.innerHTML = '';
  const fragment = document.createDocumentFragment();
  visibleSongs.forEach(song => {
    fragment.appendChild(renderSearchResultItem(song));
  });

  if (matchedSongs.length > visibleSongs.length) {
    const moreItem = document.createElement('div');
    moreItem.className = 'status-line muted';
    moreItem.textContent = `还有 ${matchedSongs.length - visibleSongs.length} 首未显示，请输入更具体的关键词。`;
    fragment.appendChild(moreItem);
  }

  elements.searchResults.appendChild(fragment);
}

function renderSearchResultItem(song) {
  const item = document.createElement('article');
  item.className = 'search-result';

  const content = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'search-result-title';
  title.textContent = song.song_name || '未命名歌曲';

  const category = document.createElement('span');
  category.className = 'search-result-category';
  category.textContent = song.categoryLabel;

  const deleteButton = document.createElement('button');
  deleteButton.className = 'danger-button search-delete-button';
  deleteButton.type = 'button';
  deleteButton.textContent = '删除';
  deleteButton.addEventListener('click', () => deleteSong(song));

  content.append(title);
  item.append(content, category, deleteButton);
  return item;
}

async function deleteSong(song) {
  try {
    await requireWritableProjectRoot();

    const confirmed = window.confirm(`确定删除《${song.song_name || song.song_file}》吗？\n\n会删除歌单条目，并尝试删除对应的音频、歌词、头像和缩略图。`);
    if (!confirmed) return;

    const category = CATEGORY_CONFIG.find(item => item.key === song.categoryKey);
    if (!category) {
      throw new Error('未找到歌曲所属分类。');
    }

    await deleteCatalogEntry(song, category);
    const remainingSongs = await readCatalogSongs();
    await deleteSongMediaFiles(song, category, remainingSongs);
    await deleteSongThumbnail(song, category, remainingSongs);
    await refreshCatalogSongs();
    notifyMusicCatalogUpdated();
    scheduleDuplicateWarning();

    addLog(`已删除《${song.song_name || song.song_file}》`, 'success');
    showToast(`已删除：${song.song_name || song.song_file}`, 'success');
    setFeedback(`已删除：${song.song_name || song.song_file}`, 'success');
  } catch (error) {
    addLog(error.message || '删除失败', 'error');
    showToast(error.message || '删除失败', 'error');
    setFeedback(error.message || '删除失败', 'error');
  }
}

async function deleteCatalogEntry(song, category) {
  const catalogDir = await state.projectRootHandle.getDirectoryHandle('catalog');
  const fileHandle = await catalogDir.getFileHandle(category.catalogFile);
  const source = await (await fileHandle.getFile()).text();
  const nextSource = removeEntryFromCatalogSource(source, song);

  if (nextSource === source) {
    throw new Error(`未能在 catalog/${category.catalogFile} 中定位该歌曲条目。`);
  }

  const writable = await fileHandle.createWritable();
  await writable.write(nextSource);
  await writable.close();

  const verifiedSource = await (await fileHandle.getFile()).text();
  if (verifiedSource !== nextSource || verifiedSource.includes(`song_file: ${JSON.stringify(song.song_file)}`)) {
    throw new Error(`歌单删除后校验失败：catalog/${category.catalogFile}`);
  }

  addLog(`歌单条目已删除：catalog/${category.catalogFile}`, 'success');
}

function removeEntryFromCatalogSource(source, song) {
  const entryMatches = [...source.matchAll(/\{[\s\S]*?\n\s*\}/g)];
  const match = entryMatches.find(item => {
    const entry = item[0];
    return readStringProperty(entry, 'song_file') === song.song_file &&
      readStringProperty(entry, 'song_name') === song.song_name;
  });

  if (!match) return source;

  let start = match.index;
  let end = match.index + match[0].length;
  if (source.slice(end, end + 1) === ',') {
    end += 1;
  } else {
    const before = source.slice(0, start);
    const commaIndex = before.lastIndexOf(',');
    if (commaIndex !== -1 && /^[\s\r\n]*$/.test(before.slice(commaIndex + 1))) {
      start = commaIndex;
    }
  }

  return `${source.slice(0, start)}${source.slice(end)}`;
}

async function deleteSongMediaFiles(song, category, remainingSongs) {
  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(category.folder, { create: true });
  const fileNames = [
    { fileName: song.song_file, field: 'song_file' },
    { fileName: song.lyrics_file, field: 'lyrics_file' },
    { fileName: getDeletableCoverFileName(song.img_file), field: 'img_file' }
  ].filter(item => item.fileName);

  const seenFiles = new Set();
  for (const { fileName, field } of fileNames) {
    if (seenFiles.has(fileName)) continue;
    seenFiles.add(fileName);

    if (isFileReferencedByOtherSongs(fileName, field, category, remainingSongs)) {
      addLog(`文件仍被其他歌曲引用，已保留：media/${category.folder}/${fileName}`, 'success');
      continue;
    }

    await deleteFileIfExists(categoryDir, fileName, `media/${category.folder}/${fileName}`);
  }
}

async function deleteSongThumbnail(song, category, remainingSongs) {
  const coverFileName = getDeletableCoverFileName(song.img_file);
  if (!coverFileName) return;
  if (isFileReferencedByOtherSongs(coverFileName, 'img_file', category, remainingSongs)) {
    addLog(`缩略图仍被其他歌曲引用，已保留：assets/covers/music-thumbs/${category.folder}/${coverFileName.replace(/\.[^.]+$/, '.jpg')}`, 'success');
    return;
  }

  const assetsDir = await state.projectRootHandle.getDirectoryHandle('assets');
  const coversDir = await assetsDir.getDirectoryHandle('covers');
  const thumbsDir = await coversDir.getDirectoryHandle('music-thumbs', { create: true });
  const categoryDir = await thumbsDir.getDirectoryHandle(category.folder, { create: true });
  const thumbName = coverFileName.replace(/\.[^.]+$/, '.jpg');
  await deleteFileIfExists(categoryDir, thumbName, `assets/covers/music-thumbs/${category.folder}/${thumbName}`);
}

function isFileReferencedByOtherSongs(fileName, field, category, songs) {
  return songs.some(song => {
    if (song.categoryKey !== category.key) return false;
    if (field === 'img_file') {
      return getDeletableCoverFileName(song.img_file) === fileName;
    }
    return song[field] === fileName;
  });
}

function getDeletableCoverFileName(imgFile) {
  const normalized = String(imgFile || '').trim();
  if (!normalized || normalized.startsWith('./assets/covers/defaults/') || normalized.startsWith('http') || normalized.startsWith('/')) {
    return '';
  }
  return normalized;
}

async function deleteFileIfExists(directoryHandle, fileName, displayPath) {
  try {
    await directoryHandle.removeEntry(fileName);
    addLog(`文件已删除：${displayPath}`, 'success');
  } catch (error) {
    if (error?.name === 'NotFoundError') return;
    throw error;
  }
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

// ==================== 文件写入、回滚与歌单更新 ====================

async function runImportTransaction(payload, category) {
  return withImportLock(async () => {
    state.catalogSongs = await readCatalogSongs();
    await ensureNoDuplicate(payload);
    const catalogUpdate = await prepareCatalogUpdate(payload, category);
    await verifyCatalogUpdatePreview(catalogUpdate, payload, category);
    addLog(`歌单写入预检通过：catalog/${category.catalogFile}`, 'success');

    let appliedCatalogUpdate = null;
    let writtenFiles = [];

    try {
      writtenFiles = await writeMediaFiles(payload, category);
      appliedCatalogUpdate = await updateCatalogFile(catalogUpdate, payload, category);
      await verifyImportTransaction(payload, category);
    } catch (error) {
      await cleanupWrittenMediaFiles(category, writtenFiles);
      if (appliedCatalogUpdate) {
        await restoreCatalogFile(appliedCatalogUpdate.fileHandle, appliedCatalogUpdate.previousSource, category);
      }
      throw error;
    }
  });
}

async function writeMediaFiles(payload, category) {
  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(category.folder, { create: true });
  const writtenFiles = [];

  try {
    if (payload.sourceFiles.coverFile) {
      writtenFiles.push(await writeAndVerifyFile(
        categoryDir,
        payload.img_file,
        payload.sourceFiles.coverFile,
        `media/${category.folder}/${payload.img_file}`,
        '头像原图'
      ));
    }

    writtenFiles.push(await writeAndVerifyFile(
      categoryDir,
      payload.song_file,
      payload.sourceFiles.songFile,
      `media/${category.folder}/${payload.song_file}`,
      '音频'
    ));

    if (payload.sourceFiles.lyricsFile) {
      writtenFiles.push(await writeAndVerifyFile(
        categoryDir,
        payload.lyrics_file,
        payload.sourceFiles.lyricsFile,
        `media/${category.folder}/${payload.lyrics_file}`,
        '歌词'
      ));
    }

    addLog(`媒体文件校验完成：media/${category.folder}/`, 'success');
    return writtenFiles;
  } catch (error) {
    await removeWrittenFiles(categoryDir, writtenFiles);
    throw error;
  }
}

async function cleanupWrittenMediaFiles(category, writtenFiles) {
  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(category.folder, { create: true });
  await removeWrittenFiles(categoryDir, writtenFiles);
}

async function removeWrittenFiles(directoryHandle, writtenFiles) {
  for (const writtenFile of writtenFiles) {
    if (writtenFile.existedBefore) {
      addLog(`保留原有文件，请手动检查：${writtenFile.displayPath}`, 'error');
      continue;
    }

    try {
      await directoryHandle.removeEntry(writtenFile.fileName);
      addLog(`已回滚：${writtenFile.displayPath}`, 'error');
    } catch (_) {
      addLog(`回滚失败，请手动检查：${writtenFile.displayPath}`, 'error');
    }
  }
}

async function writeAndVerifyFile(directoryHandle, fileName, sourceFile, displayPath, label) {
  if (!fileName || !sourceFile) {
    throw new Error(`${label}文件缺失，无法写入。`);
  }

  const existedBefore = await fileExists(directoryHandle, fileName);
  if (existedBefore) {
    const existingFile = await (await directoryHandle.getFileHandle(fileName)).getFile();
    if (existingFile.size === sourceFile.size) {
      addLog(`${label}已存在且大小一致，复用：${displayPath}`, 'success');
      return { fileName, displayPath, fileHandle: null, existedBefore };
    }

    throw new Error(`${label}目标文件已存在但大小不一致，请修改目标基础文件名或先手动处理：${displayPath}`);
  }

  let fileHandle = null;

  try {
    fileHandle = await writeFileToDirectory(directoryHandle, fileName, sourceFile);
    const writtenFile = await fileHandle.getFile();
    if (writtenFile.size !== sourceFile.size) {
      throw new Error(`${label}写入校验失败：${displayPath}`);
    }
  } catch (error) {
    if (!existedBefore) {
      try {
        await directoryHandle.removeEntry(fileName);
        addLog(`已清理失败文件：${displayPath}`, 'error');
      } catch (_) {
        addLog(`失败文件清理失败，请手动检查：${displayPath}`, 'error');
      }
    }
    throw error;
  }

  addLog(`${label}已写入：${displayPath}`, 'success');
  return { fileName, displayPath, fileHandle, existedBefore };
}

async function writeFileToDirectory(directoryHandle, fileName, sourceFile) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await sourceFile.arrayBuffer());
  await writable.close();
  return fileHandle;
}

async function prepareCatalogUpdate(payload, category) {
  const catalogDir = await state.projectRootHandle.getDirectoryHandle('catalog');
  const fileHandle = await catalogDir.getFileHandle(category.catalogFile);
  const source = await (await fileHandle.getFile()).text();
  const folderConstName = source.match(/const\s+(FILE_MUSIC_[A-Z_]+)\s*=/)?.[1];

  if (!folderConstName) {
    throw new Error(`无法识别 ${category.catalogFile} 中的目录常量。`);
  }

  const entry = renderEntry(payload, folderConstName);
  const nextSource = appendEntryToCatalogSource(source, entry);

  if (nextSource === source) {
    throw new Error(`无法更新 ${category.catalogFile}，数组结尾格式不符合预期。`);
  }

  return { fileHandle, source, nextSource, entry };
}

async function verifyCatalogUpdatePreview(catalogUpdate, payload, category) {
  const hasSongName = catalogUpdate.nextSource.includes(`song_name: ${JSON.stringify(payload.song_name)}`);
  const hasSongFile = catalogUpdate.nextSource.includes(`song_file: ${JSON.stringify(payload.song_file)}`);

  if (!hasSongName || !hasSongFile) {
    throw new Error(`歌单预览中未找到新条目，请检查：catalog/${category.catalogFile}`);
  }
}

async function updateCatalogFile(catalogUpdate, payload, category) {
  const latestSource = await (await catalogUpdate.fileHandle.getFile()).text();
  const nextSource = latestSource === catalogUpdate.source
    ? catalogUpdate.nextSource
    : appendEntryToLatestCatalogSource(latestSource, catalogUpdate.entry, payload, category);

  const writable = await catalogUpdate.fileHandle.createWritable();
  await writable.write(nextSource);
  await writable.close();

  const verifiedSource = await (await catalogUpdate.fileHandle.getFile()).text();
  if (verifiedSource !== nextSource) {
    throw new Error(`歌单文件写入后校验失败：catalog/${category.catalogFile}`);
  }

  addLog(`歌单文件已更新：catalog/${category.catalogFile}`, 'success');
  return { fileHandle: catalogUpdate.fileHandle, previousSource: latestSource, nextSource };
}

async function restoreCatalogFile(fileHandle, previousSource, category) {
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(previousSource);
    await writable.close();
    addLog(`已回滚歌单文件：catalog/${category.catalogFile}`, 'error');
  } catch (_) {
    addLog(`歌单回滚失败，请手动检查：catalog/${category.catalogFile}`, 'error');
  }
}

function appendEntryToLatestCatalogSource(source, entry, payload, category) {
  if (source.includes(`song_file: ${JSON.stringify(payload.song_file)}`)) {
    return source;
  }

  const nextSource = appendEntryToCatalogSource(source, entry);
  if (nextSource === source) {
    throw new Error(`无法更新 ${category.catalogFile}，数组结尾格式不符合预期。`);
  }
  return nextSource;
}

function appendEntryToCatalogSource(source, entry) {
  const closeIndex = findCatalogArrayCloseIndex(source);
  if (closeIndex < 0) return source;

  const beforeClose = source.slice(0, closeIndex).replace(/\s*$/, '');
  const afterClose = source.slice(closeIndex);
  const separator = beforeClose.endsWith('[') ? '\n' : ',\n';
  return `${beforeClose}${separator}${entry}\n${afterClose}`;
}

function findCatalogArrayCloseIndex(source) {
  const match = source.match(/\s*\];\s*$/);
  return match ? match.index + match[0].indexOf(']') : -1;
}

async function verifyCatalogEntry(catalogUpdate, payload, category) {
  const verifiedSource = await (await catalogUpdate.fileHandle.getFile()).text();
  const hasSongName = verifiedSource.includes(`song_name: ${JSON.stringify(payload.song_name)}`);
  const hasSongFile = verifiedSource.includes(`song_file: ${JSON.stringify(payload.song_file)}`);

  if (!hasSongName || !hasSongFile) {
    throw new Error(`歌单更新后未找到新条目，请检查：catalog/${category.catalogFile}`);
  }

  addLog(`歌单条目已确认：${payload.song_name}`, 'success');
}

async function verifyImportTransaction(payload, category) {
  const catalogDir = await state.projectRootHandle.getDirectoryHandle('catalog');
  const catalogFile = await catalogDir.getFileHandle(category.catalogFile);
  await verifyCatalogEntry({ fileHandle: catalogFile }, payload, category);

  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(category.folder, { create: true });
  await verifyImportedFile(categoryDir, payload.song_file, payload.sourceFiles.songFile.size, '音频');

  if (payload.lyrics_file) {
    if (!payload.sourceFiles.lyricsFile) {
      throw new Error(`歌单已记录歌词文件，但表单中没有歌词源文件：${payload.lyrics_file}`);
    }
    await verifyImportedFile(categoryDir, payload.lyrics_file, payload.sourceFiles.lyricsFile.size, '歌词');
  }

  if (payload.sourceFiles.coverFile) {
    await verifyImportedFile(categoryDir, payload.img_file, payload.sourceFiles.coverFile.size, '头像原图');
  }

  addLog(`导入一致性校验完成：${payload.song_name}`, 'success');
}

async function verifyImportedFile(directoryHandle, fileName, expectedSize, label) {
  try {
    const file = await (await directoryHandle.getFileHandle(fileName)).getFile();
    if (file.size !== expectedSize) {
      throw new Error(`${label}大小不一致：${fileName}`);
    }
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      throw new Error(`${label}文件未写入：${fileName}`);
    }
    throw error;
  }
}

function renderEntry(payload, folderConstName) {
  const lines = [
    '  {',
    '    song_type: TYPE,',
    `    song_path: ${folderConstName},`,
    `    song_name: ${JSON.stringify(payload.song_name)},`,
    `    song_file: ${JSON.stringify(payload.song_file)},`,
    `    img_file: ${JSON.stringify(payload.img_file)},`
  ];

  if (payload.lyrics_file) {
    lines.push(`    lyrics_file: ${JSON.stringify(payload.lyrics_file)},`);
  }

  lines.push(`    lyrics_type: ${payload.lyrics_type},`);
  lines.push(`    author: ${JSON.stringify(payload.author)},`);
  lines.push(`    time: ${JSON.stringify(payload.time)},`);
  lines.push(`    des: ${JSON.stringify(payload.des)},`);
  lines.push('  }');

  return lines.join('\n');
}

async function generateCoverThumbnail(payload, category) {
  const assetsDir = await state.projectRootHandle.getDirectoryHandle('assets');
  const coversDir = await assetsDir.getDirectoryHandle('covers');
  const thumbsDir = await coversDir.getDirectoryHandle('music-thumbs', { create: true });
  const categoryDir = await thumbsDir.getDirectoryHandle(category.folder, { create: true });

  const imageFile = payload.sourceFiles.coverFile;
  const bitmap = await createImageBitmap(imageFile);
  const ratio = Math.min(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob || blob.size <= 0) {
    throw new Error(`缩略图编码失败：${payload.img_file}`);
  }

  const thumbName = payload.img_file.replace(/\.[^.]+$/, '.jpg');
  const thumbHandle = await categoryDir.getFileHandle(thumbName, { create: true });
  const writable = await thumbHandle.createWritable();
  await writable.write(await blob.arrayBuffer());
  await writable.close();

  const thumbFile = await thumbHandle.getFile();
  if (thumbFile.size <= 0) {
    throw new Error(`缩略图写入为空：assets/covers/music-thumbs/${category.folder}/${thumbName}`);
  }

  addLog(`缩略图已生成：assets/covers/music-thumbs/${category.folder}/${thumbName}`, 'success');
}

// ==================== 预览与音频元数据 ====================

async function fillDurationFromAudio() {
  const file = elements.songFile.files[0];
  if (!file) return;

  try {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio(objectUrl);
    await new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error('无法识别歌曲时长')), { once: true });
    });
    elements.time.value = formatDuration(audio.duration);
    URL.revokeObjectURL(objectUrl);
  } catch (_) {
    // 忽略时长探测失败，允许手填
  }
}

function formatDuration(duration) {
  const totalSeconds = Math.max(0, Math.floor(duration || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderPreview(payload = null, payloadCategory = null) {
  const previewPayload = isPayloadObject(payload) ? payload : null;
  const category = payloadCategory || resolvePreviewCategory(previewPayload);
  const songFile = elements.songFile.files[0] || null;
  const lyricsFile = elements.lyricsFile.files[0] || null;
  const coverFile = elements.coverFile.files[0] || null;

  if (!category || (!previewPayload && (!elements.songName.value.trim() || !songFile))) {
    elements.preview.textContent = '尚未生成预览';
    return;
  }

  const nextPayload = previewPayload || buildPayload(songFile, lyricsFile, coverFile, category);
  elements.preview.textContent = [
    `分类：${category.label}`,
    `目标目录：media/${category.folder}/`,
    '',
    renderEntry(nextPayload, category.folderConst)
  ].join('\n');
}

function isPayloadObject(value) {
  return !!value && typeof value === 'object' && 'song_name' in value && 'song_file' in value;
}

function resolvePreviewCategory(payload = null) {
  if (payload) {
    const category = CATEGORY_CONFIG.find(item => (
      item.label === payload.song_type ||
      `${item.folder}/` === payload.song_path ||
      item.folder === payload.song_path
    ));
    if (category) return category;
  }

  return CATEGORY_CONFIG.find(item => item.key === elements.category.value);
}

// ==================== 页面反馈与跨页面通知 ====================

function addLog(message, type = '') {
  const entry = createLogEntry(message, type);
  persistLogEntry(entry);
  renderLogEntry(entry);
}

function createLogEntry(message, type = '') {
  return {
    message,
    type,
    time: new Date().toLocaleString('zh-CN', { hour12: false })
  };
}

function renderLogEntry(entry) {
  const item = document.createElement('div');
  item.className = `log-entry ${entry.type || ''}`.trim();
  item.textContent = `[${entry.time}] ${entry.message}`;
  elements.log.prepend(item);
}

function persistLogEntry(entry) {
  try {
    const logs = JSON.parse(localStorage.getItem(IMPORT_LOG_KEY) || '[]');
    logs.unshift(entry);
    localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(logs.slice(0, MAX_IMPORT_LOGS)));
  } catch (_) {
    // 日志持久化失败不影响导入流程。
  }
}

function restoreLogs() {
  if (!elements.log) return;

  try {
    const logs = JSON.parse(localStorage.getItem(IMPORT_LOG_KEY) || '[]');
    elements.log.innerHTML = '';
    logs.slice(0, MAX_IMPORT_LOGS).reverse().forEach(renderLogEntry);
  } catch (_) {
    elements.log.innerHTML = '';
  }
}

function showToast(message, type = 'success') {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.className = `toast visible ${type}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 2600);
}

function setFeedback(message, type = '') {
  setFormStatus(message, type);
  setResultBanner(message, type);
}

function setFormStatus(message, type = '') {
  if (!elements.formStatus) return;
  elements.formStatus.textContent = message;
  elements.formStatus.className = `form-status ${type}`.trim();
}

function setResultBanner(message, type = '') {
  if (!elements.resultBanner) return;
  elements.resultBanner.textContent = message;
  elements.resultBanner.className = `result-banner ${type}`.trim();
}

function notifyMusicCatalogUpdated() {
  const updatedAt = Date.now();
  localStorage.setItem(IMPORT_SIGNAL_KEY, String(updatedAt));
  state.importChannel?.postMessage({ type: 'catalog-updated', updatedAt });
}

function formatErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return error.message || error.name || '未知错误';
}

// ==================== IndexedDB 目录记忆 ====================

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROOT_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ROOT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROOT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(ROOT_STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  }).finally(() => db.close());
}

async function idbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROOT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(ROOT_STORE_NAME);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }).finally(() => db.close());
}
