const Ember = window.Ember;
const { Object: EmberObject, computed, run } = Ember;
const { oneWay } = computed;
export default class Port extends EmberObject.extend(Ember.Evented, {
    adapter: oneWay('namespace.adapter').readOnly(),
    /**
     * Stores the timestamp when it was first accessed.
     *
     * @property now
     * @type {Number}
     */
    now: computed(() => Date.now()),
    /**
     * Unique id per applciation (not application instance). It's very important
     * that this id doesn't change when the app is reset otherwise the inspector
     * will no longer recognize the app.
     *
     * @property uniqueId
     * @type {String}
     */
    uniqueId: computed('namespace.applicationId', 'now', function () {
        return `${this.get('namespace.applicationId')}__${window.location.href}__${this.get('now')}`;
    }),
}) {
    constructor() {
        super();
        this.get('adapter').onMessageReceived((message) => {
            if (this.get('uniqueId') === message.applicationId || !message.applicationId) {
                this.messageReceived(message.type, message);
            }
        });
    }
    messageReceived(name, message) {
        this.wrap(() => {
            this.trigger(name, message);
        });
    }
    send(messageType, options = {}) {
        options.type = messageType;
        options.from = 'inspectedWindow';
        options.applicationId = this.get('uniqueId');
        this.get('adapter').send(options);
    }
    /**
     * Wrap all code triggered from outside of
     * EmberDebug with this method.
     *
     * `wrap` is called by default
     * on all callbacks triggered by `port`,
     * so no need to call it in this case.
     *
     * - Wraps a callback in `Ember.run`.
     * - Catches all errors during production
     * and displays them in a user friendly manner.
     *
     * @method wrap
     * @return The return value of the passed function
     */
    wrap(fn) {
        return run(this, function () {
            try {
                return fn();
            }
            catch (error) {
                this.get('adapter').handleError(error);
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9ydC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUMzQixNQUFNLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDO0FBQ3JELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUM7QUFFNUIsTUFBTSxDQUFDLE9BQU8sT0FBTyxJQUFLLFNBQVEsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFO0lBQ2xFLE9BQU8sRUFBRSxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFFL0M7Ozs7O09BS0c7SUFDSCxHQUFHLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUUvQjs7Ozs7OztPQU9HO0lBQ0gsUUFBUSxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLEVBQUU7UUFDbkQsT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsS0FBSyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDL0YsQ0FBQyxDQUFDO0NBRUgsQ0FBQztJQUNBO1FBQ0UsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBWSxFQUFFLEVBQUU7WUFDckQsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLE9BQU8sQ0FBQyxhQUFhLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFO2dCQUM1RSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7YUFDN0M7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxlQUFlLENBQUMsSUFBWSxFQUFFLE9BQVk7UUFDeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDYixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxJQUFJLENBQUMsV0FBbUIsRUFBRSxVQUFlLEVBQUU7UUFDekMsT0FBTyxDQUFDLElBQUksR0FBRyxXQUFXLENBQUM7UUFDM0IsT0FBTyxDQUFDLElBQUksR0FBRyxpQkFBaUIsQ0FBQztRQUNqQyxPQUFPLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUdEOzs7Ozs7Ozs7Ozs7OztPQWNHO0lBQ0gsSUFBSSxDQUFDLEVBQU87UUFDVixPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQUU7WUFDZixJQUFJO2dCQUNGLE9BQU8sRUFBRSxFQUFFLENBQUM7YUFDYjtZQUFDLE9BQU8sS0FBSyxFQUFFO2dCQUNkLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3hDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBFbWJlciA9IHdpbmRvdy5FbWJlcjtcbmNvbnN0IHsgT2JqZWN0OiBFbWJlck9iamVjdCwgY29tcHV0ZWQsIHJ1biB9ID0gRW1iZXI7XG5jb25zdCB7IG9uZVdheSB9ID0gY29tcHV0ZWQ7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFBvcnQgZXh0ZW5kcyBFbWJlck9iamVjdC5leHRlbmQoRW1iZXIuRXZlbnRlZCwge1xuICBhZGFwdGVyOiBvbmVXYXkoJ25hbWVzcGFjZS5hZGFwdGVyJykucmVhZE9ubHkoKSxcblxuICAvKipcbiAgICogU3RvcmVzIHRoZSB0aW1lc3RhbXAgd2hlbiBpdCB3YXMgZmlyc3QgYWNjZXNzZWQuXG4gICAqXG4gICAqIEBwcm9wZXJ0eSBub3dcbiAgICogQHR5cGUge051bWJlcn1cbiAgICovXG4gIG5vdzogY29tcHV0ZWQoKCkgPT4gRGF0ZS5ub3coKSksXG5cbiAgLyoqXG4gICAqIFVuaXF1ZSBpZCBwZXIgYXBwbGNpYXRpb24gKG5vdCBhcHBsaWNhdGlvbiBpbnN0YW5jZSkuIEl0J3MgdmVyeSBpbXBvcnRhbnRcbiAgICogdGhhdCB0aGlzIGlkIGRvZXNuJ3QgY2hhbmdlIHdoZW4gdGhlIGFwcCBpcyByZXNldCBvdGhlcndpc2UgdGhlIGluc3BlY3RvclxuICAgKiB3aWxsIG5vIGxvbmdlciByZWNvZ25pemUgdGhlIGFwcC5cbiAgICpcbiAgICogQHByb3BlcnR5IHVuaXF1ZUlkXG4gICAqIEB0eXBlIHtTdHJpbmd9XG4gICAqL1xuICB1bmlxdWVJZDogY29tcHV0ZWQoJ25hbWVzcGFjZS5hcHBsaWNhdGlvbklkJywgJ25vdycsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBgJHt0aGlzLmdldCgnbmFtZXNwYWNlLmFwcGxpY2F0aW9uSWQnKX1fXyR7d2luZG93LmxvY2F0aW9uLmhyZWZ9X18ke3RoaXMuZ2V0KCdub3cnKX1gO1xuICB9KSxcblxufSkge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuZ2V0KCdhZGFwdGVyJykub25NZXNzYWdlUmVjZWl2ZWQoKG1lc3NhZ2U6IGFueSkgPT4ge1xuICAgICAgaWYgKHRoaXMuZ2V0KCd1bmlxdWVJZCcpID09PSBtZXNzYWdlLmFwcGxpY2F0aW9uSWQgfHwgIW1lc3NhZ2UuYXBwbGljYXRpb25JZCkge1xuICAgICAgICB0aGlzLm1lc3NhZ2VSZWNlaXZlZChtZXNzYWdlLnR5cGUsIG1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgbWVzc2FnZVJlY2VpdmVkKG5hbWU6IHN0cmluZywgbWVzc2FnZTogYW55KSB7XG4gICAgdGhpcy53cmFwKCgpID0+IHtcbiAgICAgIHRoaXMudHJpZ2dlcihuYW1lLCBtZXNzYWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHNlbmQobWVzc2FnZVR5cGU6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICBvcHRpb25zLnR5cGUgPSBtZXNzYWdlVHlwZTtcbiAgICBvcHRpb25zLmZyb20gPSAnaW5zcGVjdGVkV2luZG93JztcbiAgICBvcHRpb25zLmFwcGxpY2F0aW9uSWQgPSB0aGlzLmdldCgndW5pcXVlSWQnKTtcbiAgICB0aGlzLmdldCgnYWRhcHRlcicpLnNlbmQob3B0aW9ucyk7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBXcmFwIGFsbCBjb2RlIHRyaWdnZXJlZCBmcm9tIG91dHNpZGUgb2ZcbiAgICogRW1iZXJEZWJ1ZyB3aXRoIHRoaXMgbWV0aG9kLlxuICAgKlxuICAgKiBgd3JhcGAgaXMgY2FsbGVkIGJ5IGRlZmF1bHRcbiAgICogb24gYWxsIGNhbGxiYWNrcyB0cmlnZ2VyZWQgYnkgYHBvcnRgLFxuICAgKiBzbyBubyBuZWVkIHRvIGNhbGwgaXQgaW4gdGhpcyBjYXNlLlxuICAgKlxuICAgKiAtIFdyYXBzIGEgY2FsbGJhY2sgaW4gYEVtYmVyLnJ1bmAuXG4gICAqIC0gQ2F0Y2hlcyBhbGwgZXJyb3JzIGR1cmluZyBwcm9kdWN0aW9uXG4gICAqIGFuZCBkaXNwbGF5cyB0aGVtIGluIGEgdXNlciBmcmllbmRseSBtYW5uZXIuXG4gICAqXG4gICAqIEBtZXRob2Qgd3JhcFxuICAgKiBAcmV0dXJuIFRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIHBhc3NlZCBmdW5jdGlvblxuICAgKi9cbiAgd3JhcChmbjogYW55KSB7XG4gICAgcmV0dXJuIHJ1bih0aGlzLCBmdW5jdGlvbigpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBmbigpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhpcy5nZXQoJ2FkYXB0ZXInKS5oYW5kbGVFcnJvcihlcnJvcik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0iXX0=