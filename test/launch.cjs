// Intercept before the first window loads: fixture tests must never hit Instagram.
const electron = require('electron');
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
    return new Response(globalThis.__fixtureHtml, { headers: { 'Content-Type': 'text/html' } });
  });
});
require('../src/main');
