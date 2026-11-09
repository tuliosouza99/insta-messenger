const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const inbox = 'https://www.instagram.com/direct/inbox/';
const fixture = `<!doctype html><html><head><title>Instagram fixture</title></head><body>
<header><a id="back-home" href="/" title="Back"><svg width="24" height="24"><path d="M20 12H4" /></svg></a><button id="back-button" aria-label="Back">Back</button><a href="/friend/"><img width="24" height="24" alt="Friend"></a></header>
<nav id="rail"><a href="/">Home</a><a href="/explore/">Explore</a><a href="/reels/">Reels</a><a href="/direct/inbox/">Messages</a></nav>
<main><h1>Messages</h1><aside><a href="/direct/t/123/">Friends group</a></aside>
<article><a id="shared" href="/reel/shared/">Shared Reel</a><a id="public" href="https://example.com/hello">Public link</a>
<div role="row"><a id="attachment" target="_blank" href="/p/ATTACHMENT/">Received post</a></div>
<div role="row"><img id="direct-photo" width="240" height="180" alt="Received photo" src="https://scontent.cdninstagram.com/photo.svg"><video id="direct-video" width="320" height="240" src="https://scontent.cdninstagram.com/direct.mp4"></video></div>
<div role="row"><div role="button" tabindex="0" id="native-reel"><a href="/creator/">Creator</a><img alt="Clip" width="160" height="200" src="https://scontent.cdninstagram.com/reel-cover.svg"></div><div role="button" tabindex="0" id="native-carousel"><a href="/creator/">Creator</a><img alt="Photo" width="160" height="200" src="https://scontent.cdninstagram.com/carousel-cover.svg"></div></div>
<a id="story" target="_blank" href="/stories/friend/123/">View story</a>
<textarea aria-label="Message"></textarea><input aria-label="Attach" type="file"></article></main></body></html>`;
let application;
let page;
let userData;

