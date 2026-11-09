const { classifyNavigation } = require('./policy');

const ACTIVITY_LABEL = /^(notifications|notificações|notificaciones)(?:\s+\d+\+?)?$/i;

function notificationControl(document, { requireNavigation = true } = {}) {
  for (const control of document.querySelectorAll('a[href], button, [role="button"], [role="link"]')) {
    if ((requireNavigation && !control.closest('nav, [role="navigation"], [data-messenger-navigation], [data-messenger-hidden]'))
      || control.closest('main, [role="main"], article, [role="article"], [role="row"], [role="log"], [role="listitem"]')) continue;
    const labels = [control.getAttribute('aria-label'), control.getAttribute('title'),
      control.querySelector('svg[aria-label]')?.getAttribute('aria-label'), control.textContent.trim()];
    if (labels.some(label => ACTIVITY_LABEL.test(label || ''))) return control;
  }
  return null;
}

function activityPanel(rail, { strict = false, opener } = {}) {
  const hasBrowsingLinks = element => Array.from(element.querySelectorAll('a[href]')).some(link =>
    ['www.instagram.com', 'instagram.com'].includes(link.hostname)
      && (link.pathname === '/' || /^\/(explore|reels)(?:\/|$)/.test(link.pathname)));
  for (const heading of rail.querySelectorAll('h1, h2, h3, [role="heading"], span')) {
    if (!ACTIVITY_LABEL.test(heading.textContent.trim())
      || heading.closest('a, button, [role="button"], [role="link"], article, [role="article"], [role="log"], [role="row"]')) continue;
    let panel = heading;
    if (strict) {
      for (panel = heading.parentElement; panel && !panel.matches('body, html'); panel = panel.parentElement) {
        if (opener && panel.contains(opener)) break;
        if (panel.matches('aside, [role="dialog"], [aria-modal="true"]')) return panel;
        if (panel.querySelector('main, [role="main"], article, [role="article"], [role="feed"], nav, [role="navigation"]') || hasBrowsingLinks(panel)) break;
        const style = rail.ownerDocument.defaultView.getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();
        const width = rect.width || Number.parseFloat(style.width);
        const height = rect.height || Number.parseFloat(style.height);
        if (['fixed', 'absolute'].includes(style.position) && width >= 200 && width <= 640 && height >= 150) return panel;
      }
      continue;
    }
    // Keep the whole native panel, including lazy rows, while leaving the
    // sibling navigation hidden. Do not move React-owned nodes.
    while (panel.parentElement && panel.parentElement !== rail
      && !hasBrowsingLinks(panel.parentElement)) panel = panel.parentElement;
    if (panel !== heading) return panel;
  }
  return null;
}

function installActivityControls(window, onOpen = () => {}) {
  const { document } = window;
  let host;
  const refresh = () => {
    if (classifyNavigation(window.location.href) !== 'messaging') { host?.remove(); host = null; return; }
    const inThread = /^\/direct\/t\//.test(window.location.pathname);
    const right = inThread ? '20px' : '60px';
    const top = inThread ? '20px' : '10px';
    if (host?.isConnected) {
      if (host.style.right !== right) host.style.right = right;
      if (host.style.top !== top) host.style.top = top;
      return;
    }
    host = document.createElement('div');
    host.id = 'messenger-activity-controls';
    host.style.cssText = `position:fixed;top:${top};right:${right};z-index:2147483000;`;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host { color-scheme: light dark; }
      button { display:grid;place-items:center;width:24px;height:24px;padding:3px;color:CanvasText;background:Canvas;border:1px solid currentColor;border-radius:6px;cursor:pointer; }
      button:focus-visible { outline:2px solid Highlight;outline-offset:3px; }
      svg { width:16px;height:16px; }
    </style><button type="button" aria-label="Notifications" title="Notifications"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button>`;
    root.querySelector('button').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.isTrusted && classifyNavigation(window.location.href) === 'messaging') {
        const control = notificationControl(document);
        if (control) control.click(); else onOpen();
      }
    });
    document.body.append(host);
  };
  refresh();
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['aria-label', 'href', 'title'] });
  window.addEventListener('popstate', refresh);
  const dispose = () => {
    observer.disconnect();
    window.removeEventListener('popstate', refresh);
    host?.remove();
  };
  return { refresh, dispose };
}

module.exports = { notificationControl, activityPanel, installActivityControls };
