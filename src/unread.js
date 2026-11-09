const { classifyNavigation } = require('./policy');

function readUnreadCount(document) {
  const titleMatch = /^\((\d{1,6})\)\s/.exec(document.title);
  const markers = document.querySelectorAll('[aria-label="Unread"], [aria-label="Unread message"], [aria-label="Unread messages"], [aria-label="Não lida"], [aria-label="Não lidas"], [aria-label="No leído"]');
  const messageMarkers = Array.from(markers).filter(marker => !marker.closest('nav, [role="navigation"], [data-messenger-navigation], [data-messenger-hidden]'));
  const rows = new Set(messageMarkers.map(marker => marker.closest('a[href*="/direct/t/"], [role="row"], [role="listitem"], [role="button"]') || marker));
  return Math.max(titleMatch ? Number(titleMatch[1]) : 0, rows.size);
}

class UnreadTracker {
  constructor({ warmupMs = 2000 } = {}) { this.warmupMs = warmupMs; this.reset(); }
  reset() { this.previous = null; this.stableSince = null; this.armed = false; }
  observe(count, { now = Date.now(), ready = true } = {}) {
    if (!Number.isSafeInteger(count) || count < 0 || count > 999999) return false;
    if (!ready) { this.reset(); return false; }
    if (this.stableSince === null) {
      this.stableSince = now;
      this.previous = count;
      this.armed = this.warmupMs === 0;
      return false;
    }
    const increased = count > this.previous;
    if (!this.armed) {
      if (count !== this.previous) this.stableSince = now;
      this.previous = count;
      this.armed = now - this.stableSince >= this.warmupMs;
      return false;
    }
    this.previous = count;
    return increased;
  }
}

function watchUnread(window, onUnread, options = {}) {
  const tracker = new UnreadTracker(options);
  const { document } = window;
  const sample = () => {
    if (classifyNavigation(window.location.href) !== 'messaging') { tracker.reset(); return; }
    // Initial SPA shells may be "complete" long before chats hydrate. Conversely,
    // a usable inbox can retain lazy-list/media spinners indefinitely.
    let usable = !!document.querySelector('textarea, [contenteditable="true"], a[href*="/direct/t/"]');
    if (!usable) {
      const heading = document.querySelector('h1, [role="heading"][aria-level="1"]');
      usable = !!heading && Array.from(document.querySelectorAll('button, [role="button"]')).some(row =>
        row.querySelector('img') && (heading.compareDocumentPosition(row) & window.Node.DOCUMENT_POSITION_FOLLOWING));
    }
    const ready = document.readyState === 'complete' && usable;
    const count = readUnreadCount(document);
    if (tracker.observe(count, { ready })) onUnread(count);
  };
  const observer = new window.MutationObserver(sample);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-busy'] });
  const interval = window.setInterval(sample, 1000);
  window.addEventListener('load', sample);
  window.addEventListener('popstate', sample);
  sample();
  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    window.removeEventListener('load', sample);
    window.removeEventListener('popstate', sample);
  };
}

module.exports = { readUnreadCount, UnreadTracker, watchUnread };
