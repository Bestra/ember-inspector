/**
 * Returns a medium sized model name. Makes sure it's maximum 50 characters long.
 *
 * @method modelName
 * @param  {Any} model
 * @return {String}       The model name.
 */
export function modelName(model) {
    let name = '<Unknown model>';
    if (model.toString) {
        name = model.toString();
    }
    if (name.length > 50) {
        name = `${name.substr(0, 50)}...`;
    }
    return name;
}
/**
 * Takes an Ember Data model and strips out the extra noise from the name.
 *
 * @method shortModelName
 * @param  {DS.Model} model
 * @return {String}       The concise model name.
 */
export function shortModelName(model) {
    let name = modelName(model);
    // jj-abrams-resolver adds `app@model:`
    return name.replace(/<[^>]+@model:/g, '<');
}
/**
 * Returns the controller name. Strips out extra noise such as `subclass of`.
 *
 * @method controllerName
 * @param  {Controller} controller
 * @return {String}            The controller name
 */
export function controllerName(controller) {
    return controller.toString();
}
/**
 * Cleans up the controller name before returning it.
 *
 * @method shortControllerName
 * @param  {Controller} controller
 * @return {String}            The short controller name
 */
export function shortControllerName(controller) {
    let name = cleanupInstanceName(controllerName(controller));
    let match = name.match(/^\(generated (.+) controller\)/);
    if (match) {
        return match[1];
    }
    return name;
}
/**
 * Cleans up an instance name to create shorter/less noisy names.
 * Example: `<app@component:textarea::ember545>` becomes `textarea`.
 *
 * @method cleanupInstanceName
 * @param  {String} name
 * @return {String} The short/cleaner name
 */
function cleanupInstanceName(name) {
    let match = name.match(/^.+:(.+)::/);
    if (!match) {
        // Support for Namespace names (instead of module) (for the tests).
        // `<App.ApplicationController:ember301>` => `App.ApplicationController`
        match = name.match(/^<(.+):/);
    }
    if (match) {
        return match[1];
    }
    return name;
}
/**
 * Cleans up the view name before returning it.
 *
 * @method shortViewName
 * @param  {Component} view The component.
 * @return {String}      The short view name.
 */
export function shortViewName(view) {
    return cleanupInstanceName(viewName(view));
}
/**
 * Returns the view name. Removes the `subclass` noise.
 *
 * @method viewName
 * @param  {Component} view The component.
 * @return {String}      The view name.
 */
