const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { readUnreadCount, UnreadTracker, watchUnread } = require('../src/unread');
const { watchFocus } = require('../src/focus');

test('unread follow activity is excluded from message counts in native navigation panels', async t => {
  const dom = new JSDOM('<div id="rail" style="position:fixed;left:0;top:0;width:220px;height:100vh"><div><a href="/">Home</a><a href="/explore/">Explore</a><a href="/direct/inbox/">Messages</a></div></div><main><a href="/direct/t/1/"><span aria-label="Unread"></span>Chat</a></main>', { url: 'https://www.instagram.com/direct/inbox/' });
  const stop = watchFocus(dom.window);
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.querySelector('#rail').insertAdjacentHTML('beforeend', '<section><h2>Notifications</h2><div role="listitem"><span aria-label="Unread"></span>friend started following you.</div></section>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(readUnreadCount(dom.window.document), 1);
});

test('reads unread title counts without collecting message text', () => {
  const dom = new JSDOM('<title>(3) Instagram • Messages</title><main>Private message</main>');
  assert.equal(readUnreadCount(dom.window.document), 3);
  dom.window.document.title = 'Instagram • Messages';
  assert.equal(readUnreadCount(dom.window.document), 0);
  dom.window.close();
});

test('recognizes explicit unread markers and ignores unread words inside received text', () => {
  const dom = new JSDOM('<main><div role="button"><span aria-label="Unread"></span></div><div role="button">this unread message is text</div></main>');
  assert.equal(readUnreadCount(dom.window.document), 1);
  dom.window.close();
});

test('does not notify the initial backlog or repeated snapshots', () => {
  const tracker = new UnreadTracker({ warmupMs: 100 });
  assert.equal(tracker.observe(8, { now: 0, ready: true }), false);
  assert.equal(tracker.observe(9, { now: 40, ready: true }), false);
  assert.equal(tracker.observe(9, { now: 160, ready: true }), false);
  assert.equal(tracker.observe(10, { now: 170, ready: true }), true);
  assert.equal(tracker.observe(10, { now: 180, ready: true }), false);
});

test('loading and authentication reset the baseline instead of alerting for hydration', () => {
  const tracker = new UnreadTracker({ warmupMs: 100 });
  tracker.observe(0, { now: 0, ready: false });
  tracker.observe(12, { now: 1000, ready: true });
  assert.equal(tracker.observe(12, { now: 1200, ready: true }), false);
  tracker.reset();
  assert.equal(tracker.observe(30, { now: 1400, ready: true }), false);
  assert.equal(tracker.observe(30, { now: 1550, ready: true }), false);
  assert.equal(tracker.observe(31, { now: 1600, ready: true }), true);
});

test('reading messages lowers the baseline and invalid data is ignored', () => {
  const tracker = new UnreadTracker({ warmupMs: 0 });
  tracker.observe(5, { now: 0 });
  assert.equal(tracker.observe(2, { now: 1 }), false);
  assert.equal(tracker.observe(3, { now: 2 }), true);
  for (const value of [-1, Infinity, NaN, '4', 1.5]) assert.equal(tracker.observe(value, { now: 3 }), false);
});

test('actual observer emits bounded counts only on messaging routes', async () => {
  const dom = new JSDOM('<title>Instagram • Messages</title><main><a href="/direct/t/1/">Friend</a></main>', { url: 'https://www.instagram.com/direct/inbox/' });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  const seen = [];
  const stop = watchUnread(dom.window, count => seen.push(count), { warmupMs: 0 });
  dom.window.document.title = '(1) Instagram • Messages';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, [1]);
  dom.window.history.pushState({}, '', '/accounts/login/');
  dom.window.document.title = '(2) Instagram';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, [1]);
  stop();
  dom.window.close();
});

test('delayed initial unread hydration establishes a baseline rather than an alert', () => {
  const tracker = new UnreadTracker();
  assert.equal(tracker.observe(0, { now: 0 }), false);
  assert.equal(tracker.observe(12, { now: 3000 }), false);
  assert.equal(tracker.observe(12, { now: 6000 }), false);
  assert.equal(tracker.observe(13, { now: 6100 }), true);
});

test('a usable inbox continues observing unread changes with a lazy loading row', async t => {
  const dom = new JSDOM('<title>Instagram • Messages</title><main><a href="/direct/t/1/">Friend</a><span aria-label="Loading more conversations"></span></main>', { url: 'https://www.instagram.com/direct/inbox/' });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  const seen = [];
  const stop = watchUnread(dom.window, count => seen.push(count), { warmupMs: 0 });
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.title = '(1) Instagram • Messages';
  await new Promise(resolve => setTimeout(resolve, 20));
  dom.window.document.title = '(2) Instagram • Messages';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, [1, 2]);
  stop();
  dom.window.close();
});

test('an empty SPA shell is not a usable inbox even after its document loads', async t => {
  const dom = new JSDOM('<title>Instagram • Messages</title><main><span>Loading</span></main>', { url: 'https://www.instagram.com/direct/inbox/' });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  const seen = [];
  const stop = watchUnread(dom.window, count => seen.push(count), { warmupMs: 0 });
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.title = '(12) Instagram • Messages';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, []);
  dom.window.document.querySelector('main').innerHTML = '<a href="/direct/t/1/">Friend</a>';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, []);
  dom.window.document.title = '(13) Instagram • Messages';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, [13]);
  stop();
  dom.window.close();
});
