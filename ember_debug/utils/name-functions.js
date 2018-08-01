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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFtZS1mdW5jdGlvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJuYW1lLWZ1bmN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFHQTs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsU0FBUyxDQUFDLEtBQVU7SUFDbEMsSUFBSSxJQUFJLEdBQUcsaUJBQWlCLENBQUM7SUFDN0IsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFO1FBQ2xCLElBQUksR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDekI7SUFFRCxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFO1FBQ3BCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUM7S0FDbkM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLEtBQVU7SUFDdkMsSUFBSSxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVCLHVDQUF1QztJQUN2QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxjQUFjLENBQUMsVUFBc0I7SUFDbkQsT0FBTyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDL0IsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxVQUFzQjtJQUN4RCxJQUFJLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMzRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFDekQsSUFBSSxLQUFLLEVBQUU7UUFDVCxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNqQjtJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLG1CQUFtQixDQUFDLElBQVk7SUFDdkMsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNyQyxJQUFJLENBQUMsS0FBSyxFQUFFO1FBQ1YsbUVBQW1FO1FBQ25FLHdFQUF3RTtRQUN4RSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztLQUMvQjtJQUNELElBQUksS0FBSyxFQUFFO1FBQ1QsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDakI7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFDLElBQWlCO0lBQzdDLE9BQU8sbUJBQW1CLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxRQUFRLENBQUMsSUFBaUI7SUFDeEMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDekIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDb250cm9sbGVyIGZyb20gXCJAZW1iZXIvY29udHJvbGxlclwiO1xuaW1wb3J0IEVtYmVyT2JqZWN0IGZyb20gXCJAZW1iZXIvb2JqZWN0XCI7XG5cbi8qKlxuICogUmV0dXJucyBhIG1lZGl1bSBzaXplZCBtb2RlbCBuYW1lLiBNYWtlcyBzdXJlIGl0J3MgbWF4aW11bSA1MCBjaGFyYWN0ZXJzIGxvbmcuXG4gKlxuICogQG1ldGhvZCBtb2RlbE5hbWVcbiAqIEBwYXJhbSAge0FueX0gbW9kZWxcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgVGhlIG1vZGVsIG5hbWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtb2RlbE5hbWUobW9kZWw6IGFueSkge1xuICBsZXQgbmFtZSA9ICc8VW5rbm93biBtb2RlbD4nO1xuICBpZiAobW9kZWwudG9TdHJpbmcpIHtcbiAgICBuYW1lID0gbW9kZWwudG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChuYW1lLmxlbmd0aCA+IDUwKSB7XG4gICAgbmFtZSA9IGAke25hbWUuc3Vic3RyKDAsIDUwKX0uLi5gO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuXG4vKipcbiAqIFRha2VzIGFuIEVtYmVyIERhdGEgbW9kZWwgYW5kIHN0cmlwcyBvdXQgdGhlIGV4dHJhIG5vaXNlIGZyb20gdGhlIG5hbWUuXG4gKlxuICogQG1ldGhvZCBzaG9ydE1vZGVsTmFtZVxuICogQHBhcmFtICB7RFMuTW9kZWx9IG1vZGVsXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgIFRoZSBjb25jaXNlIG1vZGVsIG5hbWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG9ydE1vZGVsTmFtZShtb2RlbDogYW55KSB7XG4gIGxldCBuYW1lID0gbW9kZWxOYW1lKG1vZGVsKTtcbiAgLy8gamotYWJyYW1zLXJlc29sdmVyIGFkZHMgYGFwcEBtb2RlbDpgXG4gIHJldHVybiBuYW1lLnJlcGxhY2UoLzxbXj5dK0Btb2RlbDovZywgJzwnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjb250cm9sbGVyIG5hbWUuIFN0cmlwcyBvdXQgZXh0cmEgbm9pc2Ugc3VjaCBhcyBgc3ViY2xhc3Mgb2ZgLlxuICpcbiAqIEBtZXRob2QgY29udHJvbGxlck5hbWVcbiAqIEBwYXJhbSAge0NvbnRyb2xsZXJ9IGNvbnRyb2xsZXJcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgICBUaGUgY29udHJvbGxlciBuYW1lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb250cm9sbGVyTmFtZShjb250cm9sbGVyOiBDb250cm9sbGVyKSB7XG4gIHJldHVybiBjb250cm9sbGVyLnRvU3RyaW5nKCk7XG59XG5cbi8qKlxuICogQ2xlYW5zIHVwIHRoZSBjb250cm9sbGVyIG5hbWUgYmVmb3JlIHJldHVybmluZyBpdC5cbiAqXG4gKiBAbWV0aG9kIHNob3J0Q29udHJvbGxlck5hbWVcbiAqIEBwYXJhbSAge0NvbnRyb2xsZXJ9IGNvbnRyb2xsZXJcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgICBUaGUgc2hvcnQgY29udHJvbGxlciBuYW1lXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG9ydENvbnRyb2xsZXJOYW1lKGNvbnRyb2xsZXI6IENvbnRyb2xsZXIpIHtcbiAgbGV0IG5hbWUgPSBjbGVhbnVwSW5zdGFuY2VOYW1lKGNvbnRyb2xsZXJOYW1lKGNvbnRyb2xsZXIpKTtcbiAgbGV0IG1hdGNoID0gbmFtZS5tYXRjaCgvXlxcKGdlbmVyYXRlZCAoLispIGNvbnRyb2xsZXJcXCkvKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgcmV0dXJuIG1hdGNoWzFdO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuXG4vKipcbiAqIENsZWFucyB1cCBhbiBpbnN0YW5jZSBuYW1lIHRvIGNyZWF0ZSBzaG9ydGVyL2xlc3Mgbm9pc3kgbmFtZXMuXG4gKiBFeGFtcGxlOiBgPGFwcEBjb21wb25lbnQ6dGV4dGFyZWE6OmVtYmVyNTQ1PmAgYmVjb21lcyBgdGV4dGFyZWFgLlxuICpcbiAqIEBtZXRob2QgY2xlYW51cEluc3RhbmNlTmFtZVxuICogQHBhcmFtICB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBzaG9ydC9jbGVhbmVyIG5hbWVcbiAqL1xuZnVuY3Rpb24gY2xlYW51cEluc3RhbmNlTmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgbGV0IG1hdGNoID0gbmFtZS5tYXRjaCgvXi4rOiguKyk6Oi8pO1xuICBpZiAoIW1hdGNoKSB7XG4gICAgLy8gU3VwcG9ydCBmb3IgTmFtZXNwYWNlIG5hbWVzIChpbnN0ZWFkIG9mIG1vZHVsZSkgKGZvciB0aGUgdGVzdHMpLlxuICAgIC8vIGA8QXBwLkFwcGxpY2F0aW9uQ29udHJvbGxlcjplbWJlcjMwMT5gID0+IGBBcHAuQXBwbGljYXRpb25Db250cm9sbGVyYFxuICAgIG1hdGNoID0gbmFtZS5tYXRjaCgvXjwoLispOi8pO1xuICB9XG4gIGlmIChtYXRjaCkge1xuICAgIHJldHVybiBtYXRjaFsxXTtcbiAgfVxuICByZXR1cm4gbmFtZTtcbn1cblxuLyoqXG4gKiBDbGVhbnMgdXAgdGhlIHZpZXcgbmFtZSBiZWZvcmUgcmV0dXJuaW5nIGl0LlxuICpcbiAqIEBtZXRob2Qgc2hvcnRWaWV3TmFtZVxuICogQHBhcmFtICB7Q29tcG9uZW50fSB2aWV3IFRoZSBjb21wb25lbnQuXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgVGhlIHNob3J0IHZpZXcgbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNob3J0Vmlld05hbWUodmlldzogRW1iZXJPYmplY3QpIHtcbiAgcmV0dXJuIGNsZWFudXBJbnN0YW5jZU5hbWUodmlld05hbWUodmlldykpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHZpZXcgbmFtZS4gUmVtb3ZlcyB0aGUgYHN1YmNsYXNzYCBub2lzZS5cbiAqXG4gKiBAbWV0aG9kIHZpZXdOYW1lXG4gKiBAcGFyYW0gIHtDb21wb25lbnR9IHZpZXcgVGhlIGNvbXBvbmVudC5cbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICBUaGUgdmlldyBuYW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmlld05hbWUodmlldzogRW1iZXJPYmplY3QpIHtcbiAgcmV0dXJuIHZpZXcudG9TdHJpbmcoKTtcbn1cbiJdfQ==