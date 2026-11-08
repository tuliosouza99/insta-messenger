const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function fixture(t, html, path) {
  const dom = new JSDOM(html, { url: `https://www.instagram.com${path}` });
  let ready = false;
  const opened = [];
  const { installActivityViewer } = require('../ios/activity-viewer');
  const dispose = installActivityViewer(dom.window, {
    onReady: value => { ready = value; },
    onExternal: url => opened.push(url),
  });
  t.after(() => { dispose(); dom.window.close(); });
  return { window: dom.window, document: dom.window.document, isReady: () => ready, opened };
}

test('a standalone Notifications page reveals activity and keeps global navigation hidden', t => {
  const { window, document, isReady } = fixture(t, `
    <header><h1>Notificações</h1></header>
    <nav><a href="/">Home</a><a href="/explore/">Explore</a></nav>
    <main><p id="notice">Someone started following you.</p></main>
  `, '/accounts/activity/');
  assert.equal(isReady(), true);
  assert.equal(window.getComputedStyle(document.querySelector('#notice')).visibility, 'visible');
  assert.equal(window.getComputedStyle(document.querySelector('nav a')).visibility, 'hidden');
});

test('the homepage fallback opens the site panel while its feed stays hidden', t => {
  const dom = new JSDOM(`<nav><button aria-label="Notifications"></button></nav>
    <main><article id="feed">A feed post</article></main>`, { url: 'https://www.instagram.com/' });
  const { window } = dom;
  const { document } = window;
  document.querySelector('button').addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', '<aside><h2>Notifications</h2><a href="/someone/">Someone</a></aside>');
  });
  const { installActivityViewer } = require('../ios/activity-viewer');
  const opened = [];
  const dispose = installActivityViewer(window, { onExternal: url => opened.push(url) });
  t.after(() => { dispose(); window.close(); });
  assert.equal(window.getComputedStyle(document.querySelector('#feed')).visibility, 'hidden');
  const profile = document.querySelector('aside a');
  assert.equal(window.getComputedStyle(profile).visibility, 'visible');
  const synthetic = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  assert.equal(profile.dispatchEvent(synthetic), false);
  assert.deepEqual(opened, []);
});

test('a generic feed never becomes activity even when it has a Notifications label', t => {
  const { window, document, isReady } = fixture(t, `
    <main><h1>Notifications</h1><article id="feed">A feed post</article></main>
  `, '/notifications/');
  assert.equal(isReady(), false);
  assert.equal(window.getComputedStyle(document.querySelector('#feed')).visibility, 'hidden');
});

test('a hidden activity panel cannot take precedence over the open panel', t => {
  const { document } = fixture(t, `
    <div style="display:none"><aside id="closed"><h2>Notifications</h2></aside></div>
    <aside id="transparent" style="opacity:0"><h2>Notifications</h2></aside>
    <aside id="open"><h2>Notifications</h2><p>Someone started following you.</p></aside>
  `, '/');
  const stage = document.querySelector('[data-messenger-activity-stage]');
  assert.equal(stage?.id, 'open');
});

test('a standalone activity heading cannot reveal an unrelated browsing grid', t => {
  const { window, document, isReady } = fixture(t, `
    <header><h1>Notifications</h1></header>
    <main><div><a href="/p/x/">A feed post</a><a href="/reels/y/">A reel</a></div></main>
  `, '/notifications/');
  assert.equal(isReady(), false);
  assert.equal(window.getComputedStyle(document.querySelector('main a')).visibility, 'hidden');
});

test('the Notifications drawer can sit inside Instagram’s navigation landmark', t => {
  const { window, document, isReady } = fixture(t, `
    <nav><a href="/">Home</a><a href="/explore/">Explore</a>
      <aside><h2>Notifications</h2><p id="notice">Someone started following you.</p></aside>
    </nav>
    <main><article>Feed</article></main>
  `, '/');
  assert.equal(isReady(), true);
  assert.equal(window.getComputedStyle(document.querySelector('#notice')).visibility, 'visible');
  assert.equal(window.getComputedStyle(document.querySelector('nav a')).visibility, 'hidden');
});

test('the mobile Notifications heading can sit inside a nav next to the activity list', t => {
  const { window, document, isReady } = fixture(t, `
    <section>
      <nav><header><h1>Notificações</h1></header><a href="/">Home</a></nav>
      <div><main id="activity-list"><p>Uma pessoa começou a seguir você.</p></main></div>
    </section>
    <article id="feed">An unrelated post</article>
  `, '/notifications/');
  assert.equal(isReady(), true);
  assert.equal(window.getComputedStyle(document.querySelector('#activity-list p')).visibility, 'visible');
  assert.equal(window.getComputedStyle(document.querySelector('#feed')).visibility, 'hidden');
});
