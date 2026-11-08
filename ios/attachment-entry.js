const { attachmentDestination } = require('../src/desktop-policy');
const { installLiveAttachment } = require('../src/live-attachment');

const { document } = window;
const curtain = document.createElement('style');
curtain.textContent = `
  html { background:#101114 !important; }
  html:not([data-messenger-live]) body, html:not([data-messenger-live]) body * {
    visibility:hidden !important; pointer-events:none !important;
  }
`;
(document.head || document.documentElement).append(curtain);
function showAttachment() {
  const selected = attachmentDestination(location.href);
  if (!selected) return;
  installLiveAttachment(window, {
    selected,
    onBack: () => window.webkit?.messageHandlers?.messengerAttachment?.postMessage('close'),
  });
  // The shared viewer now owns visibility and interaction.
  curtain.remove();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAttachment, { once: true });
else showAttachment();
