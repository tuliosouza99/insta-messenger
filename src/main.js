const { app, BrowserWindow, session, protocol, ipcMain, shell, dialog, nativeTheme, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { readFile } = require('node:fs/promises');
const { INBOX_URL, classifyNavigation, externalDestination } = require('./policy');
const { classifyDesktopNavigation } = require('./desktop-policy');
const { installMenu } = require('./menu');
const { createNotificationController } = require('./notifications');
const { createAttachmentController } = require('./attachments');
const { createActivityController } = require('./activity');

app.setName('Instagram Messenger');
app.enableSandbox();
const profileOverride = app.commandLine.getSwitchValue('user-data-dir');
if (profileOverride) app.setPath('userData', path.resolve(profileOverride));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const PARTITION = 'persist:instagram-messenger';
const attachments = createAttachmentController({ getWindow, partition: PARTITION });
const activity = createActivityController({ getWindow, partition: PARTITION });
const ERROR_URL = 'app://ui/error.html';
let window;
let retryUrl = INBOX_URL;
let resetting = false;
let quitting = false;
let lastMessagingUrl = INBOX_URL;
let lastEmbeddedUrl = INBOX_URL;
const preferencesPath = path.join(app.getPath('userData'), 'messenger-preferences.json');
let notificationsEnabled = true;
try { notificationsEnabled = JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).notificationsEnabled !== false; } catch { /* First launch uses the user's requested notifications. */ }

const notificationController = createNotificationController({
  Notification, getWindow, openInbox, isEnabled: () => notificationsEnabled,
  onError: (_error, { isTest }) => {
    if (isTest && getWindow()) void dialog.showMessageBox(getWindow(), {
      type: 'info', message: 'macOS could not deliver the test notification.',
      detail: 'Allow Instagram Messenger in System Settings → Notifications, then try again. Use the packaged app; notification delivery requires a signed application.',
    });
  },
});

function setNotificationsEnabled(enabled) {
  notificationsEnabled = enabled === true;
  try {
    fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
    fs.writeFileSync(`${preferencesPath}.tmp`, JSON.stringify({ notificationsEnabled }), { mode: 0o600 });
    fs.renameSync(`${preferencesPath}.tmp`, preferencesPath);
  } catch {
    if (getWindow()) void dialog.showMessageBox(getWindow(), { type: 'info', message: 'This notification preference could not be saved. It will apply until you quit the app.' });
  }
}

function isRecoveryUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'app:' && url.host === 'ui' && url.pathname === '/error.html';
  } catch { return false; }
}

function getWindow() { return window && !window.isDestroyed() ? window : null; }

function isTrustedSender(event) {
  const current = getWindow();
  return current && event.sender === current.webContents && event.senderFrame === current.webContents.mainFrame;
}

async function loadTarget(url) {
  attachments.close();
  activity.close();
  const current = getWindow();
  if (!current) return;
  try { await current.loadURL(url); } catch (error) {
    // The load event owns recovery, including aborted navigations.
    if (error.code !== 'ERR_ABORTED' && !isRecoveryUrl(url)) showError('network');
  }
}

function showError(reason) {
  const current = getWindow();
  if (!current || isRecoveryUrl(current.webContents.getURL())) return;
  void loadTarget(`${ERROR_URL}?reason=${reason}`);
}

function openInbox() {
  if (!getWindow()) createWindow();
  else void loadTarget(INBOX_URL);
}

function returnToMessages(fromStories) {
  const url = fromStories && classifyNavigation(lastMessagingUrl) === 'messaging' ? lastMessagingUrl : INBOX_URL;
  void loadTarget(url);
}

function redirectToMessages(fromStories = false) {
  setImmediate(() => { if (getWindow()) returnToMessages(fromStories); });
}

function rememberEmbeddedUrl(url) {
  lastEmbeddedUrl = url;
  if (classifyNavigation(url) === 'messaging') lastMessagingUrl = url;
}

