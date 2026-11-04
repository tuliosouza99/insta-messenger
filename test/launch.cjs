// Intercept before the first window loads: fixture tests must never hit Instagram.
const electron = require('electron');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { app, session, shell } = electron;
globalThis.__nativeNotices = [];
// Keep the real native object/event wiring; stub only OS banner delivery.
electron.Notification.prototype.show = function () {
  this.options = { title: this.title, body: this.body };
  globalThis.__nativeNotices.push(this);
};
globalThis.__openedUrls = [];
globalThis.__fixtureMode = 'normal';
globalThis.__fixtureHtml = '<!doctype html><html><body><h1>Fixture ready</h1></body></html>';
shell.openExternal = async url => { globalThis.__openedUrls.push(url); };
app.whenReady().then(() => {
  session.fromPartition('persist:instagram-messenger').protocol.handle('https', request => {
    if (globalThis.__fixtureMode === 'offline') return Response.error();
    if (globalThis.__fixtureMode === 'redirect-login' && new URL(request.url).pathname.startsWith('/direct')) {
      return new Response(null, { status: 302, headers: { Location: 'https://www.instagram.com/accounts/login/' } });
    }
    if (new URL(request.url).hostname === 'scontent.cdninstagram.com') {
      if (new URL(request.url).pathname.endsWith('.mp4')) {
        return new Response(readFileSync(path.join(__dirname, 'fixtures', 'attachment.mp4')), { headers: { 'Content-Type': 'video/mp4' } });
      }
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#25475b"/><text x="160" y="240" fill="white" font-size="32">Received attachment</text></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
    }
    if (new URL(request.url).pathname === '/p/ATTACHMENT/') {
      return new Response('<!doctype html><html><body><main><article><a href="/p/ATTACHMENT/">Selected post</a><img width="640" height="480" src="https://scontent.cdninstagram.com/fixture.svg"></article><a id="next-post" href="/reel/OTHER/">Next Reel</a></main></body></html>', { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response(globalThis.__fixtureHtml, { headers: { 'Content-Type': 'text/html' } });
  });
});
require('../src/main');
