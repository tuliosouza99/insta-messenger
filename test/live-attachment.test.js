const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installLiveAttachment } = require('../src/live-attachment');

const selected = 'https://www.instagram.com/p/SELECTED/';
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('a selected carousel retains native Next and lazy slide loading while other posts stay blocked', async () => {
  const dom = new JSDOM('<main><article><a href="/p/SELECTED/">Post</a><div id="carousel"><img width="640" height="480" src="https://scontent.cdninstagram.com/one.jpg"><button aria-label="Next">Next</button></div></article><article id="recommendation"><a href="/p/OTHER/">Other</a><img width="640" height="480" src="https://scontent.cdninstagram.com/other.jpg"><button aria-label="Next">Next</button></article></main>', { url: selected });
  const document = dom.window.document;
  const original = document.querySelector('#carousel img');
  document.querySelector('#carousel button').addEventListener('click', () => { original.src = 'https://scontent.cdninstagram.com/two.jpg'; });
  const stop = installLiveAttachment(dom.window, { selected, onBack() {} });
  assert.equal(document.querySelector('[data-messenger-live-stage]').id, 'carousel');
  document.querySelector('#carousel button').click();
  await tick();
  assert.equal(original.src, 'https://scontent.cdninstagram.com/two.jpg');
  assert.equal(original.hasAttribute('data-messenger-live-allow'), true);
  assert.equal(document.querySelector('#recommendation [data-messenger-live-allow]'), null);
  stop();
  assert.equal(document.querySelector('[data-messenger-live-stage]'), null);
  dom.window.close();
});

test('button-created Reel dialogs retain the original player in its native DOM container', async () => {
  const dom = new JSDOM('<main role="log"><div role="row"><div role="button" id="opener"><a href="/creator/">Creator</a><img alt="Clip"></div></div></main>', { url: 'https://www.instagram.com/direct/t/123/' });
  const document = dom.window.document;
  const stop = installLiveAttachment(dom.window, { opener: document.querySelector('#opener'), onBack() {} });
  document.body.insertAdjacentHTML('beforeend', '<div id="modal"><button aria-label="Close">Close</button><div id="player"><video src="blob:https://www.instagram.com/stream"></video><img id="poster" width="640" height="480" src="https://scontent.cdninstagram.com/poster.jpg"></div><section id="suggested"><video src="blob:https://www.instagram.com/next"></video></section></div>');
  const video = document.querySelector('#player video');
  await tick();
  assert.equal(video.parentElement.id, 'player');
  assert.equal(video.controls, true);
  assert.equal(document.querySelector('#poster').hasAttribute('data-messenger-live-allow'), false);
  assert.equal(document.querySelector('#suggested video').hasAttribute('data-messenger-live-allow'), false);
  stop();
  assert.equal(video.controls, false);
  dom.window.close();
});

test('canonical post identity recognizes a carousel without a repeated permalink in its article', () => {
  const dom = new JSDOM('<head><link rel="canonical" href="https://www.instagram.com/p/SELECTED/"></head><body><main><article><div id="carousel"><img width="640" height="480" src="https://scontent.cdninstagram.com/one.jpg"><button aria-label="Next">Next</button></div></article></main></body>', { url: selected });
  const stop = installLiveAttachment(dom.window, { selected, onBack() {} });
  assert.equal(dom.window.document.querySelector('[data-messenger-live-stage]')?.id, 'carousel');
  stop(); dom.window.close();
});

test('the selected primary article may be outside main and contain its own likes/comment routes', () => {
  const dom = new JSDOM('<head><link rel="canonical" href="https://www.instagram.com/p/SELECTED/"></head><body><main></main><article><div id="carousel"><img width="640" height="480" src="https://scontent.cdninstagram.com/one.jpg"><button aria-label="Next">Next</button></div><a href="/p/SELECTED/liked_by/">Likes</a></article></body>', { url: selected });
  const stop = installLiveAttachment(dom.window, { selected, onBack() {} });
  assert.equal(dom.window.document.querySelector('[data-messenger-live-stage]')?.id, 'carousel');
  stop(); dom.window.close();
});