async function launch() {
  application = await electron.launch({ args: [path.join(__dirname, 'launch.cjs'), `--user-data-dir=${userData}`], timeout: 30000 });
  page = await application.firstWindow();
  const nativeFixtures = await readFile(path.join(__dirname, 'fixtures', 'native-attachments.js'), 'utf8');
  await application.evaluate((_, html) => { globalThis.__fixtureHtml = html; }, fixture.replace('</body>', `<script>${nativeFixtures}</script></body>`));
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

test('the in-app bell opens native follow activity without leaving the chat or sending desktop alerts', async () => {
  await page.locator('textarea').fill('Unsent follow activity draft');
  const noticesBefore = await application.evaluate(() => globalThis.__nativeNotices.length);
  await page.evaluate(() => {
    const rail = document.querySelector('#rail');
    const control = document.createElement('a');
    control.id = 'native-notifications';
    control.href = '#';
    control.innerHTML = '<svg aria-label="Notifications"></svg>';
    control.addEventListener('click', event => {
      event.preventDefault();
      const panel = document.querySelector('#native-activity-panel');
      if (panel) { panel.remove(); return; }
      rail.insertAdjacentHTML('beforeend', '<section id="native-activity-panel"><h2>Notifications</h2><p>new.friend started following you.</p><p>another.friend accepted your follow request.</p><span aria-label="Unread"></span><button id="close-activity">Close</button></section>');
      document.querySelector('#close-activity').addEventListener('click', () => document.querySelector('#native-activity-panel').remove());
    });
    rail.append(control);
  });
  const bell = page.locator('#messenger-activity-controls').getByRole('button', { name: 'Notifications', exact: true });
  await bell.waitFor();
  await bell.evaluate(button => button.click());
  assert.equal(await page.locator('#native-activity-panel').count(), 0);
  await bell.click();
  await page.getByText('new.friend started following you.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByText('another.friend accepted your follow request.', { exact: true }).isVisible(), true);
  assert.equal(await page.locator('#rail a[href="/explore/"]').isVisible(), false);
  assert.equal(await page.locator('textarea').inputValue(), 'Unsent follow activity draft');
  assert.equal(page.url(), inbox);
  await page.locator('#close-activity').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail')).display === 'none');
  await bell.click();
  await page.locator('#native-activity-panel').waitFor({ state: 'visible' });
  await bell.click();
  await page.locator('#native-activity-panel').waitFor({ state: 'detached' });
  assert.equal(await application.evaluate(() => globalThis.__nativeNotices.length), noticesBefore);
  await page.evaluate(() => history.pushState({}, '', '/accounts/login/'));
  await bell.waitFor({ state: 'detached' });
  await page.evaluate(() => history.pushState({}, '', '/direct/inbox/'));
  await bell.waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelector('#native-notifications').remove());
  await bell.waitFor({ state: 'visible' });
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

async function attachmentPage() {
  await assertEventually(async () => {
    assert.ok(application.context().pages().some(candidate => candidate !== page && candidate.url().includes('/p/ATTACHMENT/')));
  });
  return application.context().pages().find(candidate => candidate !== page && candidate.url().includes('/p/ATTACHMENT/'));
}

test('a received attachment opens over the chat with only media and Back, preserving the composer', async () => {
  const thread = 'https://www.instagram.com/direct/t/456/';
  await page.goto(thread);
  await page.locator('textarea').fill('Unsent draft');
  await page.locator('#attachment').click();
  const viewer = await attachmentPage();
  await viewer.getByRole('button', { name: 'Back to message', exact: true }).waitFor();
  await viewer.locator('[data-messenger-live-stage] img').waitFor();
  assert.equal(await viewer.locator('#next-post').isVisible(), false);
  assert.equal(await viewer.locator('#messenger-attachment-viewer').getByRole('button').count(), 1);
  assert.equal(await viewer.evaluate(() => [typeof window.require, typeof window.messenger].join(',')), 'undefined,undefined');
  assert.equal(await page.locator('textarea').inputValue(), 'Unsent draft');
  assert.equal(page.url(), thread);
  await viewer.getByRole('button', { name: 'Back to message', exact: true }).click();
  await assertEventually(async () => assert.equal(viewer.isClosed(), true));
  assert.equal(await page.locator('textarea').inputValue(), 'Unsent draft');
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
});

test('attachment views deny document links, popups and automatic onward SPA navigation', async () => {
  await page.locator('#attachment').click();
  let viewer = await attachmentPage();
  await viewer.getByRole('button', { name: 'Back to message' }).waitFor();
  await viewer.evaluate(() => {
    window.open('https://www.instagram.com/reel/OTHER/');
    location.href = 'https://www.instagram.com/reel/OTHER/';
  });
  // Electron cancels the provisional load; inspect the retained renderer directly
  // because Playwright's navigation auto-wait does not see that cancellation.
  assert.equal(await viewer.evaluate(() => document.querySelector('#messenger-attachment-viewer').shadowRoot.querySelector('button').textContent), 'Back to message');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents.isLoadingMainFrame()), false);
  assert.equal(viewer.url(), 'https://www.instagram.com/p/ATTACHMENT/');
  assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), 3);
  await viewer.evaluate(() => history.pushState({}, '', '/reel/OTHER/'));
  await assertEventually(async () => assert.equal(viewer.isClosed(), true));
  await page.locator('#attachment').click();
  viewer = await attachmentPage();
  await viewer.getByRole('button', { name: 'Back to message' }).waitFor();
  await viewer.keyboard.press('Escape').catch(error => { if (!viewer.isClosed()) throw error; });
  await assertEventually(async () => assert.equal(viewer.isClosed(), true));
});

test('chat photos open in a focused overlay and Back or Escape restores the draft', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('textarea').fill('Photo reply draft');
  await page.locator('#direct-photo').click();
  const overlay = page.locator('#messenger-attachment-viewer');
  assert.equal(await overlay.locator('img').getAttribute('alt'), 'Received photo');
  assert.equal(await overlay.locator('img').count(), 1);
  assert.equal(await page.locator('body > main').getAttribute('inert'), '');
  await overlay.getByRole('button', { name: 'Back to message' }).click();
  assert.equal(await overlay.count(), 0);
  assert.equal(await page.locator('body > main').getAttribute('inert'), null);
  assert.equal(await page.locator('textarea').inputValue(), 'Photo reply draft');
  await page.locator('#direct-photo').click();
  await page.keyboard.press('Escape');
  assert.equal(await overlay.count(), 0);
});

test('a received video has working playback controls without any onward navigation', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('textarea').fill('Photo reply draft');
  await page.locator('#direct-video').click();
  const overlay = page.locator('#messenger-attachment-viewer');
  const video = overlay.locator('video');
  await page.waitForFunction(() => document.querySelector('#messenger-attachment-viewer')?.shadowRoot.querySelector('video')?.readyState >= 2);
  assert.equal(await video.evaluate(element => element.controls), true);
  const bounds = await video.boundingBox();
  await video.click({ position: { x: 20, y: bounds.height - 48 } });
  await assertEventually(async () => assert.equal(await video.evaluate(element => element.paused), false));
  await assertEventually(async () => assert.ok(await video.evaluate(element => element.currentTime > 0)));
  await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'attachment-video.png') });
  assert.equal(await overlay.getByRole('button').count(), 1);
  assert.equal(await overlay.locator('a').count(), 0);
  await overlay.getByRole('button', { name: 'Back to message' }).click();
  assert.equal(await page.locator('textarea').inputValue(), 'Photo reply draft');
});

