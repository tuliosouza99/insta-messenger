const { classifyNavigation } = require('./policy');

function instagramPath(anchor) {
  try {
    const url = new URL(anchor.href);
    if (url.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(url.hostname)) return url.pathname;
  } catch { /* Unknown links are left alone. */ }
  return '';
}

function hasMessagingContent(element) {
  return element.matches('body, html, main, [role="main"]')
    || element.querySelector('main, [role="main"], textarea, [contenteditable="true"], input[type="file"], a[href*="/direct/t/"]');
}

function isNavigationRegion(element, document) {
  if (element.closest('article, [role="article"], [role="log"], [role="row"], [role="listitem"]')) return false;
  if (element.matches('nav, [role="navigation"]')) return true;
  // Instagram also uses divs for its fixed left rail. Link text alone is
  // ambiguous: a received message may contain exactly the same destinations.
  const style = document.defaultView.getComputedStyle(element);
  if (style.position !== 'fixed') return false;
  const rect = element.getBoundingClientRect();
  const width = rect.width || Number.parseFloat(style.width);
  const left = rect.width ? rect.left : Number.parseFloat(style.left);
  const tall = rect.height >= document.defaultView.innerHeight * 0.6
    || style.height === '100vh' || (style.top === '0px' && style.bottom === '0px');
  return left === 0 && width > 0 && width <= 300 && tall;
}

function applyFocus(document) {
  const previouslyHidden = document.querySelectorAll('[data-messenger-hidden]');
  if (classifyNavigation(document.location.href) !== 'messaging') {
    for (const element of previouslyHidden) element.removeAttribute('data-messenger-hidden');
    return;
  }
  if (!document.querySelector('style[data-messenger-style]')) {
    const style = document.createElement('style');
    style.dataset.messengerStyle = '';
    style.textContent = '[data-messenger-hidden] { display: none !important; }';
    (document.head || document.documentElement).append(style);
  }

  const links = Array.from(document.querySelectorAll('a[href]'));
  const hidden = new Set();
  // A global rail has Home, another browsing destination, and Messages.
  // Never infer it from localized labels or a shared post inside a chat.
  const homes = links.filter(anchor => instagramPath(anchor) === '/' && !anchor.closest('main, [role="main"]'));
  for (const home of homes) {
    let candidate = home.parentElement;
    while (candidate && !hasMessagingContent(candidate)) {
      const paths = Array.from(candidate.querySelectorAll('a[href]'), instagramPath);
      if (isNavigationRegion(candidate, document)
        && paths.some(path => /^\/(explore|reels)(?:\/|$)/.test(path))
        && paths.some(path => /^\/direct(?:\/|$)/.test(path))) {
        hidden.add(candidate);
        if (!candidate.hasAttribute('data-messenger-hidden')) candidate.setAttribute('data-messenger-hidden', '');
        break;
      }
      candidate = candidate.parentElement;
    }
  }
  for (const element of previouslyHidden) {
    if (!hidden.has(element)) element.removeAttribute('data-messenger-hidden');
  }
}

function watchFocus(window) {
  const { document } = window;
  applyFocus(document);
  let pending = false;
  const observer = new window.MutationObserver(() => {
    if (pending) return;
    pending = true;
    window.queueMicrotask(() => {
      pending = false;
      applyFocus(document);
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  const update = () => applyFocus(document);
  window.addEventListener('popstate', update);
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', update);
  };
}

module.exports = { applyFocus, watchFocus };
