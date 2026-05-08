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

const state = {
  projectRootHandle: null,
  importChannel: 'BroadcastChannel' in window ? new BroadcastChannel('music-ice-importer') : null,
  duplicateCheckId: 0,
  catalogSongs: []
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
  songFile: document.getElementById('song-file'),
  lyricsFile: document.getElementById('lyrics-file'),
  coverFile: document.getElementById('cover-file'),
  songFileName: document.getElementById('song-file-name'),
  lyricsFileName: document.getElementById('lyrics-file-name'),
  coverFileName: document.getElementById('cover-file-name'),
  songSearch: document.getElementById('song-search'),
  searchCategory: document.getElementById('search-category'),
  searchSummary: document.getElementById('search-summary'),
  searchResults: document.getElementById('search-results'),
  preview: document.getElementById('preview'),
  log: document.getElementById('log'),
  resetForm: document.getElementById('reset-form'),
  toast: document.getElementById('toast'),
  formStatus: document.getElementById('form-status'),
  resultBanner: document.getElementById('result-banner')
};

let toastTimer = null;

init().catch(error => {
  addLog(error.message || '初始化失败', 'error');
});

async function init() {
  renderCategoryOptions();
  renderSearchCategoryOptions();
  bindEvents();
  renderPreview();
  renderSearchResults();
  updateFileHints();
  checkSupport();
  await restoreProjectRoot();
  setFeedback('等待添加歌曲');
}

function checkSupport() {
  if (window.isSecureContext && 'showDirectoryPicker' in window) return;
  addLog('当前浏览器环境不支持直接写入本地文件。请在 Chromium 浏览器里通过 localhost 打开这个页面。', 'error');
}

function bindEvents() {
  elements.pickRoot.addEventListener('click', pickProjectRoot);
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

  elements.category.addEventListener('change', persistSelectedCategory);

  elements.songFile.addEventListener('change', async () => {
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
  elements.songFileName.textContent = elements.songFile.files[0]?.name || '未选择文件';
  elements.lyricsFileName.textContent = elements.lyricsFile.files[0]?.name || '未选择文件';
  elements.coverFileName.textContent = elements.coverFile.files[0]?.name || '未选择文件';
}

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

async function handleSubmit(event) {
  event.preventDefault();

  try {
    if (!state.projectRootHandle) {
      throw new Error('请先选择项目根目录。');
    }

    const permission = await ensurePermission(state.projectRootHandle, true);
    if (permission !== 'granted') {
      throw new Error('当前目录没有写入权限，请重新选择项目目录并授权。');
    }

    const category = getSelectedCategory();
    const songFile = elements.songFile.files[0];
    const lyricsFile = elements.lyricsFile.files[0] || null;
    const coverFile = elements.coverFile.files[0] || null;

    if (!songFile) {
      throw new Error('请先选择歌曲文件。');
    }

    const payload = buildPayload(songFile, lyricsFile, coverFile, category);
    await ensureNoDuplicate(payload);
    const catalogUpdate = await prepareCatalogUpdate(payload, category);
    await writeMediaFiles(payload, category);
    if (coverFile) {
      await generateCoverThumbnail(payload, category);
    }
    await updateCatalogFile(catalogUpdate, category);

    await refreshCatalogSongs();
    notifyMusicCatalogUpdated();

    resetForm({ preserveStatus: true });
    addLog(`已添加《${payload.song_name}》到 ${category.label}`, 'success');
    showToast(`导入成功：${payload.song_name}`, 'success');
    setFeedback(`导入成功：${payload.song_name}`, 'success');
    renderPreview(payload, category);
  } catch (error) {
    addLog(error.message || '添加失败', 'error');
    showToast(error.message || '添加失败', 'error');
    setFeedback(error.message || '添加失败', 'error');
  }
}

function resetForm(options = {}) {
  elements.form.reset();
  restoreSelectedCategory();
  elements.time.value = '';
  updateFileHints();
  renderPreview();
  if (options.preserveStatus) {
    return;
  }
  setFeedback('表单已清空');
}

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
  const coverTargetName = coverFile ? buildSiblingFileName(coverFile, normalizedBaseName) : '';

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
    song_name: readStringProperty(entry, 'song_name'),
    song_file: readStringProperty(entry, 'song_file'),
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

  content.append(title);
  item.append(content, category);
  return item;
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function writeMediaFiles(payload, category) {
  const mediaDir = await state.projectRootHandle.getDirectoryHandle('media');
  const categoryDir = await mediaDir.getDirectoryHandle(category.folder, { create: true });

  await writeFileToDirectory(categoryDir, payload.song_file, payload.sourceFiles.songFile);
  if (payload.sourceFiles.lyricsFile) {
    await writeFileToDirectory(categoryDir, payload.lyrics_file, payload.sourceFiles.lyricsFile);
  }
  if (payload.sourceFiles.coverFile) {
    await writeFileToDirectory(categoryDir, payload.img_file, payload.sourceFiles.coverFile);
  }

  addLog(`媒体文件已写入 media/${category.folder}/`, 'success');
}

async function writeFileToDirectory(directoryHandle, fileName, sourceFile) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await sourceFile.arrayBuffer());
  await writable.close();
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
  const nextSource = source.replace(/(\n\];\s*)$/, `,\n${entry}$1`);

  if (nextSource === source) {
    throw new Error(`无法更新 ${category.catalogFile}，数组结尾格式不符合预期。`);
  }

  return { fileHandle, nextSource };
}

async function updateCatalogFile(catalogUpdate, category) {
  const writable = await catalogUpdate.fileHandle.createWritable();
  await writable.write(catalogUpdate.nextSource);
  await writable.close();
  addLog(`歌单文件已更新：catalog/${category.catalogFile}`, 'success');
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
  const thumbName = payload.img_file.replace(/\.[^.]+$/, '.jpg');
  const thumbHandle = await categoryDir.getFileHandle(thumbName, { create: true });
  const writable = await thumbHandle.createWritable();
  await writable.write(await blob.arrayBuffer());
  await writable.close();

  addLog(`缩略图已生成：assets/covers/music-thumbs/${category.folder}/${thumbName}`, 'success');
}

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

function addLog(message, type = '') {
  const item = document.createElement('div');
  item.className = `log-entry ${type}`.trim();
  item.textContent = message;
  elements.log.prepend(item);
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
