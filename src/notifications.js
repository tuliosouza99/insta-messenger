function createNotificationController({ Notification, getWindow, openInbox, isEnabled, onError = () => {}, now = Date.now }) {
  const active = new Set();
  let lastShownAt = -Infinity;

  function show(isTest) {
    const window = getWindow();
    if (!isTest && (!isEnabled() || (window?.isFocused() && window.isVisible()) || now() - lastShownAt < 1200)) return;
    if (!Notification.isSupported()) { onError('Native notifications are unavailable on this system.', { isTest }); return; }
    const notice = new Notification({
      title: 'Instagram Messenger',
      body: isTest ? 'Notifications are working. Click to open your inbox.' : 'You have new unread messages on Instagram.',
      silent: false,
    });
    active.add(notice);
    lastShownAt = now();
    notice.once('click', () => {
      openInbox();
      const current = getWindow();
      if (current?.isMinimized()) current.restore();
      current?.show();
      current?.focus();
    });
    notice.once('close', () => active.delete(notice));
    notice.once('failed', (_event, error) => {
      active.delete(notice);
      onError(typeof error === 'string' ? error : 'macOS could not deliver this notification.', { isTest });
    });
    notice.show();
  }

  return { notifyUnread: () => show(false), sendTest: () => show(true) };
}

module.exports = { createNotificationController };
