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
    environment: computed(function () {
        return requireModule('ember-debug/config')['default'].environment;
    }),
    _messageCallbacks: computed(function () { return A(); }),
    _isReady: false,
    _pendingMessages: computed(function () { return A(); }),
}) {
    constructor() {
        super();
        this.interval = null;
        resolve(this.connect(), 'ember-inspector').then(() => {
            this.onConnectionReady();
        }, null, 'ember-inspector');
    }
    debug(...args) {
        return console.debug(...args);
    }
    log(...args) {
        return console.log(...args);
    }
    /**
     * A wrapper for `console.warn`.
     *
     * @method warn
     */
    warn(...args) {
        return console.warn(...args);
    }
    /**
      Used to send messages to EmberExtension
  
      @param {Object} type the message to the send
    */
    sendMessage( /* options */) { }
    /**
      Register functions to be called
      when a message from EmberExtension is received
  
      @param {Function} callback
    */
    onMessageReceived(callback) {
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
    inspectElement( /* elem */) { }
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
    handleError(error) {
        if (this.get('environment') === 'production') {
            if (error && error instanceof Error) {
                error = `Error message: ${error.message}\nStack trace: ${error.stack}`;
            }
            this.warn(`Ember Inspector has errored.\n` +
                `This is likely a bug in the inspector itself.\n` +
                `You can report bugs at https://github.com/emberjs/ember-inspector.\n${error}`);
        }
        else {
            this.warn('EmberDebug has errored:');
            throw error;
        }
    }
    /**
  
      A promise that resolves when the connection
      with the inspector is set up and ready.
  
      @return {Promise}
    */
    connect() {
        return new Promise((resolve, reject) => {
            onReady(() => {
                if (this.isDestroyed) {
                    reject();
                }
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
        }
        else {
            this.get('_pendingMessages').push(options);
        }
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzaWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiYXNpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwyQkFBMkI7QUFDM0IsMEJBQTBCO0FBQzFCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDM0IsTUFBTSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7QUFDekQsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFDbEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXJELE1BQU0sQ0FBQyxPQUFPLE1BQU8sU0FBUSxXQUFXLENBQUMsTUFBTSxDQUFDO0lBQzlDOzs7Ozs7T0FNRztJQUNILFdBQVcsRUFBRSxRQUFRLENBQUM7UUFDcEIsT0FBTyxhQUFhLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLENBQUM7SUFDcEUsQ0FBQyxDQUFDO0lBRUYsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLGNBQWEsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2RCxRQUFRLEVBQUUsS0FBSztJQUNmLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxjQUFhLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FFdkQsQ0FBQztJQUlBO1FBQ0UsS0FBSyxFQUFFLENBQUM7UUFIVixhQUFRLEdBQWUsSUFBSSxDQUFDO1FBSTFCLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ25ELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzNCLENBQUMsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsS0FBSyxDQUFD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QyxDQUFDO1FBQzlDLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDdkQsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0lBQ3ZCLENBQUM7Q0FFRiIsInNvdXJjZXNDb250ZW50IjpbIi8qIGdsb2JhbHMgcmVxdWlyZU1vZHVsZSAqL1xuLyogZXNsaW50IG5vLWNvbnNvbGU6IDAgKi9cbmNvbnN0IEVtYmVyID0gd2luZG93LkVtYmVyO1xuY29uc3QgeyBBLCBjb21wdXRlZCwgUlNWUCwgT2JqZWN0OiBFbWJlck9iamVjdCB9ID0gRW1iZXI7XG5jb25zdCB7IFByb21pc2UsIHJlc29sdmUgfSA9IFJTVlA7XG5pbXBvcnQgeyBvblJlYWR5IH0gZnJvbSAnZW1iZXItZGVidWcvdXRpbHMvb24tcmVhZHknO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBleHRlbmRzIEVtYmVyT2JqZWN0LmV4dGVuZCh7XG4gIC8qKlxuICAgKiBVc2VzIHRoZSBjdXJyZW50IGJ1aWxkJ3MgY29uZmlnIG1vZHVsZSB0byBkZXRlcm1pbmVcbiAgICogdGhlIGVudmlyb25tZW50LlxuICAgKlxuICAgKiBAcHJvcGVydHkgZW52aXJvbm1lbnRcbiAgICogQHR5cGUge1N0cmluZ31cbiAgICovXG4gIGVudmlyb25tZW50OiBjb21wdXRlZChmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gcmVxdWlyZU1vZHVsZSgnZW1iZXItZGVidWcvY29uZmlnJylbJ2RlZmF1bHQnXS5lbnZpcm9ubWVudDtcbiAgfSksXG5cbiAgX21lc3NhZ2VDYWxsYmFja3M6IGNvbXB1dGVkKGZ1bmN0aW9uKCkgeyByZXR1cm4gQSgpOyB9KSxcbiAgX2lzUmVhZHk6IGZhbHNlLFxuICBfcGVuZGluZ01lc3NhZ2VzOiBjb21wdXRlZChmdW5jdGlvbigpIHsgcmV0dXJuIEEoKTsgfSksXG5cbn0pIHtcblxuICBpbnRlcnZhbDogYW55IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoKTtcbiAgICByZXNvbHZlKHRoaXMuY29ubmVjdCgpLCAnZW1iZXItaW5zcGVjdG9yJykudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLm9uQ29ubmVjdGlvblJlYWR5KCk7XG4gICAgfSwgbnVsbCwgJ2VtYmVyLWluc3BlY3RvcicpO1xuICB9XG5cbiAgZGVidWcoLi4uYXJnczogYW55W10pIHtcbiAgICByZXR1cm4gY29uc29sZS5kZWJ1ZyguLi5hcmdzKTtcbiAgfVxuXG4gIGxvZyguLi5hcmdzOiBhbnlbXSkge1xuICAgIHJldHVybiBjb25zb2xlLmxvZyguLi5hcmdzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBIHdyYXBwZXIgZm9yIGBjb25zb2xlLndhcm5gLlxuICAgKlxuICAgKiBAbWV0aG9kIHdhcm5cbiAgICovXG4gIHdhcm4oLi4uYXJnczogYW55W10pIHtcbiAgICByZXR1cm4gY29uc29sZS53YXJuKC4uLmFyZ3MpO1xuICB9XG5cbiAgLyoqXG4gICAgVXNlZCB0byBzZW5kIG1lc3NhZ2VzIHRvIEVtYmVyRXh0ZW5zaW9uXG5cbiAgICBAcGFyYW0ge09iamVjdH0gdHlwZSB0aGUgbWVzc2FnZSB0byB0aGUgc2VuZFxuICAqL1xuICBzZW5kTWVzc2FnZSgvKiBvcHRpb25zICovKSB7fVxuXG4gIC8qKlxuICAgIFJlZ2lzdGVyIGZ1bmN0aW9ucyB0byBiZSBjYWxsZWRcbiAgICB3aGVuIGEgbWVzc2FnZSBmcm9tIEVtYmVyRXh0ZW5zaW9uIGlzIHJlY2VpdmVkXG5cbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICAqL1xuICBvbk1lc3NhZ2VSZWNlaXZlZChjYWxsYmFjazogYW55KSB7XG4gICAgdGhpcy5nZXQoJ19tZXNzYWdlQ2FsbGJhY2tzJykucHVzaE9iamVjdChjYWxsYmFjayk7XG4gIH1cblxuICAvKipcbiAgICBJbnNwZWN0IGEgc3BlY2lmaWMgZWxlbWVudC4gIFRoaXMgdXN1YWxseVxuICAgIG1lYW5zIHVzaW5nIHRoZSBjdXJyZW50IGVudmlyb25tZW50J3MgdG9vbHNcbiAgICB0byBpbnNwZWN0IHRoZSBlbGVtZW50IGluIHRoZSBET00uXG5cbiAgICBGb3IgZXhhbXBsZSwgaW4gY2hyb21lLCBgaW5zcGVjdChlbGVtKWBcbiAgICB3aWxsIG9wZW4gdGhlIEVsZW1lbnRzIHRhYiBpbiBkZXYgdG9vbHNcbiAgICBhbmQgaGlnaGxpZ2h0IHRoZSBlbGVtZW50LlxuXG4gICAgQHBhcmFtIHtET00gRWxlbWVudH0gZWxlbVxuICAqL1xuICBpbnNwZWN0RWxlbWVudCgvKiBlbGVtICovKSB7fVxuXG5cbiAgX21lc3NhZ2VSZWNlaXZlZChtZXNzYWdlKSB7XG4gICAgdGhpcy5nZXQoJ19tZXNzYWdlQ2FsbGJhY2tzJykuZm9yRWFjaChjYWxsYmFjayA9PiB7XG4gICAgICBjYWxsYmFjayhtZXNzYWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgYW4gZXJyb3IgY2F1c2VkIGJ5IEVtYmVyRGVidWcuXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gcmV0aHJvd3MgaW4gZGV2ZWxvcG1lbnQgYW5kIHRlc3QgZW52cyxcbiAgICogYnV0IHdhcm5zIGluc3RlYWQgaW4gcHJvZHVjdGlvbi5cbiAgICpcbiAgICogVGhlIGlkZWEgaXMgdG8gY29udHJvbCBlcnJvcnMgdHJpZ2dlcmVkIGJ5IHRoZSBpbnNwZWN0b3JcbiAgICogYW5kIG1ha2Ugc3VyZSB0aGF0IHVzZXJzIGRvbid0IGdldCBtaXNsZWFkIGJ5IGluc3BlY3Rvci1jYXVzZWRcbiAgICogYnVncy5cbiAgICpcbiAgICogQG1ldGhvZCBoYW5kbGVFcnJvclxuICAgKiBAcGFyYW0ge0Vycm9yfSBlcnJvclxuICAgKi9cbiAgaGFuZGxlRXJyb3IoZXJyb3I6IGFueSkge1xuICAgIGlmICh0aGlzLmdldCgnZW52aXJvbm1lbnQnKSA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICBlcnJvciA9IGBFcnJvciBtZXNzYWdlOiAke2Vycm9yLm1lc3NhZ2V9XFxuU3RhY2sgdHJhY2U6ICR7ZXJyb3Iuc3RhY2t9YDtcbiAgICAgIH1cbiAgICAgIHRoaXMud2FybihgRW1iZXIgSW5zcGVjdG9yIGhhcyBlcnJvcmVkLlxcbmAgK1xuICAgICAgICBgVGhpcyBpcyBsaWtlbHkgYSBidWcgaW4gdGhlIGluc3BlY3RvciBpdHNlbGYuXFxuYCArXG4gICAgICAgIGBZb3UgY2FuIHJlcG9ydCBidWdzIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9lbWJlcmpzL2VtYmVyLWluc3BlY3Rvci5cXG4ke2Vycm9yfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLndhcm4oJ0VtYmVyRGVidWcgaGFzIGVycm9yZWQ6Jyk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcblxuICAgIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGNvbm5lY3Rpb25cbiAgICB3aXRoIHRoZSBpbnNwZWN0b3IgaXMgc2V0IHVwIGFuZCByZWFkeS5cblxuICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICovXG4gIGNvbm5lY3QoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIG9uUmVhZHkoKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5pc0Rlc3Ryb3llZCkgeyByZWplY3QoKTsgfVxuICAgICAgICB0aGlzLmludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgIGlmIChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuZGF0YXNldC5lbWJlckV4dGVuc2lvbikge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDEwKTtcbiAgICAgIH0pO1xuICAgIH0sICdlbWJlci1pbnNwZWN0b3InKTtcbiAgfVxuXG4gIHdpbGxEZXN0cm95KCkge1xuICAgIHRoaXMuX3N1cGVyKCk7XG4gICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcbiAgfVxuXG4gIHNlbmQob3B0aW9ucykge1xuICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICB0aGlzLnNlbmRNZXNzYWdlKC4uLmFyZ3VtZW50cyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ2V0KCdfcGVuZGluZ01lc3NhZ2VzJykucHVzaChvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICBDYWxsZWQgd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBzZXQgdXAuXG4gICAgRmx1c2hlcyB0aGUgcGVuZGluZyBtZXNzYWdlcy5cbiAgKi9cbiAgb25Db25uZWN0aW9uUmVhZHkoKSB7XG4gICAgLy8gRmx1c2ggcGVuZGluZyBtZXNzYWdlc1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gdGhpcy5nZXQoJ19wZW5kaW5nTWVzc2FnZXMnKTtcbiAgICBtZXNzYWdlcy5mb3JFYWNoKG9wdGlvbnMgPT4gdGhpcy5zZW5kTWVzc2FnZShvcHRpb25zKSk7XG4gICAgbWVzc2FnZXMuY2xlYXIoKTtcbiAgICB0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcbiAgfVxuXG59XG4iXX0=