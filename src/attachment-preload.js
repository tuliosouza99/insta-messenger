const { ipcRenderer, webFrame } = require('electron');
const { installLiveAttachment } = require('./live-attachment');
const { installAttachmentViewer } = require('./attachment-viewer');
const { attachmentDestination } = require('./desktop-policy');

// Hide the remote page before first paint; only our isolated media UI is shown.
void webFrame.insertCSS('html:not([data-messenger-attachment-ready]) body, html:not([data-messenger-attachment-ready]) body * { visibility:hidden !important; }', { cssOrigin: 'user' });
window.addEventListener('DOMContentLoaded', () => {
  const onBack = () => ipcRenderer.send('messenger:close-attachment');
  if (attachmentDestination(location.href)) installLiveAttachment(window, { selected: location.href, onBack });
  else installAttachmentViewer(window, location.href, onBack);
  document.documentElement.setAttribute('data-messenger-attachment-ready', '');
}, { once: true });