function guardNavigation(event, url) {
  if (['messaging', 'auth', 'stories'].includes(classifyDesktopNavigation(url))) return;
  event.preventDefault();
  const source = getWindow()?.webContents.getURL();
  if (classifyNavigation(source) === 'auth' && !url.startsWith('https://www.instagram.com/')) {
    retryUrl = 'https://www.instagram.com/accounts/login/';
    showError('signin');
  } else redirectToMessages(classifyDesktopNavigation(source) === 'stories');
}

function createWindow() {
  window = new BrowserWindow({
    width: 1120, height: 800, minWidth: 720, minHeight: 560,
    title: 'Instagram Messenger', show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101114' : '#faf9f6',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, '..', 'build', 'preload.cjs'),
      partition: PARTITION, sandbox: true, contextIsolation: true,
      nodeIntegration: false, webSecurity: true,
      allowRunningInsecureContent: false, webviewTag: false,
      safeDialogs: true, navigateOnDragDrop: false,
    },
  });
  const current = window;
  const wc = current.webContents;
  current.once('ready-to-show', () => current.show());
  current.on('close', event => {
    if (process.platform === 'darwin' && !quitting) {
      event.preventDefault();
      current.hide();
    }
  });
  current.on('closed', () => { attachments.close(); activity.close(); if (window === current) window = null; });
  wc.on('page-title-updated', event => { event.preventDefault(); });
  wc.on('will-navigate', guardNavigation);
  wc.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame) guardNavigation(event, url);
  });
  wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    attachments.close();
    activity.close();
    if (!['messaging', 'auth', 'stories'].includes(classifyDesktopNavigation(url)) && !isRecoveryUrl(url)) {
      redirectToMessages(classifyDesktopNavigation(lastEmbeddedUrl) === 'stories');
    } else {
      if (!isRecoveryUrl(url)) rememberEmbeddedUrl(url);
      wc.send('messenger:route-changed');
    }
  });
  wc.on('did-navigate', (_event, url) => {
    attachments.close();
    activity.close();
    if (!['messaging', 'auth', 'stories'].includes(classifyDesktopNavigation(url)) && !isRecoveryUrl(url)) {
      redirectToMessages(classifyDesktopNavigation(lastEmbeddedUrl) === 'stories');
    } else if (!isRecoveryUrl(url)) rememberEmbeddedUrl(url);
  });
  wc.setWindowOpenHandler(() => {
    if (classifyNavigation(wc.getURL()) === 'auth') {
      retryUrl = 'https://www.instagram.com/accounts/login/';
      showError('signin');
    }
    return { action: 'deny' };
  });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || isRecoveryUrl(url) || resetting) return;
    if (['messaging', 'auth', 'stories'].includes(classifyDesktopNavigation(url))) retryUrl = url;
    showError('network');
  });
  wc.on('render-process-gone', () => showError('network'));
  void loadTarget(INBOX_URL);
  return current;
}

