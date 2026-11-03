const { Menu, dialog, app } = require('electron');

function installMenu({ getWindow, openInbox, reload, resetSession, notifications }) {
  const template = [
    {
      label: 'Instagram Messenger',
      submenu: [
        { role: 'about' }, { type: 'separator' },
        {
          id: 'reset-session', label: 'Reset Instagram session…',
          click: async () => {
            const window = getWindow();
            if (!window) return;
            const { response } = await dialog.showMessageBox(window, {
              type: 'question', title: 'Reset Instagram session?',
              message: 'Sign out of this app?',
              detail: 'This clears Instagram cookies and site storage in this app. Your regular browser is unaffected.',
              buttons: ['Reset session', 'Cancel'], defaultId: 1, cancelId: 1,
            });
            if (response === 0) await resetSession();
          },
        },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Notifications', submenu: [
        { id: 'enable-notifications', label: 'Message notifications', type: 'checkbox', checked: notifications.isEnabled(),
          click: item => notifications.setEnabled(item.checked) },
        { id: 'test-notification', label: 'Send test notification', click: () => notifications.sendTest() },
      ],
    },
    {
      label: 'View', submenu: [
        { id: 'inbox', label: 'Return to inbox', accelerator: 'CmdOrCtrl+1', click: openInbox },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: reload },
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({ applicationName: 'Instagram Messenger', applicationVersion: app.getVersion(),
    copyright: 'An independent personal-use app. Not affiliated with Instagram or Meta.' });
}

module.exports = { installMenu };
