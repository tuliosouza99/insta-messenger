const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { handleLinkActivation, installInteractions } = require('../src/interactions');

function setup(path = '/direct/t/123/') {
  const dom = new JSDOM('<header><a id="home" href="/"><svg aria-label="Back"><path></path></svg></a><button id="back" aria-label="Back"><svg><path></path></svg></button></header><main><a id="shared" href="/reel/123/"><span>Shared Reel</span></a><a id="chat" href="/direct/t/456/">Friend</a><a id="story" target="_blank" href="/stories/friend/123/">Story</a><a id="unsafe" href="javascript:alert(1)">Bad</a></main>', { url: `https://www.instagram.com${path}` });
  const opened = [];
  const unsupported = [];
  const internal = [];
  const activate = (selector, extra = {}) => {
    const event = {
      type: 'click', button: 0, isTrusted: true,
      target: dom.window.document.querySelector(selector),
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() {}, ...extra,
    };
    handleLinkActivation(event, dom.window, url => opened.push(url), () => unsupported.push(true), action => internal.push(action));
    return event;
  };
  return { dom, opened, unsupported, internal, activate };
}

test('a deliberate shared Reel activation opens the browser instead of replacing chat', () => {
  const { dom, opened, activate } = setup();
  const event = activate('#shared span');
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(opened, ['https://www.instagram.com/reel/123/']);
  dom.window.close();
});

test('synthetic page clicks cannot open other applications', () => {
  const { dom, opened, activate } = setup();
  const event = activate('#shared', { isTrusted: false });
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(opened, []);
  dom.window.close();
});

test('keyboard and middle-click activation use the same checked path', () => {
  const { dom, opened, activate } = setup();
  activate('#shared', { detail: 0 });
  activate('#shared', { type: 'auxclick', button: 1 });
  activate('#shared', { type: 'auxclick', button: 2 });
  assert.equal(opened.length, 2);
  dom.window.close();
});

test('normal thread links remain inside Instagram', () => {
  const { dom, opened, activate } = setup();
  assert.equal(activate('#chat').defaultPrevented, false);
  assert.deepEqual(opened, []);
  dom.window.close();
});

test('unsafe links never execute even following a real click', () => {
  const { dom, opened, activate } = setup();
  assert.equal(activate('#unsafe').defaultPrevented, true);
  assert.deepEqual(opened, []);
  dom.window.close();
});

test('auth links cannot launch an external sign-in browser', () => {
  const { dom, opened, unsupported, activate } = setup('/accounts/login/');
  dom.window.document.querySelector('#shared').href = 'https://www.facebook.com/login/';
  assert.equal(activate('#shared').defaultPrevented, true);
  assert.deepEqual(opened, []);
  assert.deepEqual(unsupported, [true]);
  activate('#shared', { isTrusted: false });
  assert.equal(unsupported.length, 1);
  dom.window.close();
});

test('installed handlers do not expose a bridge to website JavaScript', () => {
  const { dom, opened } = setup();
  const stop = installInteractions(dom.window, url => opened.push(url));
  dom.window.document.querySelector('#shared').click();
  assert.deepEqual(opened, []);
  assert.equal(dom.window.require, undefined);
  assert.equal(dom.window.messenger, undefined);
  stop();
  dom.window.close();
});

test('the nested back arrow in an Instagram home link returns to the inbox', () => {
  const { dom, opened, internal, activate } = setup();
  assert.equal(activate('#home path').defaultPrevented, true);
  assert.deepEqual(opened, []);
  assert.deepEqual(internal, [{ type: 'messages' }]);
  dom.window.close();
});

test('conversation Back buttons return to messages but synthetic activations do nothing', () => {
  const { dom, internal, activate } = setup();
  assert.equal(activate('#back path').defaultPrevented, true);
  activate('#back', { isTrusted: false });
  activate('#home', { isTrusted: false });
  assert.deepEqual(internal, [{ type: 'messages' }]);
  dom.window.close();
});

test('trusted story links stay in the app even when marked target blank', () => {
  const { dom, opened, internal, activate } = setup();
  assert.equal(activate('#story', { detail: 0 }).defaultPrevented, true);
  assert.deepEqual(internal, [{ type: 'story', url: 'https://www.instagram.com/stories/friend/123/' }]);
  assert.deepEqual(opened, []);
  activate('#story', { isTrusted: false });
  assert.equal(internal.length, 1);
  dom.window.close();
});

test('story home returns to the saved messaging context without opening a browser', () => {
  const { dom, opened, internal, activate } = setup('/stories/friend/123/');
  activate('#home');
  assert.deepEqual(opened, []);
  assert.deepEqual(internal, [{ type: 'messages' }]);
  dom.window.close();
});

test('does not hijack message-content Back controls or sign-in back buttons', () => {
  const { dom, internal, activate } = setup();
  dom.window.document.querySelector('main').innerHTML += '<article><button id="message-back" aria-label="Back">Back</button></article>';
  assert.equal(activate('#message-back').defaultPrevented, false);
  dom.window.history.pushState({}, '', '/accounts/login/');
  assert.equal(activate('#back').defaultPrevented, false);
  assert.deepEqual(internal, []);
  dom.window.close();
});

test('does not hijack a dialog Back button inside the messaging page', () => {
  const { dom, internal, activate } = setup();
  dom.window.document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><button id="dialog-back" aria-label="Back">Back</button></div>');
  assert.equal(activate('#dialog-back').defaultPrevented, false);
  assert.deepEqual(internal, []);
  dom.window.close();
});
