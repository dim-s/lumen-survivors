/* =====================================================================
   ELECTRON MAIN — десктоп-обёртка LUMEN (приоритет: Windows для Steam).
   Грузит prod-сборку Vite (dist/index.html, относительные пути через base:'./')
   или dev-сервер (VITE_DEV_SERVER_URL). Игра самодостаточна (localStorage,
   WebAudio, WebGL) — node-интеграция выключена, contextIsolation включён.

   Режим LUMEN_SMOKE=1 — headless-проверка загрузки: окно скрыто, software-WebGL,
   ждём did-finish-load, ловим ошибки рендерера, выходим (0=OK / 1=ошибка).
   ===================================================================== */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const SMOKE = process.env.LUMEN_SMOKE === '1';

// в smoke (headless/CI) — программный WebGL, чтобы pixi инициализировался без GPU
if (SMOKE) {
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 480,
    backgroundColor: '#03040a',
    autoHideMenuBar: true,
    fullscreenable: true,
    show: !SMOKE,
    title: 'LUMEN — Survivors',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,   // игра не должна замирать в фоне
    },
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  if (SMOKE) runSmoke(win);
  return win;
}

// headless-смоук: дождаться загрузки, собрать ошибки рендерера, выйти кодом
function runSmoke(win) {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push('console: ' + message);   // 3 = error
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('render-process-gone: ' + d.reason));
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push('did-fail-load: ' + code + ' ' + desc));

  win.webContents.on('did-finish-load', async () => {
    // дать кадрам отрисоваться (pixi init + RAF)
    await new Promise((r) => setTimeout(r, 2500));
    let state = null;
    try {
      state = await win.webContents.executeJavaScript(
        'JSON.stringify({ hasGame: !!window.GAME, state: window.GAME && window.GAME.state, ' +
        'pixiReady: !!(window.GAME) })'
      );
    } catch (e) { errors.push('eval: ' + e.message); }
    const ok = errors.length === 0 && state && JSON.parse(state).hasGame;
    console.log('SMOKE: state=' + state + ' errors=' + JSON.stringify(errors));
    console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL');
    app.exit(ok ? 0 : 1);
  });

  // страховочный таймаут
  setTimeout(() => { console.log('SMOKE: TIMEOUT'); app.exit(1); }, 20000);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
