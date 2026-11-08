const { classifyNavigation } = require('../src/policy');

function handleLinkActivation(event, window, openExternal = () => {}) {
  const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const anchor = element?.closest('a[href]');
  if (!anchor) return;

  const route = classifyNavigation(anchor.href);
  if (route === 'messaging' || route === 'auth') return;
  const source = classifyNavigation(window.location.href);
  // A real auth link can reach the navigation delegate so it can explain an
  // unsupported sign-in step. Conversation links use the isolated handler.
  const fromAuth = source === 'auth' && route === 'external' && event.isTrusted;
  if (!fromAuth) event.preventDefault();
  event.stopImmediatePropagation();

  if (source === 'messaging' && route === 'external' && event.isTrusted
      && !anchor.closest('[data-messenger-hidden]')) {
    openExternal(anchor.href);
  }
}

module.exports = { handleLinkActivation };
