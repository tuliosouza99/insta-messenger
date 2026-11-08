const { installActivityViewer } = require('./activity-viewer');

// This bridge belongs to the dedicated activity WebView's isolated world.
const handler = window.webkit?.messageHandlers?.messengerActivity;
installActivityViewer(window, {
  onReady: ready => handler?.postMessage({ ready }),
  onExternal: url => handler?.postMessage({ url }),
});
