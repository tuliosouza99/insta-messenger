const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createNotificationController } = require('../src/notifications');

function setup() {
  const shown = [], errors = [];
  let focused = false, enabled = true, now = 0, inbox = 0;
  const window = { isFocused: () => focused, isVisible: () => true, isMinimized: () => false,
    show() {}, focus() { focused = true; }, restore() {} };
  class NativeNotice extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; }
    show() { shown.push(this); }
    close() { this.emit('close'); }
  }
  const controller = createNotificationController({ Notification: NativeNotice, getWindow: () => window,
    openInbox: () => { inbox++; }, isEnabled: () => enabled, now: () => now, onError: error => errors.push(error) });
  return { controller, shown, errors, setFocused: value => { focused = value; }, setEnabled: value => { enabled = value; },
    advance: () => { now += 2000; }, inbox: () => inbox };
}

test('native alerts contain generic copy and deduplicate bursts', () => {
  const state = setup();
  state.controller.notifyUnread();
  state.controller.notifyUnread();
  assert.equal(state.shown.length, 1);
  assert.equal(state.shown[0].options.body, 'You have new unread messages on Instagram.');
  state.advance();
  state.controller.notifyUnread();
  assert.equal(state.shown.length, 2);
});

test('focus and disabling suppress activity but test action can verify foreground delivery', () => {
  const state = setup();
  state.setFocused(true);
  state.controller.notifyUnread();
  assert.equal(state.shown.length, 0);
  state.controller.sendTest();
  assert.equal(state.shown.length, 1);
  state.setFocused(false);
  state.setEnabled(false);
  state.advance();
  state.controller.notifyUnread();
  assert.equal(state.shown.length, 1);
});

test('clicking an alert opens and focuses the inbox', () => {
  const state = setup();
  state.controller.notifyUnread();
  state.shown[0].emit('click');
  assert.equal(state.inbox(), 1);
  state.controller.notifyUnread();
  assert.equal(state.shown.length, 1);
});

test('delivery errors are surfaced for explicit tests without crashing', () => {
  const state = setup();
  state.controller.sendTest();
  state.shown[0].emit('failed', null, 'Notifications are not allowed');
  assert.equal(state.errors.length, 1);
  assert.match(state.errors[0], /not allowed/);
});