test('streamed message video keeps its MediaSource player and restores it on Back', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.evaluate(async () => {
    const video = document.querySelector('#direct-video');
    const bytes = await fetch(video.src).then(response => response.arrayBuffer());
    const stream = new MediaSource();
    window.__originalStream = video;
    video.src = URL.createObjectURL(stream);
    await new Promise((resolve, reject) => {
      stream.addEventListener('sourceopen', () => {
        const buffer = stream.addSourceBuffer('video/mp4; codecs="avc1.42C01E"');
        buffer.addEventListener('error', () => reject(new Error(`MediaSource fixture: ${video.error?.message || 'source buffer error'}`)), { once: true });
        buffer.addEventListener('updateend', () => { stream.endOfStream(); resolve(); }, { once: true });
        buffer.appendBuffer(bytes);
      }, { once: true });
    });
  });
  await page.locator('#direct-video').click();
  const overlay = page.locator('#messenger-attachment-viewer');
  const video = overlay.locator('video');
  assert.equal(await video.evaluate(element => element === window.__originalStream), true);
  await page.waitForFunction(() => window.__originalStream.readyState >= 2);
  const bounds = await video.boundingBox();
  await video.click({ position: { x: 20, y: bounds.height - 48 } });
  await assertEventually(async () => assert.equal(await video.evaluate(element => element.paused), false));
  await assertEventually(async () => assert.ok(await video.evaluate(element => element.currentTime > 0)));
  await overlay.getByRole('button', { name: 'Back to message' }).click();
  assert.equal(await page.evaluate(() => document.querySelector('#direct-video') === window.__originalStream), true);
  assert.equal(await page.locator('#direct-video').evaluate(element => element.controls), false);
});

test('a shared Reel card starts its native stream and plays without becoming a static cover', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('textarea').fill('Native Reel draft');
  await page.locator('#native-reel img').click();
  const video = page.locator('#native-stage video');
  await page.waitForFunction(() => document.querySelector('#native-stage video')?.readyState >= 2);
  assert.equal(await video.evaluate(element => element.parentElement.id), 'native-stage');
  assert.equal(await page.locator('#native-poster').isVisible(), false);
  assert.equal(await page.locator('#native-recommendation').isVisible(), false);
  const bounds = await video.boundingBox();
  await video.click({ position: { x: 20, y: bounds.height - 48 } });
  await assertEventually(async () => assert.ok(await video.evaluate(element => element.currentTime > 0)));
  await page.getByRole('button', { name: 'Back to message', exact: true }).click();
  assert.equal(await page.locator('[data-native-test-modal]').count(), 0);
  assert.equal(await page.locator('textarea').inputValue(), 'Native Reel draft');
});

test('a received carousel advances through lazy photos and back within the same attachment', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await page.locator('#native-carousel img').click();
  const photo = page.locator('#native-stage img[data-current]');
  await photo.waitFor();
  assert.equal(await photo.getAttribute('alt'), 'Photo 1');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await photo.getAttribute('alt'), 'Photo 2');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await photo.getAttribute('alt'), 'Photo 3');
  assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  assert.equal(await photo.getAttribute('alt'), 'Photo 2');
  const geometry = await photo.evaluate(element => {
    const stage = element.closest('[data-messenger-live-stage]').getBoundingClientRect();
    const photo = element.getBoundingClientRect();
    return { frame: stage.width, photo: photo.width, offset: photo.left - stage.left };
  });
  assert.ok(Math.abs(geometry.frame - geometry.photo) < 1, 'neighbouring slides must remain outside the frame');
  assert.ok(Math.abs(geometry.offset) < 1, 'the active slide must align with the viewport');
  assert.equal(await page.locator('#native-recommendation').isVisible(), false);
  await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'attachment-carousel.png') });
  await page.getByRole('button', { name: 'Back to message', exact: true }).click();
  assert.equal(page.url(), 'https://www.instagram.com/direct/t/456/');
  assert.equal(await page.locator('[data-native-test-modal]').count(), 0);
});

