const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const inbox = 'https://www.instagram.com/direct/inbox/';
const fixture = `<!doctype html><html><head><title>Instagram fixture</title></head><body>
<header><a id="back-home" href="/" title="Back"><svg width="24" height="24"><path d="M20 12H4" /></svg></a><button id="back-button" aria-label="Back">Back</button><a href="/friend/"><img width="24" height="24" alt="Friend"></a></header>
<nav id="rail"><a href="/">Home</a><a href="/explore/">Explore</a><a href="/reels/">Reels</a><a href="/direct/inbox/">Messages</a></nav>
<main><h1>Messages</h1><aside><a href="/direct/t/123/">Friends group</a></aside>
<article><a id="shared" href="/reel/shared/">Shared Reel</a><a id="public" href="https://example.com/hello">Public link</a>
<a id="story" target="_blank" href="/stories/friend/123/">View story</a>
<textarea aria-label="Message"></textarea><input aria-label="Attach" type="file"></article></main></body></html>`;
let application;
let page;
let userData;

async function launch() {
  application = await electron.launch({ args: [path.join(__dirname, 'launch.cjs'), `--user-data-dir=${userData}`], timeout: 30000 });
  page = await application.firstWindow();
  await application.evaluate((_, html) => { globalThis.__fixtureHtml = html; }, fixture);
  await page.goto(inbox);
  await page.locator('h1').waitFor();
}

before(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'instagram-messenger-test-'));
  await launch();
});
after(async () => {
  await application?.close();
  await rm(userData, { recursive: true, force: true });
});

test('real renderer is isolated and the actual preload preserves messages', async () => {
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail')).display === 'none');
  assert.equal(await page.locator('textarea').isVisible(), true);
  assert.equal(await page.locator('#shared').isVisible(), true);
  const exposed = await page.evaluate(() => [typeof window.require, typeof window.process, typeof window.messenger]);
  assert.deepEqual(exposed, ['undefined', 'undefined', 'undefined']);
  const settings = await application.evaluate(({ BrowserWindow, session }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    const prefs = wc.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration,
      webSecurity: prefs.webSecurity, dedicated: wc.session === session.fromPartition('persist:instagram-messenger'), persistent: wc.session.isPersistent() };
  });
  assert.deepEqual(settings, { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
    dedicated: true, persistent: true });
});

test('trusted mouse, keyboard and middle clicks open shared links; synthetic clicks and popups do not', async () => {
  await page.locator('#shared').click();
  await page.locator('#public').focus();
  await page.keyboard.press('Enter');
  await page.locator('#shared').click({ button: 'middle' });
  await page.waitForFunction(() => document.activeElement !== null);
  await assertEventually(async () => {
    assert.deepEqual(await application.evaluate(() => globalThis.__openedUrls), [
      'https://www.instagram.com/reel/shared/', 'https://example.com/hello', 'https://www.instagram.com/reel/shared/',
    ]);
  });
  await page.evaluate(() => {
    document.querySelector('#public').click();
    window.open('https://example.com/popup');
  });
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  assert.equal(page.url(), inbox);
});

test('SPA and document navigation cannot leave the messaging routes', async () => {
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => history.pushState({}, '', '/explore/'))]);
  await page.waitForURL(inbox);
  await page.locator('textarea').waitFor();
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => { location.href = 'https://example.com/automatic'; })]);
  await page.waitForURL(inbox);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
});

test('conversation home/back controls return to the inbox without opening a browser', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('#back-home svg').click();
  await page.waitForURL(inbox);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('#back-button').click();
  await page.waitForURL(inbox);
});

test('story links stay in the current window and return to the last conversation', async () => {
  const thread = 'https://www.instagram.com/direct/t/456/';
  await page.goto(thread);
  await page.locator('#story').click();
  await page.waitForURL('https://www.instagram.com/stories/friend/123/');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await page.locator('#back-home').click();
  await page.waitForURL(thread);
  await page.goto(inbox);
});

