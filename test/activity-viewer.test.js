const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installActivityViewer } = require('../src/activity-viewer');

test('an ambiguous activity layout never reveals the home feed', t => {
  const dom = new JSDOM('<header><button aria-label="Notifications">Notifications</button></header><main id="feed">Home feed</main>', { url: 'https://www.instagram.com/' });
  dom.window.document.querySelector('button').addEventListener('click', () => {
    dom.window.document.body.insertAdjacentHTML('beforeend', '<div><h2>Notifications</h2><p>friend started following you.</p></div>');
  });
  const stop = installActivityViewer(dom.window, { onBack() {}, onExternal() {} });
  t.after(() => { stop(); dom.window.close(); });
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#feed')).visibility, 'hidden');
  assert.equal(dom.window.document.querySelector('body[data-messenger-activity-stage]'), null);
});

test('a semantic activity panel is isolated from a sibling feed inside the same wrapper', t => {
  const dom = new JSDOM('<header><button aria-label="Notifications">Notifications</button></header><nav><a href="/">Home</a></nav><div><main id="feed">Home feed</main><aside id="panel"><h1>Notifications</h1><p>friend started following you.</p></aside></div>', { url: 'https://www.instagram.com/' });
  const stop = installActivityViewer(dom.window, { onBack() {}, onExternal() {} });
  t.after(() => { stop(); dom.window.close(); });
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#feed')).visibility, 'hidden');
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#panel p')).visibility, 'visible');
});

test('activity activation retries after Instagram installs its native click handler', t => {
  const dom = new JSDOM('<header><button aria-label="Notifications">Notifications</button></header><main id="feed">Home feed</main>', { url: 'https://www.instagram.com/' });
  let retry;
  dom.window.setInterval = callback => { retry = callback; return 1; };
  const stop = installActivityViewer(dom.window, { onBack() {}, onExternal() {} });
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.querySelector('button').addEventListener('click', () => {
    dom.window.document.body.insertAdjacentHTML('beforeend', '<aside id="panel"><h2>Notifications</h2><p>friend started following you.</p></aside>');
  });
  assert.equal(typeof retry, 'function');
  retry();
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#panel p')).visibility, 'visible');
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#feed')).visibility, 'hidden');
});
