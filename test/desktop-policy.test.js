const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyDesktopNavigation, isInstagramHome, attachmentDestination, sameAttachment } = require('../src/desktop-policy');

test('attachment grants accept only individual Instagram posts and preserve album selection', () => {
  assert.equal(attachmentDestination('https://www.instagram.com/reel/AbC_12-/?igsh=tracking'), 'https://www.instagram.com/reel/AbC_12-/');
  assert.equal(attachmentDestination('https://instagram.com/p/ABC/?img_index=2'), 'https://www.instagram.com/p/ABC/?img_index=2');
  assert.equal(attachmentDestination('https://www.instagram.com/creator.name/p/ABC/'), 'https://www.instagram.com/p/ABC/');
  for (const url of ['https://example.com/p/ABC/', 'https://www.instagram.com/reels/',
    'https://www.instagram.com/p/ABC/more/', 'https://l.instagram.com/?u=https://www.instagram.com/p/ABC/',
    'http://www.instagram.com/p/ABC/', 'https://u:p@www.instagram.com/p/ABC/']) {
    assert.equal(attachmentDestination(url), null, url);
  }
});

test('an attachment grant cannot be used to browse to another post or profile', () => {
  assert.equal(sameAttachment('https://www.instagram.com/reel/ABC/', 'https://www.instagram.com/p/ABC/?source=direct'), true);
  for (const next of ['https://www.instagram.com/reel/DEF/', 'https://www.instagram.com/friend/', 'https://evil.test/p/ABC/']) {
    assert.equal(sameAttachment('https://www.instagram.com/reel/ABC/', next), false);
  }
});

for (const url of [
  'https://www.instagram.com/stories/friend/',
  'https://instagram.com/stories/friend.name/123456/?source=direct',
  'https://www.instagram.com/stories/highlights/123456/',
]) test(`allows the story viewer: ${url}`, () => assert.equal(classifyDesktopNavigation(url), 'stories'));

for (const url of [
  'https://www.instagram.com/stories/', 'https://www.instagram.com/stories/friend/not-an-id/',
  'https://www.instagram.com/stories/friend/123/extra', 'https://www.instagram.com/stories%2ffriend/123/',
  'https://www.instagram.com.evil.test/stories/friend/123/', 'http://www.instagram.com/stories/friend/123/',
  'https://u:p@www.instagram.com/stories/friend/123/', 'https://www.instagram.com:444/stories/friend/123/',
]) test(`does not embed unsafe or unrelated story paths: ${url}`, () => assert.notEqual(classifyDesktopNavigation(url), 'stories'));

test('retains messaging/authentication routing and restrictions on other browsing', () => {
  assert.equal(classifyDesktopNavigation('https://www.instagram.com/direct/t/1/'), 'messaging');
  assert.equal(classifyDesktopNavigation('https://www.instagram.com/accounts/login/'), 'auth');
  for (const path of ['/', '/explore/', '/reels/', '/p/post/', '/friend/']) {
    assert.equal(classifyDesktopNavigation(`https://www.instagram.com${path}`), 'external');
  }
});

test('recognizes only exact secure Instagram home links for inbox redirection', () => {
  assert.equal(isInstagramHome('https://www.instagram.com/?next=anything'), true);
  assert.equal(isInstagramHome('https://instagram.com/'), true);
  for (const url of ['https://www.instagram.com/friend/', 'https://instagram.com.evil.test/', 'javascript:alert(1)', 'http://instagram.com/', 'https://u:p@instagram.com/']) {
    assert.equal(isInstagramHome(url), false);
  }
});
