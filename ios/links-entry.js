const { handleLinkActivation } = require('./interactions');

// This script runs in a named WKContentWorld. Instagram's page scripts
// cannot address its message handler or replace its event listener.
const handler = window.webkit?.messageHandlers?.messengerExternal;
window.addEventListener('click', event => {
  handleLinkActivation(event, window, url => handler?.postMessage(url));
}, true);
