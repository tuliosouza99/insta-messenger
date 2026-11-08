const { classifyNavigation } = require('../src/policy');
const { attachmentDestination } = require('../src/desktop-policy');
const { handleLinkActivation: handleConversationActivation } = require('../src/interactions');

function handleLinkActivation(event, window, openExternal = () => {}, {
  onInbox = () => {}, onAttachment = () => {}, onMedia = () => {}, onLiveAttachment = () => {},
} = {}) {
  const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const anchor = element?.closest('a[href]');
  const source = classifyNavigation(window.location.href);

  if (source === 'messaging') {
    if (element?.closest('[data-messenger-hidden]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    handleConversationActivation(event, window, url => {
      // Mobile can render a shared Reel without the desktop's message roles.
      const reel = attachmentDestination(url);
      if (reel && /^\/direct\/t\/[^/]+\/?$/.test(window.location.pathname)
          && /^\/(reel|tv)\//.test(new URL(reel).pathname)) onAttachment(reel);
      else openExternal(url);
    }, undefined, action => {
      if (action.type === 'messages') onInbox();
      else if (action.type === 'attachment') onAttachment(action.url);
      else if (action.type === 'story') openExternal(action.url);
    }, onMedia, card => {
      const permalink = [...card.querySelectorAll('a[href]')]
        .map(link => attachmentDestination(link.href)).find(Boolean);
      if (permalink) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onAttachment(permalink);
      } else {
        onLiveAttachment(card);
      }
    });
    return;
  }

  if (!anchor) return;
  const route = classifyNavigation(anchor.href);
  if (route === 'messaging' || route === 'auth') return;
  // Let a real sign-in link reach WebKit so its delegate can explain rejection.
  if (!(source === 'auth' && route === 'external' && event.isTrusted)) event.preventDefault();
  event.stopImmediatePropagation();
}

module.exports = { handleLinkActivation };