test('canonical metadata cannot authorize a different post shown as a recommendation', () => {
  const dom = new JSDOM('<head><link rel="canonical" href="https://www.instagram.com/p/SELECTED/"></head><body><main><article><a href="/p/OTHER/">Suggested post</a><img width="640" height="480" src="https://scontent.cdninstagram.com/other.jpg"></article></main></body>', { url: selected });
  const stop = installLiveAttachment(dom.window, { selected, onBack() {} });
  assert.equal(dom.window.document.querySelector('[data-messenger-live-stage]'), null);
  stop(); dom.window.close();
});

test('a late-loaded portrait and subsequent slide changes recompute the media frame', async () => {
  const dom = new JSDOM('<main><article><a href="/p/SELECTED/">Post</a><div id="carousel"><img width="640" height="640" src="https://scontent.cdninstagram.com/one.jpg"><button aria-label="Next">Next</button></div></article></main>', { url: selected });
  const document = dom.window.document;
  const stop = installLiveAttachment(dom.window, { selected, onBack() {} });
  const image = document.querySelector('img');
  const stage = document.querySelector('[data-messenger-live-stage]');
  Object.defineProperties(image, { naturalWidth: { value: 1080, configurable: true }, naturalHeight: { value: 1920, configurable: true } });
  image.dispatchEvent(new dom.window.Event('load'));
  assert.equal(Number.parseFloat(stage.style.width) / Number.parseFloat(stage.style.height), 1080 / 1920);
  Object.defineProperties(image, { naturalWidth: { value: 1920 }, naturalHeight: { value: 1080 } });
  image.src = 'https://scontent.cdninstagram.com/two.jpg';
  await tick();
  assert.equal(Number.parseFloat(stage.style.width) / Number.parseFloat(stage.style.height), 1920 / 1080);
  stop(); dom.window.close();
});

test('a mobile Reel dialog with a Back control exposes only the original player', async t => {
  const dom = new JSDOM('<main><button id="opener"><img alt="Reel"></button></main>', {
    url: 'https://www.instagram.com/direct/t/123/',
  });
  const { document } = dom.window;
  const stop = installLiveAttachment(dom.window, { opener: document.querySelector('#opener'), onBack() {} });
  t.after(() => { stop(); dom.window.close(); });
  document.body.insertAdjacentHTML('beforeend', `
    <section role="dialog">
      <a href="/" aria-label="Voltar">Back</a>
      <div id="player"><video></video></div>
      <div id="related"><video></video></div>
    </section>
  `);
  await tick();
  assert.equal(document.querySelector('[data-messenger-live-stage]')?.id, 'player');
  assert.equal(document.querySelector('#player video').controls, true);
  assert.equal(document.querySelector('#related video').hasAttribute('data-messenger-live-allow'), false);
});

test('closing a Reel while its video is loading also dismisses the site modal', t => {
  const dom = new JSDOM('<main><button id="opener"><img alt="Reel"></button><textarea>draft</textarea></main>', {
    url: 'https://www.instagram.com/direct/t/123/',
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const stop = installLiveAttachment(dom.window, { opener: document.querySelector('#opener'), onBack() {} });
  document.body.insertAdjacentHTML('beforeend', '<section id="modal" role="dialog"><a href="/" aria-label="Voltar">Back</a><p>Loading</p></section>');
  const modal = document.querySelector('#modal');
  const back = modal.querySelector('a');
  back.addEventListener('click', () => modal.remove());
  stop({ close: true });
  assert.equal(document.querySelector('#modal'), null);
  assert.equal(document.querySelector('textarea').value, 'draft');
  assert.equal(document.location.pathname, '/direct/t/123/');
});

test('a neighbouring video in the same player wrapper stays hidden', t => {
  const url = 'https://www.instagram.com/reel/SELECTED/';
  const dom = new JSDOM(`
    <main><article><a href="/reel/SELECTED/">Selected</a>
      <div id="player"><video id="chosen"></video><video id="related"></video></div>
    </article></main>`, { url });
  const stop = installLiveAttachment(dom.window, { selected: url, onBack() {} });
  t.after(() => { stop(); dom.window.close(); });
  const { document } = dom.window;
  assert.equal(document.querySelector('#chosen').hasAttribute('data-messenger-live-allow'), true);
  assert.equal(document.querySelector('#related').hasAttribute('data-messenger-live-allow'), false);
});
