const { sameAttachment } = require('./desktop-policy');

function samePostLink(selected, rawUrl) {
  try {
    const url = new URL(rawUrl);
    const post = /^\/(?:[a-z0-9._]{1,30}\/)?(p|reel|tv)\/([a-z0-9_-]{1,128})(?:\/|$)/i.exec(url.pathname);
    if (!post) return false;
    // Likes/comments identify their parent post for DOM selection only.
    // Navigation grants still require an exact post/Reel route.
    url.pathname = `/${post[1]}/${post[2]}/`;
    return sameAttachment(selected, url.href);
  } catch { return false; }
}

function label(control) {
  return control.getAttribute('aria-label') || control.getAttribute('title')
    || control.querySelector('svg[aria-label], img[alt]')?.getAttribute('aria-label') || '';
}

function sharedMessageCard(element) {
  if (!element || element.closest('a[href]')) return null;
  const card = element.closest('button, [role="button"]');
  if (!card || !card.querySelector('img')
    || !card.closest('article, [role="article"], [role="row"], [role="log"], [role="listitem"]')
    || card.closest('nav, header, [role="navigation"], [role="banner"]')) return null;
  return card.querySelector('a[href]') || card.querySelector('img[alt="Clip"], img[alt="Reel"]') ? card : null;
}

function mediaElements(root) {
  return Array.from(root.querySelectorAll('video, img')).filter(media => {
    if (media.closest('header, [role="banner"]')) return false;
    if (media.tagName === 'VIDEO') return true;
    const rect = media.getBoundingClientRect();
    return Math.max(rect.width || media.width || media.naturalWidth,
      rect.height || media.height || media.naturalHeight) >= 160;
  });
}

function carouselControls(root) {
  return Array.from(root.querySelectorAll('button, [role="button"]')).filter(control =>
    /^(next|previous|go back|next photo|previous photo|avançar|próximo|anterior|seguinte)$/i.test(label(control)));
}

function stageFor(media, boundary) {
  // Keep Instagram's carousel DOM and event delegation intact so its Next
  // button can fetch slides which do not exist until the user advances.
  if (media.tagName === 'IMG' || media.closest('ul, ol, [role="list"]')) {
    for (let parent = media.parentElement; parent; parent = parent.parentElement) {
      if (carouselControls(parent).length) return parent;
      if (parent === boundary) break;
    }
  }
  return media.parentElement;
}

