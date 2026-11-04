const { externalDestination } = require('./policy');
const { classifyDesktopNavigation, isInstagramHome, attachmentDestination } = require('./desktop-policy');
const { messageMedia } = require('./attachment-viewer');
const { sharedMessageCard } = require('./live-attachment');

function handleLinkActivation(event, window, openExternal, unsupportedAuth = () => {}, navigateInternal = () => {}, openMedia = () => {}, openNative = () => {}) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const anchor = element?.closest('a[href]');
  const source = classifyDesktopNavigation(window.location.href);
  if (window.document.documentElement.hasAttribute('data-messenger-live')) return;
  const card = source === 'messaging' && /^\/direct\/t\/[^/]+\/?$/.test(window.location.pathname) && sharedMessageCard(element);
  if (card) {
    if (event.isTrusted) openNative(card);
    else { event.preventDefault(); event.stopImmediatePropagation(); }
    return;
  }
  const media = source === 'messaging' && messageMedia(element);
  if (media) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isTrusted) openMedia(media);
    return;
  }
  const control = element?.closest('button, [role="button"], a[href], [aria-label], [title]');
  const labels = [control?.getAttribute('aria-label'), control?.getAttribute('title'),
    control?.querySelector('svg[aria-label]')?.getAttribute('aria-label')];
  const back = source === 'messaging' && control
    && !control.closest('dialog, [role="dialog"], [aria-modal="true"], article, [role="article"], [role="log"], [role="row"], [role="listitem"], [contenteditable="true"]')
    && labels.some(label => /^(back|go back|voltar|atrás)$/i.test(label || ''));
  const inMessages = source === 'messaging' || source === 'stories';
  const classification = anchor ? classifyDesktopNavigation(anchor.href) : null;
  const attachment = source === 'messaging' && /^\/direct\/t\/[^/]+\/?$/.test(window.location.pathname)
    && anchor?.closest('article, [role="article"], [role="log"], [role="row"], [role="listitem"]')
    && !anchor.closest('nav, header, [role="navigation"], [role="banner"]')
    && attachmentDestination(anchor.href);
  if (attachment) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isTrusted) navigateInternal({ type: 'attachment', url: attachment });
    return;
  }
  if (inMessages && (back || (anchor && isInstagramHome(anchor.href)) || classification === 'stories')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isTrusted) {
      navigateInternal(classification === 'stories' && !back
        ? { type: 'story', url: anchor.href } : { type: 'messages' });
    }
    return;
  }
  if (!anchor) return;
  if (classification === 'messaging' || classification === 'auth') return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.isTrusted) return;
  if (source === 'auth') { unsupportedAuth(); return; }
  if (!inMessages) return;
  const destination = externalDestination(anchor.href);
  if (destination) openExternal(destination);
}

function installInteractions(window, openExternal, unsupportedAuth, navigateInternal, openMedia, openNative) {
  const handler = event => handleLinkActivation(event, window, openExternal, unsupportedAuth, navigateInternal, openMedia, openNative);
  window.addEventListener('click', handler, true);
  window.addEventListener('auxclick', handler, true);
  return () => {
    window.removeEventListener('click', handler, true);
    window.removeEventListener('auxclick', handler, true);
  };
}

module.exports = { handleLinkActivation, installInteractions };
