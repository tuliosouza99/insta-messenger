const { classifyNavigation, externalDestination } = require('./policy');

function isVisible(anchor, document) {
  if (anchor.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let element = anchor; element && element !== document.documentElement; element = element.parentElement) {
    const style = document.defaultView.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}

function headerStory(document) {
  if (!/^\/direct\/t\/[^/]+\/?$/.test(document.location.pathname)) return null;
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (!anchor.querySelector('img') || anchor.closest('[data-messenger-hidden], nav, [role="navigation"], article, [role="article"], [role="row"], [role="log"], [role="listitem"]')) continue;
    if (!isVisible(anchor, document)) continue;
    const safeUrl = externalDestination(anchor.href);
    if (!safeUrl) continue;
    const url = new URL(safeUrl);
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname) || classifyNavigation(url.href) !== 'external') continue;
    const match = /^\/([a-z0-9._]{1,30})\/?$/i.exec(url.pathname);
    if (!match || /^(accounts|about|api|direct|explore|reels|reel|p|stories|legal|privacy)$/i.test(match[1])) continue;
    const rect = anchor.getBoundingClientRect();
    if (!anchor.closest('header, [role="banner"]') && !(rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 96)) continue;
    return { anchor, url: `https://www.instagram.com/stories/${match[1]}/` };
  }
  return null;
}

function installStoryControls(window, onOpen) {
  const { document } = window;
  let button;
  const refresh = () => {
    const contact = headerStory(document);
    if (!contact) { button?.remove(); button = null; return; }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.messengerViewStory = '';
      button.textContent = 'View story';
      // Keep the control out of Instagram's React-owned header/flex layout.
      button.style.cssText = 'position:fixed;top:16px;right:56px;z-index:2147483000;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:inherit;background:Canvas;border:1px solid currentColor;border-radius:8px;padding:6px 10px;cursor:pointer;';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.isTrusted && button) onOpen(button.dataset.storyUrl);
      });
    }
    button.dataset.storyUrl = contact.url;
    if (button.parentElement !== document.body) document.body.append(button);
  };
  refresh();
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['href', 'hidden', 'inert', 'aria-hidden', 'class', 'style'] });
  window.addEventListener('popstate', refresh);
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', refresh);
    button?.remove();
  };
}

module.exports = { installStoryControls };