test('SPA story navigation stays embedded and closing via home restores the last chat', async () => {
  const thread = 'https://www.instagram.com/direct/t/789/';
  await page.goto(thread);
  await page.evaluate(() => history.pushState({}, '', '/stories/friend/456/'));
  await page.waitForURL('https://www.instagram.com/stories/friend/456/');
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => history.pushState({}, '', '/'))]);
  await page.waitForURL(thread);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await page.goto(inbox);
});

test('the conversation header offers View story and removes it in the inbox', async () => {
  const thread = 'https://www.instagram.com/direct/t/456/';
  await page.goto(thread);
  await page.getByRole('button', { name: 'View story', exact: true }).click();
  await page.waitForURL('https://www.instagram.com/stories/friend/');
  await page.locator('#back-home').click();
  await page.waitForURL(thread);
  await page.goto(inbox);
  assert.equal(await page.getByRole('button', { name: 'View story', exact: true }).count(), 0);
});

test('full-document story close restores the conversation and rejects forged story navigation', async () => {
  const thread = 'https://www.instagram.com/direct/t/123/';
  await page.goto(thread);
  await page.evaluate(() => { location.href = 'https://www.instagram.com/stories/friend/123/'; });
  await page.waitForURL('https://www.instagram.com/stories/friend/123/');
  await page.evaluate(() => { location.href = 'https://www.instagram.com/'; });
  await page.waitForURL(thread);
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    ipcMain.emit('messenger:navigate', { sender: wc, senderFrame: {} }, { type: 'story', url: 'https://www.instagram.com/stories/friend/' });
    ipcMain.emit('messenger:navigate', { sender: wc, senderFrame: wc.mainFrame }, { type: 'story', url: 'https://evil.test/stories/friend/' });
  });
  assert.equal(page.url(), thread);
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await page.goto(inbox);
});

test('Instagram login redirects and challenge routes remain usable', async () => {
  await application.evaluate(() => { globalThis.__fixtureMode = 'redirect-login'; });
  await page.goto(inbox);
  await page.waitForURL('https://www.instagram.com/accounts/login/');
  assert.equal(await page.locator('#rail').isVisible(), true);
  await page.goto('https://www.instagram.com/accounts/login/two_factor/');
  await page.goto('https://www.instagram.com/challenge/123/');
  assert.equal(await page.locator('textarea').isVisible(), true);
  await application.evaluate(() => { globalThis.__fixtureMode = 'normal'; });
  await page.goto(inbox);
});

test('an unsupported authentication anchor shows a direct-sign-in recovery path', async () => {
  await page.goto('https://www.instagram.com/accounts/login/');
  await page.evaluate(() => {
    document.querySelector('#shared').href = 'https://www.facebook.com/login/';
  });
  await page.locator('#shared').click();
  await page.getByRole('heading', { name: 'Sign in directly with Instagram' }).waitFor({ timeout: 3000 });
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForURL('https://www.instagram.com/accounts/login/');
  await page.goto(inbox);
});

