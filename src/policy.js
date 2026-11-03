const INBOX_URL = 'https://www.instagram.com/direct/inbox/';
const INSTAGRAM_HOSTS = new Set(['www.instagram.com', 'instagram.com']);

function publicHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192) return null;
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  // External links belong in a public browser, never OS handlers or local services.
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)
    || /(^|\.)(localhost|local|internal|lan|home|invalid)$/.test(host) || host.endsWith('.')) return null;
  return url;
}

function externalDestination(rawUrl) {
  let url = publicHttpsUrl(rawUrl);
  if (!url) return null;
  if (url.hostname === 'l.instagram.com') {
    url = publicHttpsUrl(url.searchParams.get('u'));
    if (!url || url.hostname === 'l.instagram.com') return null;
  }
  return url.href;
}

function classifyNavigation(rawUrl) {
  const url = publicHttpsUrl(rawUrl);
  if (!url) return 'blocked';
  if (!INSTAGRAM_HOSTS.has(url.hostname)) return externalDestination(rawUrl) ? 'external' : 'blocked';
  const path = url.pathname;
  if (/%2f|%5c/i.test(path)) return 'external';
  if (/^\/direct(?:\/|$)/.test(path)) return 'messaging';
  if (/^\/accounts\/(?:login|password|onetap|signup|confirm_email|confirm_phone)(?:\/|$)/.test(path)
    || /^\/(?:challenge|checkpoint|consent|auth_platform)(?:\/|$)/.test(path)
    || /^\/privacy\/consent(?:\/|$)/.test(path)) return 'auth';
  return 'external';
}

module.exports = { INBOX_URL, classifyNavigation, externalDestination };