export function viewName(view) {
    return view.toString();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFtZS1mdW5jdGlvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJuYW1lLWZ1bmN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsU0FBUyxDQUFDLEtBQUs7SUFDN0IsSUFBSSxJQUFJLEdBQUcsaUJBQWlCLENBQUM7SUFDN0IsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFO1FBQ2xCLElBQUksR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDekI7SUFFRCxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFO1FBQ3BCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUM7S0FDbkM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLEtBQUs7SUFDbEMsSUFBSSxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVCLHVDQUF1QztJQUN2QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxjQUFjLENBQUMsVUFBVTtJQUN2QyxPQUFPLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUMvQixDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLG1CQUFtQixDQUFDLFVBQVU7SUFDNUMsSUFBSSxJQUFJLEdBQUcsbUJBQW1CLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0lBQ3pELElBQUksS0FBSyxFQUFFO1FBQ1QsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDakI7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7Ozs7OztHQU9HO0FBQ0gsU0FBUyxtQkFBbUIsQ0FBQyxJQUFJO0lBQy9CLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDckMsSUFBSSxDQUFDLEtBQUssRUFBRTtRQUNWLG1FQUFtRTtRQUNuRSx3RUFBd0U7UUFDeEUsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7S0FDL0I7SUFDRCxJQUFJLEtBQUssRUFBRTtRQUNULE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2pCO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxJQUFJO0lBQ2hDLE9BQU8sbUJBQW1CLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxRQUFRLENBQUMsSUFBSTtJQUMzQixPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUN6QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBSZXR1cm5zIGEgbWVkaXVtIHNpemVkIG1vZGVsIG5hbWUuIE1ha2VzIHN1cmUgaXQncyBtYXhpbXVtIDUwIGNoYXJhY3RlcnMgbG9uZy5cbiAqXG4gKiBAbWV0aG9kIG1vZGVsTmFtZVxuICogQHBhcmFtICB7QW55fSBtb2RlbFxuICogQHJldHVybiB7U3RyaW5nfSAgICAgICBUaGUgbW9kZWwgbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1vZGVsTmFtZShtb2RlbCkge1xuICBsZXQgbmFtZSA9ICc8VW5rbm93biBtb2RlbD4nO1xuICBpZiAobW9kZWwudG9TdHJpbmcpIHtcbiAgICBuYW1lID0gbW9kZWwudG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChuYW1lLmxlbmd0aCA+IDUwKSB7XG4gICAgbmFtZSA9IGAke25hbWUuc3Vic3RyKDAsIDUwKX0uLi5gO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuXG4vKipcbiAqIFRha2VzIGFuIEVtYmVyIERhdGEgbW9kZWwgYW5kIHN0cmlwcyBvdXQgdGhlIGV4dHJhIG5vaXNlIGZyb20gdGhlIG5hbWUuXG4gKlxuICogQG1ldGhvZCBzaG9ydE1vZGVsTmFtZVxuICogQHBhcmFtICB7RFMuTW9kZWx9IG1vZGVsXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgIFRoZSBjb25jaXNlIG1vZGVsIG5hbWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG9ydE1vZGVsTmFtZShtb2RlbCkge1xuICBsZXQgbmFtZSA9IG1vZGVsTmFtZShtb2RlbCk7XG4gIC8vIGpqLWFicmFtcy1yZXNvbHZlciBhZGRzIGBhcHBAbW9kZWw6YFxuICByZXR1cm4gbmFtZS5yZXBsYWNlKC88W14+XStAbW9kZWw6L2csICc8Jyk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY29udHJvbGxlciBuYW1lLiBTdHJpcHMgb3V0IGV4dHJhIG5vaXNlIHN1Y2ggYXMgYHN1YmNsYXNzIG9mYC5cbiAqXG4gKiBAbWV0aG9kIGNvbnRyb2xsZXJOYW1lXG4gKiBAcGFyYW0gIHtDb250cm9sbGVyfSBjb250cm9sbGVyXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgICAgVGhlIGNvbnRyb2xsZXIgbmFtZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29udHJvbGxlck5hbWUoY29udHJvbGxlcikge1xuICByZXR1cm4gY29udHJvbGxlci50b1N0cmluZygpO1xufVxuXG4vKipcbiAqIENsZWFucyB1cCB0aGUgY29udHJvbGxlciBuYW1lIGJlZm9yZSByZXR1cm5pbmcgaXQuXG4gKlxuICogQG1ldGhvZCBzaG9ydENvbnRyb2xsZXJOYW1lXG4gKiBAcGFyYW0gIHtDb250cm9sbGVyfSBjb250cm9sbGVyXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgICAgVGhlIHNob3J0IGNvbnRyb2xsZXIgbmFtZVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvcnRDb250cm9sbGVyTmFtZShjb250cm9sbGVyKSB7XG4gIGxldCBuYW1lID0gY2xlYW51cEluc3RhbmNlTmFtZShjb250cm9sbGVyTmFtZShjb250cm9sbGVyKSk7XG4gIGxldCBtYXRjaCA9IG5hbWUubWF0Y2goL15cXChnZW5lcmF0ZWQgKC4rKSBjb250cm9sbGVyXFwpLyk7XG4gIGlmIChtYXRjaCkge1xuICAgIHJldHVybiBtYXRjaFsxXTtcbiAgfVxuICByZXR1cm4gbmFtZTtcbn1cblxuLyoqXG4gKiBDbGVhbnMgdXAgYW4gaW5zdGFuY2UgbmFtZSB0byBjcmVhdGUgc2hvcnRlci9sZXNzIG5vaXN5IG5hbWVzLlxuICogRXhhbXBsZTogYDxhcHBAY29tcG9uZW50OnRleHRhcmVhOjplbWJlcjU0NT5gIGJlY29tZXMgYHRleHRhcmVhYC5cbiAqXG4gKiBAbWV0aG9kIGNsZWFudXBJbnN0YW5jZU5hbWVcbiAqIEBwYXJhbSAge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7U3RyaW5nfSBUaGUgc2hvcnQvY2xlYW5lciBuYW1lXG4gKi9cbmZ1bmN0aW9uIGNsZWFudXBJbnN0YW5jZU5hbWUobmFtZSkge1xuICBsZXQgbWF0Y2ggPSBuYW1lLm1hdGNoKC9eLis6KC4rKTo6Lyk7XG4gIGlmICghbWF0Y2gpIHtcbiAgICAvLyBTdXBwb3J0IGZvciBOYW1lc3BhY2UgbmFtZXMgKGluc3RlYWQgb2YgbW9kdWxlKSAoZm9yIHRoZSB0ZXN0cykuXG4gICAgLy8gYDxBcHAuQXBwbGljYXRpb25Db250cm9sbGVyOmVtYmVyMzAxPmAgPT4gYEFwcC5BcHBsaWNhdGlvbkNvbnRyb2xsZXJgXG4gICAgbWF0Y2ggPSBuYW1lLm1hdGNoKC9ePCguKyk6Lyk7XG4gIH1cbiAgaWYgKG1hdGNoKSB7XG4gICAgcmV0dXJuIG1hdGNoWzFdO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuXG4vKipcbiAqIENsZWFucyB1cCB0aGUgdmlldyBuYW1lIGJlZm9yZSByZXR1cm5pbmcgaXQuXG4gKlxuICogQG1ldGhvZCBzaG9ydFZpZXdOYW1lXG4gKiBAcGFyYW0gIHtDb21wb25lbnR9IHZpZXcgVGhlIGNvbXBvbmVudC5cbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICBUaGUgc2hvcnQgdmlldyBuYW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvcnRWaWV3TmFtZSh2aWV3KSB7XG4gIHJldHVybiBjbGVhbnVwSW5zdGFuY2VOYW1lKHZpZXdOYW1lKHZpZXcpKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB2aWV3IG5hbWUuIFJlbW92ZXMgdGhlIGBzdWJjbGFzc2Agbm9pc2UuXG4gKlxuICogQG1ldGhvZCB2aWV3TmFtZVxuICogQHBhcmFtICB7Q29tcG9uZW50fSB2aWV3IFRoZSBjb21wb25lbnQuXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgVGhlIHZpZXcgbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZpZXdOYW1lKHZpZXcpIHtcbiAgcmV0dXJuIHZpZXcudG9TdHJpbmcoKTtcbn1cbiJdfQ==