async function resetSession() {
  const current = getWindow();
  if (!current || resetting) return;
  resetting = true;
  attachments.close();
  current.webContents.stop();
  try {
    const ses = current.webContents.session;
    // Navigate away first so live Instagram scripts cannot recreate cleared data.
    await current.loadURL(`${ERROR_URL}?reason=reset`);
    await ses.clearStorageData();
    await ses.clearCache();
    await ses.cookies.flushStore();
    retryUrl = INBOX_URL;
    lastMessagingUrl = INBOX_URL;
    lastEmbeddedUrl = INBOX_URL;
    await loadTarget('https://www.instagram.com/accounts/login/');
  } catch {
    showError('network');
  } finally { resetting = false; }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const current = getWindow() || createWindow();
    if (current.isMinimized()) current.restore();
    current.show();
    current.focus();
  });
  app.whenReady().then(() => {
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\sinstagram-messenger-desktop\/\S+/g, ''));
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (event, item, contents) => {
      // Website downloads are not an implicit way to launch executables or handlers.
      event.preventDefault();
      if (attachments.owns(contents) || activity.owns(contents)) return;
      const destination = externalDestination(item.getURL());
      if (destination && getWindow()) {
        void dialog.showMessageBox(getWindow(), { type: 'info', message: 'Open this attachment in your browser?',
          detail: 'Downloads are handled by your regular browser.', buttons: ['Open in browser', 'Cancel'], defaultId: 1, cancelId: 1,
        }).then(({ response }) => { if (response === 0) void shell.openExternal(destination).catch(() => {}); });
      }
    });
    const resources = new Map([
      ['/error.html', ['error.html', 'text/html; charset=utf-8']],
      ['/error.css', ['error.css', 'text/css; charset=utf-8']],
      ['/error.js', ['error.js', 'text/javascript; charset=utf-8']],
      ['/attachment-error.html', ['attachment-error.html', 'text/html; charset=utf-8']],
      ['/activity-error.html', ['activity-error.html', 'text/html; charset=utf-8']],
    ]);
    ses.protocol.handle('app', async request => {
      const url = new URL(request.url);
      const resource = url.host === 'ui' && resources.get(url.pathname);
      if (!resource || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const [filename, mime] = resource;
      return new Response(await readFile(path.join(__dirname, 'ui', filename)), {
        headers: {
          'Content-Type': mime,
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
        },
      });
    });
    ipcMain.on('messenger:external', (event, rawUrl) => {
      if (!isTrustedSender(event) || !['messaging', 'stories'].includes(classifyDesktopNavigation(event.senderFrame.url))) return;
      const url = externalDestination(rawUrl);
      if (url) void shell.openExternal(url).catch(() => {
        if (getWindow()) void dialog.showMessageBox(getWindow(), { type: 'info', message: 'Couldn’t open your browser. Please try the link again.' });
      });
    });
    ipcMain.on('messenger:navigate', (event, action) => {
      if (!isTrustedSender(event)) return;
      const source = classifyDesktopNavigation(event.senderFrame.url);
      if (!['messaging', 'stories'].includes(source) || !action || typeof action !== 'object') return;
      if (action.type === 'messages') returnToMessages(source === 'stories');
      else if (action.type === 'activity' && source === 'messaging') { attachments.close(); activity.open(); }
      else if (action.type === 'story' && classifyDesktopNavigation(action.url) === 'stories') {
        if (source === 'messaging') lastMessagingUrl = event.senderFrame.url;
        void loadTarget(action.url);
      }
      else if (action.type === 'attachment' && source === 'messaging'
        && /^\/direct\/t\/[^/]+\/?$/.test(new URL(event.senderFrame.url).pathname)) attachments.open(action.url);
    });
    ipcMain.on('messenger:close-attachment', event => attachments.closeFrom(event));
    ipcMain.on('messenger:close-activity', event => activity.closeFrom(event));
    ipcMain.on('messenger:activity-external', (event, rawUrl) => {
      if (!activity.isSender(event)) return;
      const url = externalDestination(rawUrl);
      if (url) void shell.openExternal(url).catch(() => {});
    });
    ipcMain.on('messenger:recover', (event, action) => {
      if (!isTrustedSender(event) || !isRecoveryUrl(event.senderFrame.url)) return;
      if (action === 'retry') void loadTarget(retryUrl);
      else if (action === 'inbox') openInbox();
    });
    ipcMain.on('messenger:auth-blocked', event => {
      if (!isTrustedSender(event) || classifyNavigation(event.senderFrame.url) !== 'auth') return;
      retryUrl = 'https://www.instagram.com/accounts/login/';
      showError('signin');
    });
    ipcMain.on('messenger:unread', (event, count) => {
      if (!isTrustedSender(event) || classifyNavigation(event.senderFrame.url) !== 'messaging') return;
      if (!Number.isSafeInteger(count) || count < 1 || count > 999999) return;
      notificationController.notifyUnread();
    });
    installMenu({ getWindow, openInbox, reload: () => {
      attachments.close();
      activity.close();
      const current = getWindow();
      if (!current) createWindow();
      else if (isRecoveryUrl(current.webContents.getURL())) void loadTarget(retryUrl);
      else current.webContents.reload();
    }, resetSession, notifications: {
      isEnabled: () => notificationsEnabled, setEnabled: setNotificationsEnabled,
      sendTest: () => notificationController.sendTest(),
    } });
    createWindow();
    app.on('activate', () => {
      const current = getWindow();
      if (!current) createWindow();
      else { current.show(); current.focus(); }
    });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { quitting = true; });
}
