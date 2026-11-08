const { externalDestination } = require('../src/policy');

const activityLabel = /^(notifications|notificações|notificaciones|activity|atividade|actividad)(?:\s+\d+\+?)?$/i;
const controlSelector = 'a[href], button, [role="button"], [role="link"]';
const navigationSelector = 'nav, [role="navigation"]';
const panelSelector = 'aside, [role="dialog"], [aria-modal="true"]';
const mainSelector = 'main, [role="main"]';
const excluded = 'article, [role="article"], [role="feed"], [role="log"], [role="row"]';
const stageAttribute = 'data-messenger-activity-stage';
const pathAttribute = 'data-messenger-activity-path';

function activityPath(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
        && !url.username && !url.password && !url.port
        && /^\/(?:accounts\/activity\/?|notifications\/?)?$/.test(url.pathname)) return url.pathname;
  } catch { /* Unknown routes stay hidden. */ }
  return null;
}

function hasFeed(element) {
  if (element.querySelector(`article, [role="article"], [role="feed"], ${navigationSelector}`)) return true;
  const paths = [...element.querySelectorAll('a[href]')]
    .filter(link => ['instagram.com', 'www.instagram.com'].includes(link.hostname))
    .map(link => link.pathname);
  return paths.includes('/') && paths.some(path => /^\/(explore|reels)(\/|$)/.test(path));
}

function isOpen(element, window) {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  for (let node = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.opacity === '0') return false;
  }
  return true;
}

function hasActivityRows(element) {
  const activityText = /started following|follow requests?|requested to follow|liked your|mentioned you|commented on your|no (?:new )?notifications|all caught up|começou a seguir|solicitaç(?:ão|ões) (?:para|de) seguir|curtiu|mencionou|comentou|nenhuma notificação|empezó a seguir|solicitudes? de seguimiento|le gustó|mencionó|comentó|no (?:tienes|hay) notificaciones/i;
  return activityText.test(element.textContent);
}

function activityPanel(document, standalone) {
  const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"], span')].filter(heading =>
    activityLabel.test(heading.textContent.trim())
    && !heading.closest(`${controlSelector}, ${excluded}`)
    && isOpen(heading, document.defaultView));
  for (const heading of headings) {
    for (let candidate = heading.parentElement; candidate && candidate !== document.body; candidate = candidate.parentElement) {
      if (candidate.matches(navigationSelector) || hasFeed(candidate)) break;
      if (candidate.matches(panelSelector) || (standalone && candidate.matches(mainSelector) && hasActivityRows(candidate))) return candidate;
      const style = document.defaultView.getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      if (!candidate.matches(mainSelector) && ['fixed', 'absolute'].includes(style.position)
          && (rect.width || parseFloat(style.width)) >= 180
          && (rect.height || parseFloat(style.height)) >= 120) return candidate;
    }
  }
  if (standalone && headings.some(heading => heading.closest('header, [role="banner"]'))) {
    const main = document.querySelectorAll(mainSelector);
    if (main.length === 1 && !hasFeed(main[0]) && hasActivityRows(main[0])
        && isOpen(main[0], document.defaultView)) return main[0];
  }
  return null;
}

function notificationControl(document) {
  return [...document.querySelectorAll(controlSelector)].find(control => {
    if (control.closest(`${mainSelector}, ${excluded}`)) return false;
    const labels = [control.getAttribute('aria-label'), control.title, control.textContent.trim(),
      control.querySelector('[aria-label]')?.getAttribute('aria-label')];
    return (control.href && ['instagram.com', 'www.instagram.com'].includes(control.hostname)
      && /^\/(?:accounts\/activity|notifications)\/?$/.test(control.pathname))
      || labels.some(label => activityLabel.test(label || ''));
  });
}

function installActivityViewer(window, { onReady = () => {}, onExternal = () => {} } = {}) {
  const { document } = window;
  const style = document.createElement('style');
  style.textContent = `
    html { background:Canvas !important; color-scheme:light dark; overflow:hidden !important; }
    body, body * { visibility:hidden !important; pointer-events:none !important; }
    [${pathAttribute}] { transform:none !important; filter:none !important; perspective:none !important; contain:none !important; }
    [${stageAttribute}], [${stageAttribute}] * { visibility:visible !important; pointer-events:auto !important; }
    [${stageAttribute}] { position:fixed !important; inset:0 !important; width:auto !important;
      max-width:none !important; height:auto !important; max-height:none !important; margin:0 !important;
      overflow:auto !important; z-index:2147483647 !important; background:Canvas !important; }
  `;
  (document.head || document.documentElement).append(style);
  let stage = null;
  let delegated = null;
  let attempts = 0;
  const ancestors = [];
  function refresh() {
    const path = activityPath(window.location.href);
    const next = path === null ? null : activityPanel(document, path !== '/');
    if (next === stage) return;
    stage?.removeAttribute(stageAttribute);
    for (const ancestor of ancestors.splice(0)) ancestor.removeAttribute(pathAttribute);
    stage = next;
    if (stage) {
      stage.setAttribute(stageAttribute, '');
      for (let ancestor = stage.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        ancestor.setAttribute(pathAttribute, '');
        ancestors.push(ancestor);
      }
    }
    onReady(Boolean(stage));
  }
  function activate() {
    refresh();
    if (stage || attempts >= 3 || activityPath(window.location.href) !== '/') return;
    const control = notificationControl(document);
    if (!control) return;
    attempts++;
    delegated = control;
    try { control.click(); } finally { delegated = null; }
    refresh();
  }
  function guard(event) {
    if (delegated && event.composedPath().includes(delegated)) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (stage?.contains(target) && event.type === 'click') {
      const anchor = target.closest('a[href]');
      if (!anchor || activityPath(anchor.href) !== null || anchor.getAttribute('href').startsWith('#')) return;
      const url = externalDestination(anchor.href);
      if (event.isTrusted && url) onExternal(url);
    } else if (stage?.contains(target) && event.type !== 'contextmenu') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  const events = ['click', 'auxclick', 'contextmenu', 'submit'];
  for (const event of events) window.addEventListener(event, guard, true);
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributeFilter: ['href', 'aria-label', 'aria-hidden', 'hidden', 'inert', 'class', 'role', 'style'],
  });
  function pageLoaded() {
    refresh();
    if (stage) onReady(true);
  }
  window.addEventListener('load', pageLoaded, { once: true });
  window.addEventListener('popstate', refresh);
  const retry = window.setInterval(activate, 900);
  activate();
  return () => {
    observer.disconnect();
    window.clearInterval(retry);
    window.removeEventListener('load', pageLoaded);
    window.removeEventListener('popstate', refresh);
    for (const event of events) window.removeEventListener(event, guard, true);
    stage?.removeAttribute(stageAttribute);
    for (const ancestor of ancestors) ancestor.removeAttribute(pathAttribute);
    style.remove();
  };
}

module.exports = { installActivityViewer };
