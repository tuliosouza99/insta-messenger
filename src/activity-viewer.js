const { notificationControl, activityPanel } = require('./activity-controls');

function installActivityViewer(window, { onBack, onExternal, unavailable = false }) {
  const { document } = window;
  let attempted = false, attempts = 0, stage, delegated;
  const marked = new Set();
  const mark = (element, name) => { if (!element.hasAttribute(name)) element.setAttribute(name, ''); marked.add(element); };
  const host = document.createElement('div');
  host.id = 'messenger-activity-viewer';
  host.setAttribute('data-messenger-activity-toolbar', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { color-scheme:light dark;font:15px -apple-system,BlinkMacSystemFont,sans-serif;color:CanvasText; }
    header { display:flex;align-items:center;gap:20px;padding:14px 20px;background:Canvas;border-bottom:1px solid GrayText; }
    button { font:inherit;color:CanvasText;background:Canvas;border:1px solid GrayText;border-radius:8px;padding:8px 12px;cursor:pointer; }
    button:focus-visible { outline:2px solid Highlight;outline-offset:3px; }
    h1 { margin:0;font-size:18px; } p { padding:24px; }
  </style><header><button type="button">Back to messages</button><h1>Notifications</h1></header><p role="status">Loading Instagram activity…</p>`;
  const stylesheet = document.createElement('style');
  stylesheet.textContent = `
    html { background:Canvas !important;overflow:hidden !important;color-scheme:light dark; }
    body * { visibility:hidden !important;pointer-events:none !important; }
    [data-messenger-activity-toolbar] { display:block !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;background:Canvas; }
    [data-messenger-activity-toolbar], [data-messenger-activity-stage], [data-messenger-activity-stage] * { visibility:visible !important;pointer-events:auto !important; }
    [data-messenger-activity-path] { display:contents !important;transform:none !important;filter:none !important;perspective:none !important;contain:none !important; }
    [data-messenger-activity-stage] { display:block !important;position:fixed !important;inset:64px 0 0 !important;width:auto !important;max-width:none !important;height:auto !important;margin:0 !important;overflow:auto !important;z-index:2147483647 !important; }
  `;
  document.head.append(stylesheet);
  document.body.append(host);
  const status = root.querySelector('p');
  function refresh() {
    if (unavailable) { status.textContent = 'Instagram activity could not be loaded. Go back to messages and try again.'; return; }
    const control = notificationControl(document, { requireNavigation: false });
    let panel = activityPanel(document.documentElement, { strict: true, opener: control });
    if (!panel && !attempted && attempts < 3) {
      if (control) {
        attempted = true; attempts++;
        delegated = control;
        try { control.click(); } finally { delegated = null; }
      }
      panel = activityPanel(document.documentElement, { strict: true, opener: control });
    }
    if (!panel) return;
    stage = panel;
    mark(stage, 'data-messenger-activity-stage');
    for (let parent = stage.parentElement; parent && parent !== document.body; parent = parent.parentElement) mark(parent, 'data-messenger-activity-path');
    // Keep the toolbar above the native panel without covering its content.
    host.style.cssText = 'height:64px;bottom:auto!important;background:Canvas;';
    status.hidden = true;
  }
  function guard(event) {
    if (delegated && event.composedPath().includes(delegated)) return;
    if (event.type === 'keydown' && event.key === 'Escape' && event.isTrusted) {
      event.preventDefault(); event.stopImmediatePropagation(); onBack(); return;
    }
    if (event.composedPath().includes(host)) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (stage?.contains(target)) {
      const anchor = target.closest('a[href]');
      if (!anchor || !['click', 'auxclick'].includes(event.type)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.isTrusted && (event.type === 'click' || event.button === 1)) onExternal(anchor.href);
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
  }
  const events = ['click', 'auxclick', 'keydown', 'keyup', 'wheel', 'touchmove', 'contextmenu', 'submit'];
  for (const type of events) {
    window.addEventListener(type, guard, { capture: true, passive: false });
    root.addEventListener(type, event => event.stopPropagation());
  }
  root.querySelector('button').addEventListener('click', event => { if (event.isTrusted) onBack(); });
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'hidden'] });
  refresh();
  root.querySelector('button').focus();
  const retry = window.setInterval(() => {
    if (!stage && attempts < 3) { attempted = false; refresh(); }
  }, 3000);
  const timeout = window.setTimeout(() => {
    if (!stage) status.textContent = 'Instagram’s Notifications panel is unavailable. Go back to messages and try again.';
  }, 15000);
  return () => {
    observer.disconnect(); window.clearTimeout(timeout); window.clearInterval(retry);
    for (const type of events) window.removeEventListener(type, guard, true);
    for (const element of marked) {
      element.removeAttribute('data-messenger-activity-stage');
      element.removeAttribute('data-messenger-activity-path');
    }
    host.remove(); stylesheet.remove();
  };
}

module.exports = { installActivityViewer };
