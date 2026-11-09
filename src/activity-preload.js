const { ipcRenderer, webFrame } = require('electron');
const { installActivityViewer } = require('./activity-viewer');

void webFrame.insertCSS('html:not([data-messenger-activity-ready]) body, html:not([data-messenger-activity-ready]) body * { visibility:hidden !important; }', { cssOrigin: 'user' });
window.addEventListener('DOMContentLoaded', () => {
  installActivityViewer(window, {
    onBack: () => ipcRenderer.send('messenger:close-activity'),
    onExternal: url => ipcRenderer.send('messenger:activity-external', url),
    unavailable: location.protocol === 'app:',
  });
  document.documentElement.setAttribute('data-messenger-activity-ready', '');
}, { once: true });