test('attachment failure retains Back and returning to inbox disposes the resized view', async () => {
  await page.goto('https://www.instagram.com/direct/t/456/');
  await application.evaluate(() => { globalThis.__fixtureMode = 'offline'; });
  await page.locator('#attachment').click();
  await assertEventually(async () => assert.equal(application.context().pages().length, 2));
  const viewer = application.context().pages().find(candidate => candidate !== page);
  await viewer.waitForURL('app://ui/attachment-error.html');
  assert.match(await viewer.getByRole('status').innerText(), /unavailable/);
  await viewer.getByRole('button', { name: 'Back to message' }).click();
  await application.evaluate(() => { globalThis.__fixtureMode = 'normal'; });
  assert.equal(page.url(), 'https://www.instagram.com/direct/t/456/');
  await page.locator('#attachment').click();
  await attachmentPage();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
  const dimensions = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { content: window.getContentSize(), view: window.contentView.children.at(-1).getBounds() };
  });
  assert.equal(dimensions.view.width, dimensions.content[0]);
  assert.equal(dimensions.view.height, dimensions.content[1]);
  await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('inbox').click());
  await page.waitForURL(inbox);
  await assertEventually(async () => assert.equal(application.context().pages().length, 1));
});

test('forged or non-thread attachment grants are rejected', async () => {
  await page.goto(inbox);
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    ipcMain.emit('messenger:navigate', { sender: wc, senderFrame: {} }, { type: 'attachment', url: 'https://www.instagram.com/p/ATTACHMENT/' });
    ipcMain.emit('messenger:navigate', { sender: wc, senderFrame: wc.mainFrame }, { type: 'attachment', url: 'https://www.instagram.com/p/ATTACHMENT/' });
  });
  assert.equal(application.context().pages().length, 1);
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
  // Include the observer's two-second hydration grace plus its next sample.
  await new Promise(resolve => setTimeout(resolve, 3200));
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

test('the bell opens isolated native activity from a standalone inbox and preserves the draft', async () => {
  await page.goto(inbox);
  await page.locator('textarea').fill('Keep this inbox draft');
  await page.locator('#messenger-activity-controls').getByRole('button', { name: 'Notifications', exact: true }).click();
  await assertEventually(async () => assert.ok(application.context().pages().some(candidate => candidate !== page && candidate.url() === 'https://www.instagram.com/')));
  let activity = application.context().pages().find(candidate => candidate !== page && candidate.url() === 'https://www.instagram.com/');
  await activity.getByRole('button', { name: 'Back to messages', exact: true }).waitFor();
  await activity.getByText('new.friend started following you.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await activity.locator('#feed').isVisible(), false);
  assert.equal(await activity.locator('#browse').isVisible(), false);
  assert.equal(await activity.evaluate(() => [typeof window.require, typeof window.messenger].join(',')), 'undefined,undefined');
  assert.equal(await page.locator('textarea').inputValue(), 'Keep this inbox draft');
  const openedBefore = await application.evaluate(() => globalThis.__openedUrls.length);
  await activity.locator('#activity-profile').click();
  await assertEventually(async () => assert.equal(await application.evaluate(() => globalThis.__openedUrls.length), openedBefore + 1));
  assert.equal(activity.url(), 'https://www.instagram.com/');
  await activity.getByRole('button', { name: 'Back to messages', exact: true }).click();
  await assertEventually(async () => assert.equal(activity.isClosed(), true));
  assert.equal(await page.locator('textarea').inputValue(), 'Keep this inbox draft');
  await page.locator('#messenger-activity-controls').getByRole('button', { name: 'Notifications', exact: true }).click();
  await assertEventually(async () => assert.ok(application.context().pages().some(candidate => candidate !== page && candidate.url() === 'https://www.instagram.com/')));
  activity = application.context().pages().find(candidate => candidate !== page && candidate.url() === 'https://www.instagram.com/');
  await activity.getByRole('button', { name: 'Back to messages', exact: true }).waitFor();
  await activity.evaluate(() => { location.href = 'https://www.instagram.com/explore/'; });
  assert.equal(activity.url(), 'https://www.instagram.com/');
  await activity.keyboard.press('Escape').catch(error => { if (!activity.isClosed()) throw error; });
  await assertEventually(async () => assert.equal(activity.isClosed(), true));
});

test('offline activity retains a working Back control and preserves the inbox draft', async () => {
  await application.evaluate(() => { globalThis.__fixtureMode = 'offline'; });
  await page.locator('#messenger-activity-controls').getByRole('button', { name: 'Notifications', exact: true }).click();
  await assertEventually(async () => assert.ok(application.context().pages().some(candidate => candidate.url() === 'app://ui/activity-error.html')));
  const activity = application.context().pages().find(candidate => candidate.url() === 'app://ui/activity-error.html');
  await activity.getByText('Instagram activity could not be loaded. Go back to messages and try again.', { exact: true }).waitFor();
  await activity.getByRole('button', { name: 'Back to messages', exact: true }).click();
  await assertEventually(async () => assert.equal(activity.isClosed(), true));
  assert.equal(await page.locator('textarea').inputValue(), 'Keep this inbox draft');
  await application.evaluate(() => { globalThis.__fixtureMode = 'normal'; });
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
