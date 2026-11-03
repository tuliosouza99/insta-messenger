const { classifyNavigation, externalDestination } = require('./policy');

function instagramUrl(rawUrl) {
  const destination = externalDestination(rawUrl);
  if (!destination) return null;
  const url = new URL(destination);
  // Only actual Instagram URLs qualify, never a link shim's destination.
  if (!['www.instagram.com', 'instagram.com'].includes(url.hostname)) return null;
  try {
    if (!['www.instagram.com', 'instagram.com'].includes(new URL(rawUrl).hostname)) return null;
  } catch { return null; }
  return url;
}

function classifyDesktopNavigation(rawUrl) {
  const category = classifyNavigation(rawUrl);
  if (category !== 'external') return category;
  const url = instagramUrl(rawUrl);
  if (url && /^\/stories\/[a-z0-9._]{1,30}(?:\/\d+)?\/?$/i.test(url.pathname)) return 'stories';
  return category;
}

function isInstagramHome(rawUrl) {
  const url = instagramUrl(rawUrl);
  return !!url && url.pathname === '/';
}

module.exports = { classifyDesktopNavigation, isInstagramHome };
