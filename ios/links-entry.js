const { handleLinkActivation } = require('./interactions');
const { installAttachmentViewer } = require('../src/attachment-viewer');
const { installLiveAttachment } = require('../src/live-attachment');

// This script runs in a named WKContentWorld inaccessible to the website.
const handler = window.webkit?.messageHandlers?.messengerExternal;
let stopViewer;
function closeViewer(close = true) {
  const stop = stopViewer;
  stopViewer = null;
  stop?.({ close });
}
window.addEventListener('messenger:route-changed', () => closeViewer(false));
window.addEventListener('popstate', () => closeViewer(false));
window.addEventListener('messenger:attachment-handoff', () => closeViewer(false));
window.addEventListener('click', event => {
  handleLinkActivation(event, window, url => handler?.postMessage(url), {
    onInbox: () => handler?.postMessage({ type: 'inbox' }),
    onAttachment: url => handler?.postMessage({ type: 'attachment', url }),
    onMedia: media => {
      closeViewer();
      stopViewer = installAttachmentViewer(window, null, closeViewer, media);
    },
    onLiveAttachment: opener => {
      closeViewer();
      handler?.postMessage({ type: 'live-attachment' });
      stopViewer = installLiveAttachment(window, { opener, onBack: closeViewer });
    },
  });
}, true);
