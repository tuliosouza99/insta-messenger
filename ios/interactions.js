const { classifyNavigation } = require('../src/policy');

function handleLinkActivation(event, window) {
  const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const anchor = element?.closest('a[href]');
  if (!anchor) return;
  const route = classifyNavigation(anchor.href);
  if (route === 'messaging' || route === 'auth') return;
  const source = classifyNavigation(window.location.href);
  // Leave real, safe HTTPS anchors to WKNavigationDelegate. During auth, the
  // native policy rejects cross-site login and presents recovery instructions.
  // Never let javascript: execute or synthetic clicks launch another app.
  if (route === 'blocked' || !event.isTrusted || !['messaging', 'auth'].includes(source)
      || (source === 'messaging' && anchor.closest('[data-messenger-hidden], nav, [role="navigation"]'))) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
module.exports = { handleLinkActivation };
