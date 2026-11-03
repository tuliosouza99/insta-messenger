const { externalDestination } = require('./policy');
const { classifyDesktopNavigation, isInstagramHome } = require('./desktop-policy');

function handleLinkActivation(event, window, openExternal, unsupportedAuth = () => {}, navigateInternal = () => {}) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const anchor = element?.closest('a[href]');
  const source = classifyDesktopNavigation(window.location.href);
  const control = element?.closest('button, [role="button"], a[href], [aria-label], [title]');
  const labels = [control?.getAttribute('aria-label'), control?.getAttribute('title'),
    control?.querySelector('svg[aria-label]')?.getAttribute('aria-label')];
  const back = source === 'messaging' && control
    && !control.closest('dialog, [role="dialog"], [aria-modal="true"], article, [role="article"], [role="log"], [role="row"], [role="listitem"], [contenteditable="true"]')
    && labels.some(label => /^(back|go back|voltar|atrás)$/i.test(label || ''));
  const inMessages = source === 'messaging' || source === 'stories';
  const classification = anchor ? classifyDesktopNavigation(anchor.href) : null;
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

function installInteractions(window, openExternal, unsupportedAuth, navigateInternal) {
  const handler = event => handleLinkActivation(event, window, openExternal, unsupportedAuth, navigateInternal);
  window.addEventListener('click', handler, true);
  window.addEventListener('auxclick', handler, true);
  return () => {
    window.removeEventListener('click', handler, true);
    window.removeEventListener('auxclick', handler, true);
  };
}

module.exports = { handleLinkActivation, installInteractions };
