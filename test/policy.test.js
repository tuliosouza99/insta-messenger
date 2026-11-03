const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyNavigation, externalDestination, INBOX_URL } = require('../src/policy');

test('starts at the real Instagram inbox', () => {
  assert.equal(INBOX_URL, 'https://www.instagram.com/direct/inbox/');
});

const allowed = {
  messaging: ['/direct/', '/direct/inbox/', '/direct/t/123456/', '/direct/new/', '/direct/inbox/?theme=dark'],
  auth: ['/accounts/login/', '/accounts/login/two_factor/', '/accounts/password/reset/', '/accounts/onetap/',
    '/accounts/signup/', '/challenge/123/', '/checkpoint/', '/consent/', '/privacy/consent/', '/auth_platform/'],
  external: ['/', '/explore/', '/reels/', '/reel/xyz/', '/p/xyz/', '/some.person/', '/stories/someone/1/'],
};
for (const [expected, paths] of Object.entries(allowed)) {
  for (const path of paths) {
    test(`${expected}: ${path}`, () => assert.equal(classifyNavigation(`https://www.instagram.com${path}`), expected));
  }
}

test('supports the exact bare Instagram hostname', () => {
  assert.equal(classifyNavigation('https://instagram.com/direct/inbox/'), 'messaging');
});

for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://www.instagram.com/direct/inbox/',
  'https://instagram.com.evil.test/direct/inbox/', 'https://evilinstagram.com/direct/inbox/',
  'https://user:password@www.instagram.com/direct/inbox/', 'https://www.instagram.com:444/direct/inbox/',
  'https://www.instagram.com/direct%2finbox/', 'https://www.instagram.com/direct/../explore/',
  'https://www.instagram.com/accounts/delete/', 'https://www.instagram.com/accounts/edit/',
  'https://www.instagram.com/directly/', 'https://www.instagram.com/api/v1/direct/', '', 'nonsense']) {
  test(`never grants messaging/auth access: ${url}`, () => {
    assert.ok(!['messaging', 'auth'].includes(classifyNavigation(url)));
  });
}

test('permits validated public HTTPS links only for explicit activation', () => {
  assert.equal(externalDestination('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(externalDestination('https://www.instagram.com/p/example/'), 'https://www.instagram.com/p/example/');
  assert.equal(classifyNavigation('https://example.com'), 'external');
});

test('unwraps Instagram link shims without opening the redirector itself', () => {
  assert.equal(externalDestination('https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fhello&e=123'), 'https://example.com/hello');
  assert.equal(externalDestination('https://l.instagram.com/?u=javascript%3Aalert(1)'), null);
  assert.equal(externalDestination('https://l.instagram.com/'), null);
});

for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'mailto:a@example.com',
  'https://user@evil.test/', 'http://example.com/', 'https://example.com:9000/', 'https://localhost/',
  'https://127.0.0.1/', 'https://127.1/', 'https://10.0.0.1/', 'https://192.168.1.1/', 'https://172.16.0.1/',
  'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[fc00::1]/', 'https://router.local/',
  'https://intranet/', 'https://169.254.169.254/', 'https://0.0.0.0/', 'https://l.instagram.com/?u=https%3A%2F%2Flocalhost']) {
  test(`rejects unsafe external destination: ${url}`, () => assert.equal(externalDestination(url), null));
}
