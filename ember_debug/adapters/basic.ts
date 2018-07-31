/* globals requireModule */
/* eslint no-console: 0 */
const Ember = window.Ember;
const { A, computed, RSVP, Object: EmberObject } = Ember;
const { Promise, resolve } = RSVP;
import { onReady } from 'ember-debug/utils/on-ready';

export default class extends EmberObject.extend({
  /**
   * Uses the current build's config module to determine
   * the environment.
   *
   * @property environment
   * @type {String}
   */
  environment: computed(function() {
    return requireModule('ember-debug/config')['default'].environment;
  }),

  _messageCallbacks: computed(function() { return A(); }),
  _isReady: false,
  _pendingMessages: computed(function() { return A(); }),

}) {

  interval: any | null = null;

  constructor() {
    super();
    resolve(this.connect(), 'ember-inspector').then(() => {
      this.onConnectionReady();
    }, null, 'ember-inspector');
  }

  debug(...args: any[]) {
    return console.debug(...args);
  }

  log(...args: any[]) {
    return console.log(...args);
  }

  /**
   * A wrapper for `console.warn`.
   *
   * @method warn
   */
  warn(...args: any[]) {
    return console.warn(...args);
  }

  /**
    Used to send messages to EmberExtension

    @param {Object} type the message to the send
  */
  sendMessage(/* options */) {}

  /**
    Register functions to be called
    when a message from EmberExtension is received

    @param {Function} callback
  */
  onMessageReceived(callback: any) {
    this.get('_messageCallbacks').pushObject(callback);
  }

  /**
    Inspect a specific element.  This usually
    means using the current environment's tools
    to inspect the element in the DOM.

    For example, in chrome, `inspect(elem)`
    will open the Elements tab in dev tools
    and highlight the element.

    @param {DOM Element} elem
  */
  inspectElement(/* elem */) {}


  _messageReceived(message) {
    this.get('_messageCallbacks').forEach(callback => {
      callback(message);
    });
  }

  /**
   * Handle an error caused by EmberDebug.
   *
   * This function rethrows in development and test envs,
   * but warns instead in production.
   *
   * The idea is to control errors triggered by the inspector
   * and make sure that users don't get mislead by inspector-caused
   * bugs.
   *
   * @method handleError
   * @param {Error} error
   */
  handleError(error: any) {
    if (this.get('environment') === 'production') {
      if (error && error instanceof Error) {
        error = `Error message: ${error.message}\nStack trace: ${error.stack}`;
      }
      this.warn(`Ember Inspector has errored.\n` +
        `This is likely a bug in the inspector itself.\n` +
        `You can report bugs at https://github.com/emberjs/ember-inspector.\n${error}`);
    } else {
      this.warn('EmberDebug has errored:');
      throw error;
    }
  },

  /**

    A promise that resolves when the connection
    with the inspector is set up and ready.

    @return {Promise}
  */
  connect() {
    return new Promise((resolve, reject) => {
      onReady(() => {
        if (this.isDestroyed) { reject(); }
        this.interval = setInterval(() => {
          if (document.documentElement.dataset.emberExtension) {
            clearInterval(this.interval);
            resolve();
          }
        }, 10);
      });
    }, 'ember-inspector');
  }

  willDestroy() {
    this._super();
    clearInterval(this.interval);
  }

  send(options) {
    if (this._isReady) {
      this.sendMessage(...arguments);
    } else {
      this.get('_pendingMessages').push(options);
    }
  },

  /**
    Called when the connection is set up.
    Flushes the pending messages.
  */
  onConnectionReady() {
    // Flush pending messages
    const messages = this.get('_pendingMessages');
    messages.forEach(options => this.sendMessage(options));
    messages.clear();
    this._isReady = true;
  }

}
