const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { notificationControl, installActivityControls } = require('../src/activity-controls');
const { watchFocus } = require('../src/focus');

function fixture(label = 'Notifications') {
  return new JSDOM(`<nav id="rail"><div id="links"><a href="/">Home</a><a href="/explore/">Explore</a><a href="/direct/inbox/">Messages</a><a id="activity" href="#"><svg aria-label="${label}"></svg></a></div></nav><main><textarea>Unsent draft</textarea><article><button aria-label="Notifications">Received content</button></article></main>`, { url: 'https://www.instagram.com/direct/t/123/' });
}

test('the bell remains available in a standalone inbox without global Instagram navigation', () => {
  const dom = fixture();
  dom.window.document.querySelector('#rail').remove();
  let opened = 0;
  const controls = installActivityControls(dom.window, () => opened++);
  const host = dom.window.document.querySelector('#messenger-activity-controls');
  assert.ok(host, 'standalone messaging layouts still need an activity bell');
  host.shadowRoot.querySelector('button').click();
  assert.equal(opened, 0, 'synthetic clicks cannot open the native activity view');
  controls.dispose();
  dom.window.close();
});

test('finds localized Instagram notification controls only in global navigation', () => {
  for (const label of ['Notifications', 'Notificações', 'Notificaciones']) {
    const dom = fixture(label);
    assert.equal(notificationControl(dom.window.document)?.id, 'activity');
    dom.window.document.querySelector('#rail').remove();
    assert.equal(notificationControl(dom.window.document), null);
    dom.window.close();
  }
});

test('offers one accessible bell, ignores synthetic activation, and follows SPA replacement', async t => {
  const dom = fixture();
  const controls = installActivityControls(dom.window);
  t.after(() => { controls.dispose(); dom.window.close(); });
  const host = dom.window.document.querySelector('#messenger-activity-controls');
  const button = host.shadowRoot.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Notifications');
  let clicks = 0;
  dom.window.document.querySelector('#activity').addEventListener('click', () => clicks++);
  button.click();
  assert.equal(clicks, 0);
  dom.window.document.body.append(dom.window.document.createElement('div'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelectorAll('#messenger-activity-controls').length, 1);
  dom.window.history.pushState({}, '', '/accounts/login/');
  controls.refresh();
  assert.equal(dom.window.document.querySelector('#messenger-activity-controls'), null);
});

test('activity panels with a main landmark do not reveal browsing navigation', async t => {
  const dom = fixture();
  const stop = watchFocus(dom.window);
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.querySelector('#rail').insertAdjacentHTML('beforeend', '<div role="main" id="panel"><header><span>Notifications</span></header><a href="/friend/">friend started following you.</a></div>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelector('#panel').closest('[data-messenger-hidden]'), null);
  assert.ok(dom.window.document.querySelector('#links').closest('[data-messenger-hidden]'));
});

test('a notification label in a link-role control is not confused with an open activity panel', () => {
  const dom = fixture();
  const document = dom.window.document;
  document.querySelector('#activity').outerHTML = '<div role="link" tabindex="0" id="activity"><span>Notifications</span></div>';
  assert.equal(notificationControl(document)?.id, 'activity');
  const stop = watchFocus(dom.window);
  assert.equal(dom.window.getComputedStyle(document.querySelector('#rail')).display, 'none');
  stop();
  dom.window.close();
});

test('absolute navigation links stay hidden when the activity panel shares a nested wrapper', async t => {
  const dom = fixture();
  const document = dom.window.document;
  for (const anchor of document.querySelectorAll('#links a')) anchor.setAttribute('href', anchor.href);
  document.querySelector('#rail').innerHTML = `<div id="wrapper">${document.querySelector('#rail').innerHTML}</div>`;
  const stop = watchFocus(dom.window);
  t.after(() => { stop(); dom.window.close(); });
  document.querySelector('#wrapper').insertAdjacentHTML('beforeend', '<section id="panel"><h2>Notifications</h2><p>friend started following you.</p></section>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.querySelector('#panel').closest('[data-messenger-hidden]'), null);
  assert.ok(document.querySelector('#links').closest('[data-messenger-hidden]'));
});

test('an expanding div-based rail keeps navigation hidden while showing activity', async t => {
  const dom = fixture();
  const document = dom.window.document;
  document.querySelector('#rail').outerHTML = `<div id="rail" style="position:fixed;left:0;top:0;width:220px;height:100vh">${document.querySelector('#rail').innerHTML}</div>`;
  const stop = watchFocus(dom.window);
  t.after(() => { stop(); dom.window.close(); });
  const rail = document.querySelector('#rail');
  rail.style.width = '400px';
  rail.insertAdjacentHTML('beforeend', '<section id="panel"><h2>Notifications</h2><p>friend started following you.</p></section>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.querySelector('#panel').closest('[data-messenger-hidden]'), null);
  assert.ok(document.querySelector('#links').closest('[data-messenger-hidden]'));
  assert.equal(notificationControl(document)?.id, 'activity');
  document.querySelector('#panel').remove();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.getComputedStyle(rail).display, 'none');
});

test('a native activity panel nested in the hidden rail remains visible while browsing links stay hidden', async t => {
  const dom = fixture();
  const stop = watchFocus(dom.window);
  t.after(() => { stop(); dom.window.close(); });
  const document = dom.window.document;
  assert.equal(dom.window.getComputedStyle(document.querySelector('#rail')).display, 'none');
  document.querySelector('#rail').insertAdjacentHTML('beforeend', '<section id="panel"><h2>Notifications</h2><a href="/new.friend/">new.friend started following you.</a><a href="/another.friend/">another.friend accepted your follow request.</a></section>');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.notEqual(dom.window.getComputedStyle(document.querySelector('#rail')).display, 'none');
  assert.equal(document.querySelector('#panel').closest('[data-messenger-hidden]'), null);
  assert.ok(document.querySelector('#links').closest('[data-messenger-hidden]'));
  assert.equal(document.querySelector('textarea').value, 'Unsent draft');
  document.querySelector('#panel').remove();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.getComputedStyle(document.querySelector('#rail')).display, 'none');
});
