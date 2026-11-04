const { sameAttachment, attachmentDestination } = require('./desktop-policy');

const VIEWER_CSS = 'html { background: #101114 !important; overflow: hidden !important; } body > :not(#messenger-attachment-viewer), body > :not(#messenger-attachment-viewer) * { visibility: hidden !important; pointer-events: none !important; }';

function mediaSource(raw, document) {
  try {
    const url = new URL(raw, document.location.href);
    if (url.protocol === 'blob:' && url.origin === document.location.origin) return url.href;
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) return url.href;
  } catch { /* Unknown media is not loaded. */ }
  return null;
}

function containerMedia(container, document) {
  const result = [];
  const seen = new Set();
  for (const media of container.querySelectorAll('video, img')) {
    if (media.closest('header, [role="banner"]')) continue;
    if (media.tagName === 'IMG') {
      const rect = media.getBoundingClientRect();
      const width = rect.width || media.width || media.naturalWidth;
      const height = rect.height || media.height || media.naturalHeight;
      if (Math.max(width, height) < 160) continue;
    }
    const src = mediaSource(media.currentSrc || media.getAttribute('src') || media.querySelector('source')?.src, document);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    result.push({ tag: media.tagName.toLowerCase(), src, alt: media.getAttribute('alt') || '' });
  }
  return result;
}

function selectAttachmentMedia(document, selected) {
  // Find the nearest media container associated with this exact permalink.
  // Stop before a page-wide container can mix this post with recommendations.
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (!sameAttachment(selected, anchor.href)) continue;
    for (let parent = anchor.parentElement; parent && !parent.matches('body, html'); parent = parent.parentElement) {
      const posts = Array.from(parent.querySelectorAll('a[href]')).filter(link => /\/(p|reel|tv)\//.test(link.pathname));
      if (posts.some(link => !sameAttachment(selected, link.href))) break;
      const media = containerMedia(parent, document);
      if (media.length) return media;
      if (parent.matches('main, [role="main"]')) break;
    }
  }
  return [];
}

function messageMedia(element) {
  const media = element?.closest('img, video');
  if (!media || !/^\/direct\/t\/[^/]+\/?$/.test(media.ownerDocument.location.pathname)
    || !media.closest('article, [role="article"], [role="row"], [role="log"], [role="listitem"]')
    || media.closest('a[href], header, nav, [role="banner"], [role="navigation"]')) return null;
  if (media.tagName === 'IMG') {
    const rect = media.getBoundingClientRect();
    if (Math.max(rect.width || media.width || media.naturalWidth,
      rect.height || media.height || media.naturalHeight) < 160) return null;
  }
  const src = mediaSource(media.currentSrc || media.getAttribute('src') || media.querySelector('source')?.src, media.ownerDocument);
  return src ? [{ tag: media.tagName.toLowerCase(), src, alt: media.getAttribute('alt') || '' }] : null;
}

