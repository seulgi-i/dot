// Dot: 오늘 적용 카드 + 추천 프롬프트 + 스킬 성적표. 새로고침은 ↻ 버튼으로만 한다(자동 갱신·파일 감시 없음).
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const labdata = require('./lib/labdata');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; }
}
const config = readConfig();
const devlog = process.env.DOT_DEVLOG || config.devlog || path.join(__dirname, 'sample-data');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 960, minHeight: 600,
    frame: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false, title: 'Dot', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  if (typeof win.setBackgroundMaterial === 'function') {
    try { win.setBackgroundMaterial('acrylic'); } catch (_) { /* Windows 11 외에서는 무시 */ }
  }
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('load', () => ({
  board: labdata.scoreboard(devlog, { skillsRoot: config.skillsRoot || undefined }),
  prompts: labdata.prompts(devlog),
  wikiCommands: labdata.wikiCommands(devlog),
  applyToday: labdata.applyToday(devlog),
  loadedAt: new Date().toISOString(),
}));
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
ipcMain.handle('openCard', (_e, rel) => {
  const full = path.resolve(devlog, String(rel || ''));
  if (!full.startsWith(path.resolve(devlog))) return false;
  return shell.openPath(full).then((err) => !err);
});

ipcMain.handle('win:minimize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.minimize();
  return true;
});
ipcMain.handle('win:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.close();
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
