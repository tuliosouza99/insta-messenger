const { classifyNavigation } = require('../src/policy');
const { applyFocus } = require('../src/focus');
const { handleLinkActivation } = require('./interactions');

function path(anchor) {
  try {
    const url = new URL(anchor.href);
    return url.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(url.hostname) ? url.pathname : '';
  } catch { return ''; }
}
function applyMobileFocus(document) {
  if (classifyNavigation(document.location.href) !== 'messaging') return;
  for (const home of document.querySelectorAll('a[href]')) {
    if (path(home) !== '/' || home.closest('article, [role="article"], [role="log"], [role="row"], [role="listitem"]')) continue;
    let candidate = home.parentElement;
    while (candidate && !candidate.matches('html, body, main, [role="main"]')) {
      if (candidate.querySelector('main, [role="main"], textarea, [contenteditable="true"], input[type="file"], a[href*="/direct/t/"]')) break;
      const style = document.defaultView.getComputedStyle(candidate);
      const isGlobalRegion = candidate.matches('nav, [role="navigation"]')
        || (style.position === 'fixed' && style.bottom === '0px');
      const paths = [...candidate.querySelectorAll('a[href]')].map(path);
      const hasBrowsing = paths.some(value => /^\/(explore|reels)(\/|$)/.test(value));
      const hasMessages = paths.some(value => /^\/direct(\/|$)/.test(value));
      const mobileBrowseBar = paths.some(value => /^\/explore(\/|$)/.test(value))
        && paths.some(value => /^\/reels(\/|$)/.test(value));
      if (isGlobalRegion && hasBrowsing && (hasMessages || mobileBrowseBar)) {
        candidate.setAttribute('data-messenger-hidden', '');
        break;
      }
      candidate = candidate.parentElement;
    }
  }
}
function start(window) {
  if (!['messaging', 'auth'].includes(classifyNavigation(window.location.href))) return;
  const document = window.document;
  const refresh = () => {
    if (document.documentElement) { applyFocus(document); applyMobileFocus(document); }
  };
  const install = () => {
    const observer = new window.MutationObserver(refresh);
    observer.observe(window.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    refresh();
  };
  if (window.document.documentElement) install();
  else window.document.addEventListener('DOMContentLoaded', install, { once: true });
  for (const method of ['pushState', 'replaceState']) {
    const original = window.history[method];
    window.history[method] = function (state, title, url) {
      if (url != null) {
        let destination;
        try { destination = new URL(url, window.location.href); } catch { return; }
        if (!['messaging', 'auth'].includes(classifyNavigation(destination.href))) return;
      }
      const result = original.apply(this, arguments);
      refresh();
      return result;
    };
  }
  window.addEventListener('popstate', () => {
    if (!['messaging', 'auth'].includes(classifyNavigation(window.location.href))) {
      // Native URL observation independently enforces this boundary too.
      window.location.replace('https://www.instagram.com/direct/inbox/');
    } else refresh();
  });
  window.addEventListener('click', event => handleLinkActivation(event, window), true);
}
start(window);