test('same-document auth transitions restore previously hidden navigation', async () => {
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail')).display === 'none');
  await page.evaluate(() => history.pushState({}, '', '/accounts/login/'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail')).display !== 'none', null, { timeout: 3000 });
  await page.goto(inbox);
});

test('offline loads show a local recovery page and Retry returns to the inbox', async () => {
  await application.evaluate(() => { globalThis.__fixtureMode = 'offline'; });
  await page.reload().catch(() => {});
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.ok(page.url().startsWith('app://ui/error.html'));
  assert.equal(await page.getByRole('heading').innerText(), 'Couldn’t reach Instagram');
  await application.evaluate(() => { globalThis.__fixtureMode = 'normal'; });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForURL(inbox);
  await page.locator('textarea').waitFor();
});

test('session reset cancellation preserves cookies; confirmation clears them', async () => {
  await application.evaluate(async ({ BrowserWindow }) => {
    await BrowserWindow.getAllWindows()[0].webContents.session.cookies.set({ url: 'https://www.instagram.com', name: 'messenger_test', value: 'keep', httpOnly: true });
  });
  await application.evaluate(async ({ Menu, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
    await Menu.getApplicationMenu().getMenuItemById('reset-session').click();
  });
  let cookies = await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.cookies.get({ name: 'messenger_test' }));
  assert.equal(cookies.length, 1);
  await application.evaluate(async ({ Menu, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
    await Menu.getApplicationMenu().getMenuItemById('reset-session').click();
  });
  await assertEventually(async () => {
    cookies = await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.cookies.get({ name: 'messenger_test' }));
    assert.equal(cookies.length, 0);
  });
  await page.waitForURL('https://www.instagram.com/accounts/login/');
  await page.locator('textarea').waitFor();
});

test('session cookies survive an application restart in the dedicated profile', async () => {
  await application.evaluate(async ({ BrowserWindow }) => {
    const ses = BrowserWindow.getAllWindows()[0].webContents.session;
    await ses.cookies.set({ url: 'https://www.instagram.com', name: 'persistent_test', value: 'survived', expirationDate: Date.now() / 1000 + 3600, httpOnly: true });
    await ses.cookies.flushStore();
  });
  await application.close();
  await launch();
  const cookies = await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.cookies.get({ name: 'persistent_test' }));
  assert.equal(cookies[0]?.value, 'survived');
});

test('closing the Mac window keeps a live inbox and unread activity produces a native notice', async () => {
  await page.goto(inbox);
  await page.waitForLoadState('load');
  // Exercise the real observer's initial-hydration grace period.
  await new Promise(resolve => setTimeout(resolve, 2200));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await page.evaluate(() => { document.title = '(1) Instagram • Messages'; });
  await assertEventually(async () => {
    assert.equal(await application.evaluate(() => globalThis.__nativeNotices.length), 1);
  });
  assert.equal(await application.evaluate(() => globalThis.__nativeNotices[0].options.body), 'You have new unread messages on Instagram.');
  await application.evaluate(() => globalThis.__nativeNotices[0].emit('click'));
  await page.waitForURL(inbox);
  await assertEventually(async () => {
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  });
});

test('notification controls and IPC checks reject disabled or forged activity', async () => {
  await application.evaluate(({ ipcMain, BrowserWindow, Menu }) => {
    const current = BrowserWindow.getAllWindows()[0].webContents;
    ipcMain.emit('messenger:unread', { sender: current, senderFrame: {} }, 2);
    ipcMain.emit('messenger:unread', { sender: current, senderFrame: current.mainFrame }, -1);
    const item = Menu.getApplicationMenu().getMenuItemById('enable-notifications');
    item.click();
  });
  await application.evaluate(({ BrowserWindow, ipcMain }) => {
    const current = BrowserWindow.getAllWindows()[0].webContents;
    current.getOwnerBrowserWindow().hide();
    ipcMain.emit('messenger:unread', { sender: current, senderFrame: current.mainFrame }, 5);
  });
  assert.equal(await application.evaluate(() => globalThis.__nativeNotices.length), 1);
  await application.close();
  await launch();
  assert.equal(await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('enable-notifications').checked), false);
  await application.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().getMenuItemById('enable-notifications');
    item.click();
    Menu.getApplicationMenu().getMenuItemById('test-notification').click();
  });
  assert.equal(await application.evaluate(() => globalThis.__nativeNotices.length), 1);
});

test('recovery UI is visually usable at the minimum supported window size', async () => {
  await application.evaluate(() => { globalThis.__fixtureMode = 'offline'; });
  await page.reload().catch(() => {});
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 560));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mkdir(path.join(__dirname, '..', 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'recovery.png'), animations: 'disabled' });
});

async function assertEventually(check) {
  let lastError;
  for (let i = 0; i < 30; i++) {
    try { await check(); return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw lastError;
}
