const { ipcRenderer, contextBridge } = require('electron');
const { applyFocus, watchFocus } = require('./focus');
const { installInteractions } = require('./interactions');
const { classifyDesktopNavigation } = require('./desktop-policy');
const { watchUnread } = require('./unread');
const { installStoryControls } = require('./story-controls');
const { installActivityControls } = require('./activity-controls');
const { installAttachmentViewer } = require('./attachment-viewer');
const { installLiveAttachment } = require('./live-attachment');

if (location.protocol === 'app:' && location.host === 'ui' && location.pathname === '/error.html') {
  contextBridge.exposeInMainWorld('messenger', Object.freeze({
    recover: action => {
      if (action === 'retry' || action === 'inbox') ipcRenderer.send('messenger:recover', action);
    },
  }));
} else if (['messaging', 'auth', 'stories'].includes(classifyDesktopNavigation(location.href))) {
  let closeMedia;
  let activityControls;
  const closeAttachment = () => { closeMedia?.({ close: true }); closeMedia = null; };
  // This isolated-world bridge is deliberately inaccessible to Instagram's scripts.
  installInteractions(window, url => ipcRenderer.send('messenger:external', url),
    () => ipcRenderer.send('messenger:auth-blocked'),
    action => ipcRenderer.send('messenger:navigate', action),
    media => {
      closeAttachment();
      closeMedia = installAttachmentViewer(window, null, closeAttachment, media);
    },
    opener => {
      closeAttachment();
      closeMedia = installLiveAttachment(window, { opener, onBack: closeAttachment });
    });
  ipcRenderer.on('messenger:route-changed', () => { closeAttachment(); applyFocus(document); activityControls?.refresh(); });
  window.addEventListener('DOMContentLoaded', () => {
    watchFocus(window);
    activityControls = installActivityControls(window, () => ipcRenderer.send('messenger:navigate', { type: 'activity' }));
    installStoryControls(window, url => ipcRenderer.send('messenger:navigate', { type: 'story', url }));
    watchUnread(window, count => ipcRenderer.send('messenger:unread', count));
  }, { once: true });
}
