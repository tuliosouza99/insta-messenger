const { WebContentsView } = require('electron');
const path = require('node:path');
const { isInstagramHome } = require('./desktop-policy');

function isActivityShell(raw) {
  if (isInstagramHome(raw)) return true;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port && /^\/(accounts\/activity|notifications)\/?$/.test(url.pathname);
  } catch { return false; }
}

function createActivityController({ getWindow, partition }) {
  let active;
  function close() {
    if (!active) return;
    const { parent, view, resize } = active;
    active = null;
    parent.removeListener('resize', resize);
    if (!parent.isDestroyed()) parent.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
    if (!parent.isDestroyed()) parent.webContents.focus();
  }
  function open() {
    const parent = getWindow();
    if (!parent) return;
    close();
    const view = new WebContentsView({ webPreferences: {
      preload: path.join(__dirname, '..', 'build', 'activity-preload.cjs'),
      partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      safeDialogs: true, navigateOnDragDrop: false,
    } });
    const wc = view.webContents;
    const resize = () => {
      const [width, height] = parent.getContentSize();
      view.setBounds({ x: 0, y: 0, width, height });
    };
    active = { parent, view, resize };
    const guard = (event, url) => { if (!isActivityShell(url)) event.preventDefault(); };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', (event, url, _inPlace, mainFrame) => { if (mainFrame) guard(event, url); });
    wc.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame && !isActivityShell(url)) close(); });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-attach-webview', event => event.preventDefault());
    wc.on('will-prevent-unload', event => event.preventDefault());
    wc.on('render-process-gone', close);
    wc.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') { event.preventDefault(); close(); }
    });
    wc.on('did-finish-load', () => { if (active?.view === view) wc.focus(); });
    wc.setAudioMuted(true);
    parent.contentView.addChildView(view);
    parent.on('resize', resize);
    resize();
    wc.focus();
    void wc.loadURL('https://www.instagram.com/').catch(() => {
      if (active?.view === view && !wc.isDestroyed()) void wc.loadURL('app://ui/activity-error.html').catch(() => {
        if (active?.view === view) close();
      });
    });
  }
  const owns = wc => active?.view.webContents === wc;
  const isSender = event => owns(event.sender) && event.senderFrame === event.sender.mainFrame;
  function closeFrom(event) { if (isSender(event)) close(); }
  return { open, close, owns, isSender, closeFrom };
}

module.exports = { createActivityController };
