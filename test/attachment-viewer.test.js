const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { selectAttachmentMedia, installAttachmentViewer, messageMedia } = require('../src/attachment-viewer');

const selected = 'https://www.instagram.com/p/SELECTED/';
const image = 'https://scontent.cdninstagram.com/selected.jpg';
function fixture(html) { return new JSDOM(html, { url: selected }); }

test('only the selected post supplies media, excluding avatars and recommended posts', () => {
  const dom = fixture(`<main><article><a href="/p/OTHER/">Suggested</a><img width="640" height="640" src="https://scontent.cdninstagram.com/other.jpg"></article>
    <article><a href="/p/SELECTED/">Post</a><img width="40" height="40" src="https://scontent.cdninstagram.com/avatar.jpg"><img width="640" height="480" src="${image}"></article></main>`);
  assert.deepEqual(selectAttachmentMedia(dom.window.document, selected), [{ tag: 'img', src: image, alt: '' }]);
  dom.window.close();
});

test('a permalink next to an avatar still selects the full post media', () => {
  const dom = fixture(`<article><header><a href="/p/SELECTED/"><img width="40" height="40" src="https://scontent.cdninstagram.com/avatar.jpg"></a></header><img width="640" height="480" src="${image}"></article>`);
  assert.deepEqual(selectAttachmentMedia(dom.window.document, selected), [{ tag: 'img', src: image, alt: '' }]);
  dom.window.close();
});

test('streamed blob videos retain their media element so MediaSource playback survives', () => {
  const dom = fixture('<main><video id="stream" src="blob:https://www.instagram.com/stream"></video></main>');
  const original = dom.window.document.querySelector('video');
  const stop = installAttachmentViewer(dom.window, null, () => {}, [{ tag: 'video', src: 'blob:https://www.instagram.com/stream', alt: '' }]);
  assert.equal(dom.window.document.querySelector('#messenger-attachment-viewer').shadowRoot.querySelector('video'), original);
  stop();
  assert.equal(dom.window.document.querySelector('main > video'), original);
  assert.equal(original.controls, false);
  assert.equal(original.muted, false);
  dom.window.close();
});

test('unrecognized pages fail closed and media cannot load arbitrary URLs', () => {
  const dom = fixture('<main><article><a href="/p/OTHER/">Suggestion</a><img width="640" height="480" src="https://scontent.cdninstagram.com/other.jpg"></article></main>');
  assert.deepEqual(selectAttachmentMedia(dom.window.document, selected), []);
  dom.window.document.querySelector('a').href = selected;
  dom.window.document.querySelector('img').src = 'https://localhost/private';
  assert.deepEqual(selectAttachmentMedia(dom.window.document, selected), []);
  dom.window.close();
});

test('Reel media is taken from its matching container, never a later Reel', () => {
  const dom = fixture('<main><section><a href="/reel/SELECTED/">Reel</a><video src="https://scontent.cdninstagram.com/reel.mp4"></video></section><section><a href="/reel/OTHER/">Next</a><video src="https://scontent.cdninstagram.com/next.mp4"></video></section></main>');
  assert.deepEqual(selectAttachmentMedia(dom.window.document, selected), [{ tag: 'video', src: 'https://scontent.cdninstagram.com/reel.mp4', alt: '' }]);
  dom.window.close();
});

test('the viewer presents media and Back without copying page controls or links', () => {
  const dom = fixture(`<article><a href="/p/SELECTED/">Post</a><img width="640" height="480" src="${image}"><button>Next Reel</button><a href="/friend/">Profile</a></article>`);
  let closed = 0;
  const stop = installAttachmentViewer(dom.window, selected, () => closed++);
  const host = dom.window.document.querySelector('#messenger-attachment-viewer');
  assert.ok(host);
  assert.equal(host.shadowRoot.querySelector('img').src, image);
  assert.equal(host.shadowRoot.querySelectorAll('a').length, 0);
  assert.equal(host.shadowRoot.querySelectorAll('button').length, 1);
  assert.equal(host.shadowRoot.querySelector('button').textContent, 'Back to message');
  host.shadowRoot.querySelector('button').click();
  assert.equal(closed, 0, 'website-generated clicks cannot invoke the private close action');
  stop();
  dom.window.close();
});

test('direct chat media is selected only from a message and excludes linked previews and avatars', () => {
  const dom = new JSDOM(`<header><img id="avatar" width="40" height="40" src="${image}"></header><main role="log"><div role="row"><img id="photo" width="640" height="480" src="${image}"><video id="video" src="https://scontent.cdninstagram.com/direct.mp4"></video><a href="/p/SELECTED/"><img id="preview" width="640" height="480" src="${image}"></a></div></main>`, { url: 'https://www.instagram.com/direct/t/123/' });
  const document = dom.window.document;
  assert.deepEqual(messageMedia(document.querySelector('#photo')), [{ tag: 'img', src: image, alt: '' }]);
  assert.deepEqual(messageMedia(document.querySelector('#video')), [{ tag: 'video', src: 'https://scontent.cdninstagram.com/direct.mp4', alt: '' }]);
  assert.equal(messageMedia(document.querySelector('#avatar')), null);
  assert.equal(messageMedia(document.querySelector('#preview')), null);
  dom.window.close();
});

test('panoramic received photos are recognized without mistaking small avatars for media', () => {
  const dom = new JSDOM(`<main role="log"><img id="panorama" width="640" height="80" src="${image}"><img id="avatar" width="40" height="40" src="${image}"></main>`, { url: 'https://www.instagram.com/direct/t/123/' });
  assert.deepEqual(messageMedia(dom.window.document.querySelector('#panorama')), [{ tag: 'img', src: image, alt: '' }]);
  assert.equal(messageMedia(dom.window.document.querySelector('#avatar')), null);
  dom.window.close();
});

test('closing a direct media overlay restores background accessibility and prior focus', () => {
  const dom = fixture('<main><button id="opener">Photo</button></main>');
  const document = dom.window.document;
  const opener = document.querySelector('#opener');
  opener.focus();
  const stop = installAttachmentViewer(dom.window, null, () => {}, [{ tag: 'img', src: image, alt: 'Received photo' }]);
  assert.equal(document.querySelector('main').hasAttribute('inert'), true);
  assert.equal(document.querySelector('#messenger-attachment-viewer').shadowRoot.querySelector('img').alt, 'Received photo');
  stop();
  assert.equal(document.querySelector('main').hasAttribute('inert'), false);
  assert.equal(document.activeElement, opener);
  dom.window.close();
});

test('late image loading can finish selection without another DOM mutation', () => {
  const dom = fixture(`<article><a href="/p/SELECTED/">Post</a><img src="${image}"></article>`);
  const stop = installAttachmentViewer(dom.window, selected, () => {});
  const imageElement = dom.window.document.querySelector('article img');
  Object.defineProperties(imageElement, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
  imageElement.dispatchEvent(new dom.window.Event('load'));
  assert.equal(dom.window.document.querySelector('#messenger-attachment-viewer').shadowRoot.querySelector('img')?.src, image);
  stop();
  dom.window.close();
});
