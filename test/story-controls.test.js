const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installStoryControls } = require('../src/story-controls');

test('adds one View story control beside the contact in a conversation header', () => {
  const dom = new JSDOM('<header><a href="/friend.name/"><img alt="Friend"></a></header><main><article><a href="/other/"><img></a></article><textarea></textarea></main>', { url: 'https://www.instagram.com/direct/t/123/' });
  const opened = [];
  const stop = installStoryControls(dom.window, url => opened.push(url));
  const button = dom.window.document.querySelector('[data-messenger-view-story]');
  assert.equal(button?.textContent, 'View story');
  assert.equal(dom.window.document.querySelector('header').children.length, 1);
  assert.equal(button?.dataset.storyUrl, 'https://www.instagram.com/stories/friend.name/');
  button.click();
  assert.deepEqual(opened, []);
  stop();
  dom.window.close();
});

test('does not attach story controls to message avatars or inbox navigation', () => {
  for (const path of ['/direct/t/123/', '/direct/inbox/']) {
    const dom = new JSDOM('<main><article><a href="/friend/"><img></a></article></main>', { url: `https://www.instagram.com${path}` });
    const stop = installStoryControls(dom.window, () => {});
    assert.equal(dom.window.document.querySelector('[data-messenger-view-story]'), null);
    stop();
    dom.window.close();
  }
});

test('updates the contact and removes the control when leaving a conversation', async t => {
  const dom = new JSDOM('<header><a href="/friend/"><img></a></header>', { url: 'https://www.instagram.com/direct/t/123/' });
  const stop = installStoryControls(dom.window, () => {});
  t.after(() => { stop(); dom.window.close(); });
  dom.window.document.querySelector('a').href = '/another/';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelectorAll('[data-messenger-view-story]').length, 1);
  assert.equal(dom.window.document.querySelector('[data-messenger-view-story]').dataset.storyUrl, 'https://www.instagram.com/stories/another/');
  dom.window.history.pushState({}, '', '/accounts/login/');
  dom.window.document.body.append(dom.window.document.createElement('div'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelector('[data-messenger-view-story]'), null);
});

test('ignores retained hidden headers and follows visibility changes', async t => {
  const dom = new JSDOM('<header id="old" hidden><a href="/old/"><img></a></header><header id="current"><a href="/current/"><img></a></header>', { url: 'https://www.instagram.com/direct/t/123/' });
  const stop = installStoryControls(dom.window, () => {});
  t.after(() => { stop(); dom.window.close(); });
  assert.equal(dom.window.document.querySelector('[data-messenger-view-story]').dataset.storyUrl, 'https://www.instagram.com/stories/current/');
  dom.window.document.querySelector('#current').hidden = true;
  dom.window.document.querySelector('#old').hidden = false;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dom.window.document.querySelector('[data-messenger-view-story]').dataset.storyUrl, 'https://www.instagram.com/stories/old/');
  assert.equal(dom.window.document.querySelectorAll('[data-messenger-view-story]').length, 1);
});
