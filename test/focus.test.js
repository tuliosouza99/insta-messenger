const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { applyFocus, watchFocus } = require('../src/focus');

const links = '<a href="/">Home</a><a href="/explore/">Explore</a><a href="/reels/">Reels</a><a href="/direct/inbox/">Messages</a><a href="/me/">Profile</a>';
function fixture(html, path = '/direct/inbox/') {
  return new JSDOM(html, { url: `https://www.instagram.com${path}` });
}

test('removes the global rail while preserving chat list, shared reels and attachments', () => {
  const dom = fixture(`<nav id="rail">${links}</nav><main><aside id="threads"><a href="/direct/t/1/">Friends</a></aside><article><a id="media" href="/reel/123/">Shared Reel</a><textarea id="composer"></textarea><input id="attachment" type="file"></article></main>`);
  applyFocus(dom.window.document);
  const d = dom.window.document;
  assert.equal(d.querySelector('#rail').getAttribute('data-messenger-hidden'), '');
  for (const id of ['threads', 'media', 'composer', 'attachment']) {
    assert.equal(d.querySelector(`#${id}`).closest('[data-messenger-hidden]'), null);
  }
  dom.window.close();
});

test('recognizes div-based global navigation without relying on English labels', () => {
  const dom = fixture(`<div id="rail" style="position:fixed;left:0;top:0;width:220px;height:100vh"><div><a href="/">Início</a></div><div><a href="/explore/">Explorar</a></div><div><a href="/direct/inbox/">Mensagens</a></div></div><div id="conversation"><a href="/direct/t/1/">Chat</a><div contenteditable="true">Message</div></div>`);
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('#rail').hasAttribute('data-messenger-hidden'), true);
  assert.equal(dom.window.document.querySelector('#conversation').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});

test('never hides an ambiguous ancestor that also contains messaging content', () => {
  const dom = fixture(`<div id="everything">${links}<div contenteditable="true">Composer</div><a href="/direct/t/1/">Thread</a></div>`);
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('#everything').hasAttribute('data-messenger-hidden'), false);
  dom.window.close();
});

test('does not alter authentication and challenge screens', () => {
  for (const path of ['/accounts/login/', '/challenge/123/']) {
    const dom = fixture(`<nav>${links}</nav><form><input name="username"><input name="password"><button>Log in</button></form>`, path);
    applyFocus(dom.window.document);
    assert.equal(dom.window.document.querySelectorAll('[data-messenger-hidden]').length, 0);
    dom.window.close();
  }
});

test('reapplies filtering after dynamic DOM replacement, without observer loops', async () => {
  const dom = fixture('<main><textarea></textarea></main>');
  const stop = watchFocus(dom.window);
  dom.window.document.body.insertAdjacentHTML('afterbegin', `<nav id="rail">${links}</nav>`);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(dom.window.document.querySelector('#rail').hasAttribute('data-messenger-hidden'), true);
  applyFocus(dom.window.document);
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelectorAll('style[data-messenger-style]').length, 1);
  stop();
  dom.window.close();
});

test('leaves message-only navigation and unrecognized layouts usable', () => {
  const dom = fixture('<nav id="messages"><a href="/direct/inbox/">Inbox</a><a href="/direct/new/">New</a></nav><main>Hello</main>');
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('#messages').hasAttribute('data-messenger-hidden'), false);
  dom.window.close();
});

test('a received message containing browsing links is never inferred to be navigation', () => {
  const dom = fixture(`<div id="conversation"><div id="received">${links}</div><div contenteditable="true">Message</div></div>`);
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('#received').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});

test('reused containers become visible when the route changes to authentication', () => {
  const dom = fixture(`<nav id="rail">${links}</nav><main>Chat</main>`);
  applyFocus(dom.window.document);
  dom.window.document.querySelector('#rail').innerHTML = '<form><input name="username"><button>Log in</button></form>';
  dom.window.history.pushState({}, '', '/accounts/login/');
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('form').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});

test('reused containers become visible when replaced with conversation content', () => {
  const dom = fixture(`<nav id="rail">${links}</nav><main>Chat</main>`);
  applyFocus(dom.window.document);
  dom.window.document.querySelector('#rail').innerHTML = '<div contenteditable="true">New conversation</div>';
  applyFocus(dom.window.document);
  assert.equal(dom.window.document.querySelector('[contenteditable]').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});
