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

function attachmentDestination(rawUrl) {
  const url = instagramUrl(rawUrl);
  const match = url && /^\/(?:[a-z0-9._]{1,30}\/)?(p|reel|tv)\/([a-z0-9_-]{1,128})\/?$/i.exec(url.pathname);
  if (!match) return null;
  const destination = new URL(`https://www.instagram.com/${match[1]}/${match[2]}/`);
  const index = url.searchParams.get('img_index');
  if (/^[1-9]\d{0,2}$/.test(index || '')) destination.searchParams.set('img_index', index);
  return destination.href;
}

function sameAttachment(selected, candidate) {
  const first = attachmentDestination(selected);
  const next = attachmentDestination(candidate);
  return !!first && !!next && new URL(first).pathname.split('/')[2] === new URL(next).pathname.split('/')[2];
}

module.exports = { classifyDesktopNavigation, isInstagramHome, attachmentDestination, sameAttachment };
