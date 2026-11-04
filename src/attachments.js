const { WebContentsView } = require('electron');
const path = require('node:path');
const { attachmentDestination, sameAttachment } = require('./desktop-policy');

function createAttachmentController({ getWindow, partition }) {
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
  function open(rawUrl) {
    const selected = attachmentDestination(rawUrl);
    const parent = getWindow();
    if (!selected || !parent) return;
    close();
    const view = new WebContentsView({ webPreferences: {
      preload: path.join(__dirname, '..', 'build', 'attachment-preload.cjs'),
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
    const guard = (event, url) => { if (!sameAttachment(selected, url)) event.preventDefault(); };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', (event, url, _inPlace, isMainFrame) => { if (isMainFrame) guard(event, url); });
    wc.on('did-navigate-in-page', (_event, url, mainFrame) => {
      if (mainFrame && !sameAttachment(selected, url)) close();
    });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-attach-webview', event => event.preventDefault());
    wc.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') { event.preventDefault(); close(); }
    });
    wc.on('render-process-gone', close);
    wc.on('did-finish-load', () => { if (active?.view === view) wc.focus(); });
    // No downloaded file or external handler can be launched from this view.
    wc.on('will-prevent-unload', event => event.preventDefault());
    parent.contentView.addChildView(view);
    parent.on('resize', resize);
    resize();
    wc.focus();
    void wc.loadURL(selected).catch(() => {
      if (active?.view === view && !wc.isDestroyed()) void wc.loadURL('app://ui/attachment-error.html').catch(() => {
        if (active?.view === view) close();
      });
    });
  }
  function closeFrom(event) {
    if (active && event.sender === active.view.webContents && event.senderFrame === event.sender.mainFrame) close();
  }
  function owns(wc) { return active?.view.webContents === wc; }
  return { open, close, closeFrom, owns };
}

module.exports = { createAttachmentController };