function installLiveAttachment(window, { selected = null, opener = null, onBack }) {
  const { document } = window;
  const before = new Set(document.querySelectorAll('video, img, button, [role="button"]'));
  const previousFocus = document.activeElement;
  const attributes = new Map();
  const styles = new Map();
  const videos = new Map();
  const muted = new Map();
  let stage;
  let carouselWidth;
  let closeControl;
  let delegated;
  let stopped = false;
  const remember = (element, name, value) => {
    if (!attributes.has(element)) attributes.set(element, new Map());
    if (!attributes.get(element).has(name)) attributes.get(element).set(name, element.getAttribute(name));
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const style = (element, name, value) => {
    if (!styles.has(element)) styles.set(element, new Map());
    if (!styles.get(element).has(name)) styles.get(element).set(name, [element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
    if (element.style.getPropertyValue(name) !== value || element.style.getPropertyPriority(name) !== 'important') element.style.setProperty(name, value, 'important');
  };
  const backdrop = document.createElement('div');
  backdrop.dataset.messengerLiveBackdrop = '';
  backdrop.style.cssText = 'position:fixed;inset:0;background:#101114;z-index:2147483644;';
  const host = document.createElement('div');
  host.id = 'messenger-attachment-viewer';
  host.dataset.messengerLiveToolbar = '';
  host.style.cssText = 'position:fixed;inset:0 0 auto;z-index:2147483647;color:#f5f5f5;background:#101114;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{font:15px -apple-system,BlinkMacSystemFont,sans-serif}header{padding:14px 20px;border-bottom:1px solid #303238}button{font:inherit;color:#f5f5f5;background:#24262c;border:1px solid #545862;border-radius:8px;padding:9px 14px;cursor:pointer}button:focus-visible{outline:2px solid #a8c7ff;outline-offset:3px}p{position:fixed;top:100px;left:24px;color:#c3c6ce}</style><header><button type="button">Back to message</button></header><p role="status">Loading attachment…</p>';
  const stylesheet = document.createElement('style');
  stylesheet.textContent = `
    html[data-messenger-live] { overflow:hidden !important; }
    html[data-messenger-live] body * { visibility:hidden !important; pointer-events:none !important; }
    html[data-messenger-live] [data-messenger-live-backdrop], html[data-messenger-live] [data-messenger-live-toolbar],
    html[data-messenger-live] [data-messenger-live-allow], html[data-messenger-live] [data-messenger-live-allow] * { visibility:visible !important; pointer-events:auto !important; }
    html[data-messenger-live] body > [data-messenger-live-branch] { position:relative !important; z-index:2147483645 !important; }
  `;
  document.head.append(stylesheet);
  document.body.append(backdrop, host);
  remember(document.documentElement, 'data-messenger-live', '');

  function findSelection() {
    if (selected) {
      for (const anchor of document.querySelectorAll('a[href]')) {
        if (!samePostLink(selected, anchor.href)) continue;
        for (let parent = anchor.parentElement; parent && !parent.matches('body, html'); parent = parent.parentElement) {
          const links = Array.from(parent.querySelectorAll('a[href]')).filter(link => /\/(p|reel|tv)\//.test(link.pathname));
          if (links.some(link => !samePostLink(selected, link.href))) break;
          const media = mediaElements(parent);
          const reel = /^\/(reel|tv)\//.test(new URL(selected).pathname);
          const chosen = reel ? media.find(item => item.tagName === 'VIDEO') : media[0];
          if (chosen) return { media: chosen, boundary: parent };
        }
      }
      // Current Instagram post pages do not always repeat their permalink
      // inside the article. A matching canonical identity and one primary
      // article still identify this exact selected post without following links.
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      const articles = document.querySelectorAll('article');
      if (sameAttachment(selected, canonical) && articles.length === 1) {
        const article = articles[0];
        const otherPost = Array.from(article.querySelectorAll('a[href]')).some(link =>
          /\/(p|reel|tv)\//.test(link.pathname) && !samePostLink(selected, link.href));
        if (otherPost) return null;
        const media = mediaElements(article);
        const reel = /^\/(reel|tv)\//.test(new URL(selected).pathname);
        const chosen = reel ? media.find(item => item.tagName === 'VIDEO') : media[0];
        if (chosen) return { media: chosen, boundary: article };
      }
      return null;
    }
    const reel = !!opener?.querySelector('img[alt="Clip"], img[alt="Reel"]');
    for (const control of document.querySelectorAll('button, [role="button"]')) {
      if (before.has(control) || !/^(close|fechar|cerrar)$/i.test(label(control))) continue;
      for (let parent = control.parentElement; parent && !parent.matches('body, html') && !parent.contains(opener); parent = parent.parentElement) {
        const media = mediaElements(parent).filter(item => !before.has(item) && (!reel || item.tagName === 'VIDEO'));
        if (media.length) { closeControl = control; return { media: media[0], boundary: parent }; }
      }
    }
    return null;
  }

  function resize() {
    if (!stage) return;
    const available = mediaElements(stage);
    const frame = stage.getBoundingClientRect();
    const overlap = media => {
      const rect = media.getBoundingClientRect();
      return Math.max(0, Math.min(rect.right, frame.right) - Math.max(rect.left, frame.left))
        * Math.max(0, Math.min(rect.bottom, frame.bottom) - Math.max(rect.top, frame.top));
    };
    const player = available.find(media => media.tagName === 'VIDEO' && !media.closest('ul, ol, [role="list"]'));
    const media = player || available.reduce((best, item) => !best || overlap(item) > overlap(best) ? item : best, null);
    const width = media?.videoWidth || media?.naturalWidth || media?.width || 640;
    const height = media?.videoHeight || media?.naturalHeight || media?.height || 640;
    const ratio = width / height || 1;
    const availableHeight = Math.max(180, window.innerHeight - 120);
    const stageWidth = Math.min(window.innerWidth - 48, availableHeight * ratio, 1200, carouselWidth || Infinity);
    // Keep the carousel's measured layout width: Instagram advances by that
    // width. Scale its intact viewport instead of widening it and revealing
    // part of the neighbouring slide.
    const layoutWidth = carouselWidth || stageWidth;
    for (const [name, value] of Object.entries({ position: 'fixed', left: `${(window.innerWidth - stageWidth) / 2}px`, top: '88px', width: `${layoutWidth}px`, height: `${layoutWidth / ratio}px`, margin: '0px', overflow: 'hidden', 'z-index': '2147483646' })) style(stage, name, value);
    if (carouselWidth) {
      style(stage, 'transform-origin', '0px 0px');
      style(stage, 'transform', `scale(${stageWidth / carouselWidth})`);
    }
  }

  function refresh() {
    if (stopped) return;
    if (!stage) {
      const selection = findSelection();
      if (!selection) return;
      stage = stageFor(selection.media, selection.boundary);
      if (carouselControls(stage).length) carouselWidth = stage.getBoundingClientRect().width
        || selection.media.getBoundingClientRect().width || selection.media.width || selection.media.naturalWidth || 640;
      remember(stage, 'data-messenger-live-stage', '');
      for (let ancestor = stage.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        if (ancestor.parentElement === document.body) remember(ancestor, 'data-messenger-live-branch', '');
        const computed = window.getComputedStyle(ancestor);
        for (const property of ['transform', 'filter', 'perspective', 'contain']) {
          if (computed.getPropertyValue(property) && computed.getPropertyValue(property) !== 'none') style(ancestor, property, 'none');
        }
        style(ancestor, 'overflow', 'visible');
      }
      root.querySelector('p').hidden = true;
      resize();
    }
    const elements = mediaElements(stage);
    const hasPlayer = elements.some(media => media.tagName === 'VIDEO');
    for (const media of elements) {
      // A Reel's poster belongs to the native player. Forcing it visible would
      // cover a playing stream, even after Instagram has hidden that poster.
      if (hasPlayer && media.tagName === 'IMG' && !media.closest('ul, ol, [role="list"]')) {
        media.removeAttribute('data-messenger-live-allow');
        continue;
      }
      remember(media, 'data-messenger-live-allow', '');
      if (media.tagName !== 'VIDEO' || videos.has(media)) continue;
      videos.set(media, { controls: media.controls, pictureInPicture: media.disablePictureInPicture, remotePlayback: media.disableRemotePlayback });
      for (const attr of ['controls', 'playsinline', 'controlslist']) remember(media, attr, attr === 'controlslist' ? 'nodownload nofullscreen noremoteplayback' : '');
      media.disablePictureInPicture = true;
      media.disableRemotePlayback = true;
      for (const [name, value] of Object.entries({ width: '100%', height: '100%', 'object-fit': 'contain' })) style(media, name, value);
      media.addEventListener('click', stopPropagation);
      media.addEventListener('loadedmetadata', resize);
    }
    for (const control of carouselControls(stage)) remember(control, 'data-messenger-live-allow', '');
    resize();
  }
  function stopPropagation(event) { event.stopPropagation(); }
  function silence(event) {
    if (stage?.contains(event.target)) return;
    if (!muted.has(event.target)) muted.set(event.target, event.target.muted);
    event.target.muted = true;
    if (!event.target.paused) event.target.pause();
  }
  function activate(control) { delegated = control; try { control?.click(); } finally { delegated = null; } }
  function guard(event) {
    if (delegated && event.composedPath().includes(delegated)) return;
    if (event.type === 'keydown' && event.key === 'Escape' && event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); onBack(); return; }
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    const allowed = target?.closest('[data-messenger-live-allow]');
    if (event.type !== 'contextmenu' && event.type !== 'wheel' && event.type !== 'touchmove'
      && (event.composedPath().includes(host) || (allowed && stage?.contains(allowed)))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  const events = ['click', 'auxclick', 'keydown', 'keyup', 'wheel', 'touchmove', 'contextmenu', 'submit'];
  for (const type of events) window.addEventListener(type, guard, { capture: true, passive: false });
  for (const type of events) root.addEventListener(type, stopPropagation);
  root.querySelector('button').addEventListener('click', event => { if (event.isTrusted) onBack(); });
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'aria-label', 'class', 'style'] });
  window.addEventListener('resize', resize);
  document.addEventListener('play', silence, true);
  document.addEventListener('load', refresh, true);
  document.addEventListener('loadedmetadata', refresh, true);
  refresh();
  root.querySelector('button').focus();
  const timeout = window.setTimeout(() => {
    if (!stage) root.querySelector('p').textContent = 'This attachment could not be loaded. Go back to the message and try again.';
  }, 15000);
  return function stop({ close = false } = {}) {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timeout);
    observer.disconnect();
    for (const type of events) window.removeEventListener(type, guard, true);
    window.removeEventListener('resize', resize);
    document.removeEventListener('play', silence, true);
    document.removeEventListener('load', refresh, true);
    document.removeEventListener('loadedmetadata', refresh, true);
    for (const [video, original] of videos) {
      video.removeEventListener('click', stopPropagation);
      video.removeEventListener('loadedmetadata', resize);
      video.disablePictureInPicture = original.pictureInPicture;
      video.disableRemotePlayback = original.remotePlayback;
      if (!video.paused) video.pause();
    }
    for (const [video, wasMuted] of muted) video.muted = wasMuted;
    for (const [element, saved] of styles) for (const [name, [value, priority]] of saved) {
      if (value) element.style.setProperty(name, value, priority); else element.style.removeProperty(name);
    }
    for (const [element, saved] of attributes) for (const [name, value] of saved) {
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
    stylesheet.remove(); backdrop.remove(); host.remove();
    if (close && closeControl?.isConnected) activate(closeControl);
    if (previousFocus?.isConnected) previousFocus.focus();
  };
}

module.exports = { sharedMessageCard, installLiveAttachment };