function installAttachmentViewer(window, selected, onBack, mediaItems = null) {
  const { document } = window;
  const previousFocus = document.activeElement;
  const background = new Map();
  const muted = new Map();
  const moved = [];
  const host = document.createElement('div');
  host.id = 'messenger-attachment-viewer';
  host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;background:#101114!important;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { color-scheme: dark; font: 15px -apple-system, BlinkMacSystemFont, sans-serif; color: #f5f5f5; }
    * { box-sizing: border-box; }
    section { height: 100%; display: flex; flex-direction: column; background: #101114; }
    header { flex: none; padding: 14px 20px; border-bottom: 1px solid #303238; }
    button { font: inherit; color: #f5f5f5; background: #24262c; border: 1px solid #545862; border-radius: 8px; padding: 9px 14px; cursor: pointer; }
    button:focus-visible { outline: 2px solid #a8c7ff; outline-offset: 3px; }
    main { flex: 1; min-height: 0; overflow: auto; padding: 20px; text-align: center; }
    img, video { display: block; max-width: 100%; max-height: calc(100vh - 120px); margin: 0 auto 16px; object-fit: contain; }
    p { margin: 40px auto; color: #c3c6ce; }
  </style><section role="dialog" aria-modal="true" aria-label="Message attachment"><header><button type="button">Back to message</button></header><main><p role="status">Loading attachment…</p></main></section>`;
  const back = root.querySelector('button');
  const content = root.querySelector('main');
  back.addEventListener('click', event => { if (event.isTrusted) onBack(); });
  let captured = false;
  const refresh = () => {
    if (!host.isConnected) document.body.append(host);
    for (const element of document.body.children) {
      if (element === host || background.has(element)) continue;
      background.set(element, element.getAttribute('inert'));
      element.setAttribute('inert', '');
    }
    for (const video of document.querySelectorAll('video, audio')) {
      if (!muted.has(video)) muted.set(video, video.muted);
      video.muted = true;
      if (!video.paused) video.pause();
    }
    if (captured) return;
    const media = mediaItems || selectAttachmentMedia(document, selected);
    if (!media.length) return;
    captured = true;
    content.replaceChildren();
    for (const item of media) {
      // A MediaSource blob can only be attached to its original video element.
      const original = item.tag === 'video' && item.src.startsWith('blob:')
        && Array.from(document.querySelectorAll('video')).find(video => (video.currentSrc || video.src) === item.src);
      const element = original || document.createElement(item.tag);
      if (original) {
        moved.push({ element, parent: element.parentNode, next: element.nextSibling,
          attributes: ['controls', 'playsinline', 'preload', 'controlslist'].map(name => [name, element.getAttribute(name)]),
          pictureInPicture: element.disablePictureInPicture, remotePlayback: element.disableRemotePlayback });
        element.muted = muted.get(element) || false;
      } else element.src = item.src;
      if (item.tag === 'video') {
        element.controls = true;
        element.playsInline = true;
        element.preload = 'metadata';
        element.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
        element.disablePictureInPicture = true;
        element.disableRemotePlayback = true;
      } else element.alt = item.alt;
      const error = () => {
        const message = document.createElement('p');
        message.textContent = 'This attachment could not be loaded. Go back to the message and try again.';
        element.replaceWith(message);
      };
      element.addEventListener('error', error, { once: true });
      if (original) moved.at(-1).error = error;
      content.append(element);
    }
  };
  // Block Instagram keyboard, wheel and pointer handlers outside our own UI.
  const guard = event => {
    if (event.type === 'contextmenu') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.type === 'keydown' && event.key === 'Escape' && event.isTrusted) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onBack();
      return;
    }
    if (event.composedPath().includes(host)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const events = ['click', 'auxclick', 'keydown', 'keyup', 'wheel', 'touchmove', 'contextmenu', 'submit'];
  for (const type of events) window.addEventListener(type, guard, { capture: true, passive: false });
  // Let native video controls receive input, then stop it before it bubbles
  // back into Instagram's document/window handlers.
  for (const type of events) root.addEventListener(type, event => event.stopPropagation());
  const observer = new window.MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'href'] });
  const silence = event => { event.target.muted = true; event.target.pause(); };
  document.addEventListener('play', silence, true);
  document.addEventListener('load', refresh, true);
  document.addEventListener('loadedmetadata', refresh, true);
  refresh();
  back.focus();
  const unavailable = () => {
    if (!captured) content.querySelector('p').textContent = 'This attachment is unavailable in the app. Go back to the message to continue.';
  };
  if (!mediaItems && !attachmentDestination(selected)) unavailable();
  const timeout = window.setTimeout(unavailable, 12000);
  return () => {
    window.clearTimeout(timeout);
    observer.disconnect();
    for (const type of events) window.removeEventListener(type, guard, true);
    document.removeEventListener('play', silence, true);
    document.removeEventListener('load', refresh, true);
    document.removeEventListener('loadedmetadata', refresh, true);
    for (const item of moved) {
      const { element, parent, next, attributes } = item;
      element.removeEventListener('error', item.error);
      if (!element.paused) element.pause();
      for (const [name, value] of attributes) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
      element.disablePictureInPicture = item.pictureInPicture;
      element.disableRemotePlayback = item.remotePlayback;
      parent.insertBefore(element, next?.parentNode === parent ? next : null);
    }
    for (const [element, wasMuted] of muted) element.muted = wasMuted;
    host.remove();
    for (const [element, inert] of background) {
      if (inert === null) element.removeAttribute('inert');
      else element.setAttribute('inert', inert);
    }
    if (previousFocus?.isConnected) previousFocus.focus();
  };
}

module.exports = { VIEWER_CSS, selectAttachmentMedia, messageMedia, installAttachmentViewer };
