const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

// These fixtures execute the actual resource injected into WebKit, including
// the shared desktop focus policy. No stub native message bridge is installed.
const resource = path.resolve(__dirname, '../ios/InstagramMessenger/Resources/focus.js');
function fixture(html, route = '/direct/inbox/') {
  const dom = new JSDOM(html, { url: `https://www.instagram.com${route}`, runScripts: 'outside-only' });
  vm.runInContext(fs.readFileSync(resource, 'utf8'), dom.getInternalVMContext());
  return dom;
}
const links = '<a href="/">Home</a><a href="/explore/">Explore</a><a href="/direct/inbox/">Inbox</a>';

test('iPhone resource suppresses mobile global navigation and preserves conversation media', () => {
  const dom = fixture(`<div id="mobile" style="position:fixed;bottom:0;width:100%">${links}</div><main><article>${links}<video></video><textarea></textarea><input type="file"></article></main>`);
  assert.equal(dom.window.document.querySelector('#mobile').hasAttribute('data-messenger-hidden'), true);
  assert.equal(dom.window.document.querySelector('article').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});
test('mobile bottom navigation is suppressed even when Messages lives in a separate header', () => {
  const dom = fixture('<div id="footer" style="position:fixed;bottom:0;width:100%"><a href="/">Home</a><a href="/explore/">Search</a><a href="/reels/">Reels</a><a href="/person/">Profile</a></div><main><a href="/direct/t/1/">Chat</a><textarea></textarea></main>');
  assert.equal(dom.window.document.querySelector('#footer').hasAttribute('data-messenger-hidden'), true);
  assert.equal(dom.window.document.querySelector('textarea').closest('[data-messenger-hidden]'), null);
  dom.window.close();
});
test('mobile bottom bar stays hidden after queued hydration and conversation mutations', async () => {
  const dom = fixture('<div id="footer" style="position:fixed;bottom:0;width:100%"><a href="/">Home</a><a href="/explore/">Search</a><a href="/reels/">Reels</a></div><main><article id="chat"><textarea></textarea></article></main>');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(dom.window.document.querySelector('#footer').hasAttribute('data-messenger-hidden'), true, 'initial hydration observer must retain mobile filtering');
  dom.window.document.querySelector('#chat').insertAdjacentHTML('beforeend', '<div>Incoming message</div>');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(dom.window.document.querySelector('#footer').hasAttribute('data-messenger-hidden'), true, 'new message mutation must retain mobile filtering');
  dom.window.close();
});
test('iPhone focus leaves login, challenges and ambiguous containers intact', () => {
  for (const route of ['/accounts/login/', '/challenge/123/', '/direct/inbox/']) {
    const dom = fixture(`<div id="mixed">${links}<textarea></textarea></div>`, route);
    assert.equal(dom.window.document.querySelector('#mixed').hasAttribute('data-messenger-hidden'), false);
    dom.window.close();
  }
});
test('SPA guards stop feed and Explore routes but preserve thread and authentication transitions', () => {
  const dom = fixture('<main><textarea></textarea></main>');
  const { history, location } = dom.window;
  history.pushState({ a: 1 }, '', '/direct/t/123/');
  assert.equal(location.pathname, '/direct/t/123/');
  history.pushState({}, '', '/explore/');
  assert.equal(location.pathname, '/direct/t/123/');
  history.replaceState({}, '', '/');
  assert.equal(location.pathname, '/direct/t/123/');
  history.pushState({}, '', '/accounts/login/');
  assert.equal(location.pathname, '/accounts/login/');
  dom.window.close();
});
test('synthetic clicks never launch external links while ordinary internal chat links remain usable', () => {
  const dom = fixture('<a id="external" href="https://example.com/a">Shared</a><a id="thread" href="/direct/t/1/">Thread</a>');
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  assert.equal(dom.window.document.querySelector('#external').dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);
  const internal = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  assert.equal(dom.window.document.querySelector('#thread').dispatchEvent(internal), true);
  dom.window.close();
});
test('dynamic mobile nav is filtered and becomes visible after auth transition', async () => {
  const dom = fixture('<main>Conversation</main>');
  dom.window.document.body.insertAdjacentHTML('afterbegin', `<nav id="mobile">${links}</nav>`);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(dom.window.document.querySelector('#mobile').hasAttribute('data-messenger-hidden'), true);
  dom.window.history.pushState({}, '', '/accounts/login/');
  assert.equal(dom.window.document.querySelector('#mobile').hasAttribute('data-messenger-hidden'), false);
  dom.window.close();
});
test('Swift Foundation policy verifies URL and native activation boundaries without an iOS SDK', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'messenger-policy-'));
  try {
    const executable = path.join(temp, 'policy-tests');
    execFileSync('swiftc', ['ios/InstagramMessenger/NavigationPolicy.swift', 'ios/Tests/NavigationPolicyTests.swift', '-o', executable], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
    assert.match(execFileSync(executable, { encoding: 'utf8' }), /all checks passed/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('Xcode project resolves its build sources/resources and native Swift sources parse', () => {
  const root = path.resolve(__dirname, '../ios');
  const projectPath = path.join(root, 'InstagramMessenger.xcodeproj/project.pbxproj');
  const project = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', projectPath], { encoding: 'utf8' }));
  const target = project.objects[project.objects[project.rootObject].targets[0]];
  const builtFiles = target.buildPhases.flatMap(id => project.objects[id].files || [])
    .map(id => project.objects[project.objects[id].fileRef].path);
  assert.ok(builtFiles.includes('Resources/focus.js'), 'injected resource must be bundled');
  const nativeFiles = builtFiles.filter(file => file.endsWith('.swift')).map(file => path.join(root, 'InstagramMessenger', file));
  assert.ok(nativeFiles.length >= 4, 'app entry, view, web session and policy are build inputs');
  for (const file of builtFiles) assert.ok(fs.existsSync(path.join(root, 'InstagramMessenger', file)), `missing build input ${file}`);
  execFileSync('xcrun', ['swiftc', '-frontend', '-parse', ...nativeFiles], { stdio: 'pipe' });
  execFileSync('plutil', ['-lint', path.join(root, 'InstagramMessenger/Info.plist'), path.join(root, 'InstagramMessenger/PrivacyInfo.xcprivacy')], { stdio: 'pipe' });
  execFileSync('xmllint', ['--noout', path.join(root, 'InstagramMessenger.xcodeproj/xcshareddata/xcschemes/InstagramMessenger.xcscheme')], { stdio: 'pipe' });
  execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/build-ios.js'), '--check'], { stdio: 'pipe' });
});

test('trusted cross-site auth anchors reach native rejection/explanation while synthetic and unsafe links stay blocked', () => {
  const { handleLinkActivation } = require('../ios/interactions');
  const dom = new JSDOM('<a id="facebook" href="https://www.facebook.com/login/">Facebook login</a><a id="unsafe" href="javascript:alert(1)">Unsafe</a>', { url: 'https://www.instagram.com/accounts/login/' });
  function activate(id, isTrusted) {
    let blocked = false;
    handleLinkActivation({ target: dom.window.document.querySelector(id), isTrusted,
      preventDefault() { blocked = true; }, stopImmediatePropagation() {} }, dom.window);
    return blocked;
  }
  assert.equal(activate('#facebook', true), false, 'native navigation delegate must receive the real unsupported auth anchor');
  assert.equal(activate('#facebook', false), true);
  assert.equal(activate('#unsafe', true), true, 'javascript: must not execute before native navigation');
  dom.window.close();
});
