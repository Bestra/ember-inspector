/**
 * This class contains functionality related to for Ember versions
 * using Glimmer 2 (Ember >= 2.9):
 *
 * It has the following main responsibilities:
 *
 * - Building the view tree.
 * - Highlighting components/outlets when the view tree is hovered.
 * - Highlighting components/outlets when the views themselves are hovered.
 * - Finding the model of a specific outlet/component.
 *
 * The view tree is a hierarchy of nodes (optionally) containing the following info:
 * - name
 * - template
 * - id
 * - view class
 * - duration
 * - tag name
 * - model
 * - controller
 * - type
 *
 * Once the view tree is generated it can be sent to the Ember Inspector to be displayed.
 *
 * @class GlimmerTree
 */
const Ember = window.Ember;
import { modelName as getModelName, shortModelName as getShortModelName, shortControllerName as getShortControllerName, shortViewName as getShortViewName, } from 'ember-debug/utils/name-functions';
const { Object: EmberObject, typeOf, isNone, Controller, ViewUtils, get, A, } = Ember;
const { getRootViews, getChildViews, getViewBoundingClientRect } = ViewUtils;
export default class {
    /**
     * Sets up the initial options.
     *
     * @method constructor
     * @param {Object} options
     *  - {owner}      owner           The Ember app's owner.
     *  - {Function}   retainObject    Called to retain an object for future inspection.
     *  - {Object}     options         Options whether to show components or not.
     *  - {Object}     durations       Hash containing time to render per view id.
     *  - {Function}   highlightRange  Called to highlight a range of elements.
     *  - {Object}     ObjectInspector Used to inspect models.
     *  - {Object}     viewRegistry    Hash containing all currently rendered components by id.
     */
    constructor({ owner, retainObject, options, durations, highlightRange, objectInspector, viewRegistry, }) {
        this.owner = owner;
        this.retainObject = retainObject;
        this.options = options;
        this.durations = durations;
        this.highlightRange = highlightRange;
        this.objectInspector = objectInspector;
        this.viewRegistry = viewRegistry;
    }
    /**
     * @method updateOptions
     * @param {Object} options
     */
    updateOptions(options) {
        this.options = options;
    }
    /**
     * @method updateDurations
     * @param {Object} durations
     */
    updateDurations(durations) {
        this.durations = durations;
    }
    /**
     * Builds the view tree. The view tree may or may not contain
     * components depending on the current options.
     *
     * The view tree has the top level outlet as the root of the tree.
     * The format is:
     * {
     *   value: |hash of properties|,
     *   children: [
     *   {
     *     value: |hash of properties|,
     *     children: []
     *   },
     *   {
     *     value: |hash of properties|,
     *     children: [...]
     *   }]
     * }
     *
     * We are building the tree is by doing the following steps:
     * - Build the outlet tree by walking the outlet state.
     * - Build several component trees, each tree belonging to one controller.
     * - Assign each controller-specific component tree as a child of the outlet corresponding
     * to that specific controller.
     *
     * @method build
     * @return The view tree
     */
    build() {
        if (this.getRoot()) {
            let outletTree = this.buildOutletTree();
            let componentTrees = this.options.components
                ? this.buildComponentTrees(outletTree)
                : [];
            return this.addComponentsToOutlets(outletTree, componentTrees);
        }
    }
    /**
     * Starts with the root and walks the tree till
     * the leaf outlets. The format is:
     * {
     *   value: |inspected outlet|,
     *   children:
     *   [
     *    {
     *      value: |inspected outlet|,
     *      children: [...]
     *    }
     *   ]
     * }
     *
     * @method buildOutletTree
     * @return Tree of inspected outlets
     */
    buildOutletTree() {
        let outletTree = this.makeOutletTree(this.getApplicationOutlet());
        // set root element's id
        let rootElement = this.elementForRoot();
        if (rootElement instanceof HTMLElement) {
            outletTree.value.elementId = rootElement.getAttribute('id');
        }
        outletTree.value.tagName = 'div';
        return outletTree;
    }
    /**
     * The recursive part of building the outlet tree.
     *
     * Return format:
     * {
     *   value: |inspected outlet|
     *   controller: |controller instance|
     *   children: [...]
     * }
     *
     * @method makeOutletTree
     * @param  {Object} outletState
     * @return {Object}             The inspected outlet tree
     */
    makeOutletTree(outletState) {
        let { render: { controller }, outlets, } = outletState;
        let node = {
            value: this.inspectOutlet(outletState),
            controller,
            children: [],
        };
        for (let key in outlets) {
            // disconnectOutlet() resets the controller value as undefined (https://github.com/emberjs/ember.js/blob/v2.6.2/packages/ember-routing/lib/system/route.js#L2048).
            // So skip building the tree, if the outletState doesn't have a controller.
            if (this.controllerForOutlet(outlets[key])) {
                node.children.push(this.makeOutletTree(outlets[key]));
            }
        }
        return node;
    }
    /**
     * Builds the component trees. Each tree corresponds to one controller.
     * A component's controller is determined by its target (or ancestor's target).
     *
     * Has the following format:
     * {
     *   controller: |The controller instance|,
     *   components: [|component tree|]
     * }
     *
     * @method buildComponentTrees
     * @param  {Object} outletTree
     * @return {Array}  The component tree
     */
    buildComponentTrees(outletTree) {
        let controllers = this.controllersFromOutletTree(outletTree);
        return controllers.map(controller => {
            let components = this.componentsForController(this.topComponents(), controller);
            return { controller, components };
        });
    }
    /**
     * Builds a tree of components that have a specific controller
     * as their target. If a component does not match the given
     * controller, we ignore it and move on to its children.
     *
     * Format:
     * [
     *   {
     *     value: |inspected component|,
     *     children: [...]
     *   },
     *   {
     *     value: |inspected component|
     *     children: [{
     *       value: |inspected component|
     *       children: [...]
     *     }]
     *   }
     * ]
     *
     * @method componentsForController
     * @param  {Array} components Subtree of components
     * @param  {Controller} controller
     * @return {Array}  Array of inspected components
     */
    componentsForController(components, controller) {
        let arr = [];
        components.forEach(component => {
            let currentController = this.controllerForComponent(component);
            if (!currentController) {
                return;
            }
            let children = this.componentsForController(this.childComponents(component), controller);
            if (currentController === controller) {
                arr.push({ value: this.inspectComponent(component), children });
            }
            else {
                arr = arr.concat(children);
            }
        });
        return arr;
    }
    /**
     * Given a component, return its children.
     *
     * @method childComponents
     * @param  {Component} component The parent component
     * @return {Array}  Array of components (children)
     */
    childComponents(component) {
        return getChildViews(component);
    }
    /**
     * Get the top level components.
     *
     * @method topComponents
     * @return {Array}  Array of components
     */
    topComponents() {
        return getRootViews(this.owner);
    }
    /**
     * Assign each component tree to it matching outlet
     * by comparing controllers.
     *
     * Return format:
     * {
     *   value: |inspected root outlet|
     *   children: [
     *     {
     *       value: |inspected outlet or component|
     *       chidren: [...]
     *     },
     *     {
     *       value: |inspected outlet or component|
     *       chidren: [...]
     *     }
     *   ]
     * }
     *
     * @method addComponentsToOutlets
     * @param {Object} outletTree
     * @param {Object} componentTrees
     */
    addComponentsToOutlets(outletTree, componentTrees) {
        let { value, controller, children } = outletTree;
        let newChildren = children.map(child => this.addComponentsToOutlets(child, componentTrees));
        let { components } = A(componentTrees).findBy('controller', controller) || {
            components: [],
        };
        return { value, children: newChildren.concat(components) };
    }
    /**
     * @method controllersFromOutletTree
     *
     * @param  {Controller} inspectedOutlet
     * @return {Array} List of controllers
     */
    controllersFromOutletTree({ controller, children, }) {
        return [controller].concat(...children.map(this.controllersFromOutletTree.bind(this)));
    }
    /**
     * @method getRouter
     * @return {Router}
     */
    getRouter() {
        return this.owner.lookup('router:main');
    }
    /**
     * Returns the current top level view.
     *
     * @method getRoot
     * @return {OutletView}
     */
    getRoot() {
        return this.getRouter().get('_toplevelView');
    }
    /**
     * Returns the application (top) outlet.
     *
     * @return The application outlet state
     */
    getApplicationOutlet() {
        // Support multiple paths to outletState for various Ember versions
        const outletState = this.getRoot().outletState || this.getRoot().state.ref.outletState;
        return outletState.outlets.main;
    }
    /**
     * The root's DOM element. The root is the only outlet view
     * with a DOM element.
     *
     * @method elementForRoot
     * @return {Element}
     */
    elementForRoot() {
        let renderer = this.owner.lookup('renderer:-dom');
        return (renderer._roots &&
            renderer._roots[0] &&
            renderer._roots[0].result &&
            renderer._roots[0].result.firstNode());
    }
    /**
     * Returns a component's template name.
     *
     * @method templateForComponent
     * @param  {Component} component
     * @return The template name
     */
    templateForComponent(component) {
        let template = component.get('layoutName');
        if (!template) {
            let layout = component.get('layout');
            if (!layout) {
                let componentName = component.get('_debugContainerKey');
                if (componentName) {
                    let layoutName = componentName.replace(/component:/, 'template:components/');
                    layout = this.owner.lookup(layoutName);
                }
            }
            template = this.nameFromLayout(layout);
        }
        return template;
    }
    /**
     * Inspects and outlet state. Extracts the name, controller, template,
     * and model.
     *
     * @method inspectOutlet
     * @param  {Object} outlet The outlet state
     * @return {Object}        The inspected outlet
     */
    inspectOutlet(outlet) {
        let name = this.nameForOutlet(outlet);
        let template = this.templateForOutlet(outlet);
        let controller = this.controllerForOutlet(outlet);
        let value = {
            controller: this.inspectController(controller),
            template,
            name,
            elementId: null,
            isComponent: false,
            // Outlets (except root) don't have elements
            tagName: '',
            model: null,
        };
        let model = controller.get('model');
        if (model) {
            value.model = this.inspectModel(model);
        }
        return value;
    }
    /**
     * Represents the controller as a short and long name + guid.
     *
     * @method inspectController
     * @param  {Controller} controller
     * @return {Object}               The inspected controller.
     */
    inspectController(controller) {
        return {
            name: getShortControllerName(controller),
            completeName: getShortControllerName(controller),
            objectId: this.retainObject(controller),
        };
    }
    /**
     * Represent a component as a hash containing a template,
     * name, objectId, class, render duration, tag, model.
     *
     * @method inspectComponent
     * @param  {Component} component
     * @return {Object}             The inspected component
     */
    inspectComponent(component) {
        let viewClass = getShortViewName(component);
        let completeViewClass = viewClass;
        let tagName = component.get('tagName');
        let objectId = this.retainObject(component);
        let duration = this.durations[objectId];
        let name = getShortViewName(component);
        let template = this.templateForComponent(component);
        let value = {
            template,
            name,
            objectId,
            viewClass,
            duration,
            model: null,
            completeViewClass,
            isComponent: true,
            tagName: isNone(tagName) ? 'div' : tagName,
        };
        let model = this.modelForComponent(component);
        if (model) {
            value.model = this.inspectModel(model);
        }
        return value;
    }
    /**
     * Simply returns the component's model if it
     * has one.
     *
     * @method modelForComponent
     * @param  {Component} component
     * @return {Any}            The model property
     */
    modelForComponent(component) {
        return component.get('model');
    }
    /**
     * Represent a model as a short name, long name,
     * guid, and type.
     *
     * @method inspectModel
     * @param  {Any} model
     * @return {Object}       The inspected model.
     */
    inspectModel(model) {
        if (EmberObject.detectInstance(model) || typeOf(model) === 'array') {
            return {
                name: getShortModelName(model),
                completeName: getModelName(model),
                objectId: this.retainObject(model),
                type: 'type-ember-object',
            };
        }
        return {
            name: this.objectInspector.inspect(model),
            type: `type-${typeOf(model)}`,
        };
    }
    /**
     * Uses the module name that was set during compilation.
     *
     * @method nameFromLayout
     * @param  {Layout} layout
     * @return {String}        The layout's name
     */
    nameFromLayout(layout) {
        let moduleName = layout && get(layout, 'meta.moduleName');
        if (moduleName) {
            return moduleName.replace(/\.hbs$/, '');
        }
        else {
            return null;
        }
    }
    /**
     * Taekes an outlet state and extracts the controller from it.
     *
     * @method controllerForOutlet
     * @param  {Controller} outletState
     * @return {Controller}
     */
    controllerForOutlet(outletState) {
        return outletState.render.controller;
    }
    /**
     * The outlet's name.
     *
     * @method nameForOutlet
     * @param  {Object} outletState
     * @return {String}
     */
    nameForOutlet(outletState) {
        return outletState.render.name;
    }
    /**
     * The outlet's template name. Uses the module name attached during compilation.
     *
     * @method templateForOutlet
     * @param  {Object} outletState
     * @return {String}             The template name
     */
    templateForOutlet(outletState) {
        let template = outletState.render.template;
        return this.nameFromLayout(template);
    }
    /**
     * Returns a component's controller. The controller is either the component's
     * target object, or the target object of one of its ancestors. That is why
     * the method is recursive.
     *
     * @method controllerForComponent
     * @param  {Component} component
     * @return {Controller}           The target controller.
     */
    controllerForComponent(component) {
        let controller = component.get('_targetObject');
        if (!controller) {
            return null;
        }
        if (controller instanceof Controller) {
            return controller;
        }
        else {
            return this.controllerForComponent(controller);
        }
    }
    /**
     * Renders a rectangle around a component's element. This happens
     * when the user either hovers over the view tree components
     * or clicks on the "inspect" magnifying glass and starts
     * hovering over the components themselves.
     *
     * Pass `isPreview` if you want the highlight to be hidden
     * when the mouse leaves the component. Set `isPreview` to false
     * to render a [permanent] rectangle until the (x) button is clicked.
     *
     *
     * @method highlightComponent
     * @param  {Element}  element   The element to highlight
     * @param  {Boolean} isPreview Whether it's a preview or not
     */
    highlightComponent(component, isPreview = false) {
        let rect = getViewBoundingClientRect(component);
        let options = {
            isPreview,
            template: null,
            view: {
                name: getShortViewName(component),
                object: component,
            },
        };
        let templateName = this.templateForComponent(component);
        if (templateName) {
            options.template = {
                name: templateName,
            };
        }
        this.highlightRange(rect, options);
    }
    /**
     * Renders a rectangle around the top level outlet's element. This happens
     * when the user either hovers over the view tree root outlets
     * or clicks on the "inspect" magnifying glass and starts
     * hovering over the application template.
     *
     * Pass `isPreview` if you want the highlight to be hidden
     * when the mouse leaves the root. Set `isPreview` to false
     * to render a [permanent] rectangle until the (x) button is clicked.
     *
     * @method highlightRoot
     * @param  {Boolean} isPreview
     */
    highlightRoot(isPreview = false) {
        let applicationOutlet = this.getApplicationOutlet();
        let element = this.elementForRoot();
        if (!element) {
            return;
        }
        let options = {
            isPreview,
            model: null,
            controller: null,
            element,
            template: {
                name: this.templateForOutlet(applicationOutlet),
            },
        };
        let controller = this.controllerForOutlet(applicationOutlet);
        if (controller) {
            options.controller = {
                name: getShortControllerName(controller),
                object: controller,
            };
            let model = controller.get('model');
            if (model) {
                let modelName = this.objectInspector.inspect(model);
                options.model = {
                    name: modelName,
                    object: model,
                };
            }
        }
        let rect = this.getBoundingClientRect(element);
        this.highlightRange(rect, options);
    }
    /**
     * Same as `ViewUtils.getBoundingClientRect` except this applies to
     * HTML elements instead of components.
     *
     * @method getBoundingClientRect
     * @param  {Element} element
     * @return {DOMRect}
     */
    getBoundingClientRect(element) {
        let range = document.createRange();
        range.setStartBefore(element);
        range.setEndAfter(element);
        return range.getBoundingClientRect();
    }
    /**
     * Highlight an element only if it is a root.
     *
     * @method highlightIfRoot
     * @param  {String} elementId
     * @param isPreview
     */
    highlightIfRoot(elementId, isPreview = false) {
        let element = document.getElementById(elementId);
        if (element && this.isRootElement(element)) {
            this.highlightRoot(isPreview);
        }
    }
    /**
     * Call this method when you have the id of an element you want
     * to highlight but are unsure if that element represents a component
     * or the root outlet.
     *
     * @method highlightLayer
     * @param  {String}  elementId         The element to highlight's id
     * @param  {Boolean} [isPreview=false] Preview/Fixed
     */
    highlightLayer(elementId, isPreview = false) {
        let component = this.componentById(elementId);
        if (component) {
            this.highlightComponent(component, isPreview);
        }
        else {
            this.highlightIfRoot(elementId, isPreview);
        }
    }
    /**
     * Test if an element is the root outlet element.
     *
     * @method isRootElement
     * @param  {Element}  element
     * @return {Boolean}
     */
    isRootElement(element) {
        return this.elementForRoot() === element;
    }
    /**
     * Turn the outlet tree into an array. Useful when searching for a specific
     * outlet.
     *
     * Return format:
     * [
     *   {
     *     value: |inspected root outlet|,
     *     controller: |application controller instance|
     *   },
     *   {
     *     value: |inspected outlet|,
     *     contorller: |controller instance|
     *   }
     *   ]
     *
     * @method outletArray
     * @param  {Object} outletTree
     * @return The array of inspected outlets
     */
    outletArray(outletTree) {
        if (!outletTree) {
            outletTree = this.buildOutletTree();
        }
        let { value, controller, children } = outletTree;
        let childValues = children.map(c => this.outletArray.call(this, c));
        return [{ value, controller }].concat(...childValues);
    }
    /**
     * Returns a component when provided by its guid.
     *
     * @method componentById
     * @param  {String} id  The component's guid.
     * @return {Component}  The component.
     */
    componentById(id) {
        return this.viewRegistry[id];
    }
    /**
     * @method modelForViewNodeValue
     * @param  {Boolean} isComponent
     * @param  {Object}  inspectedNodeValue
     * @return The inspected node's model (if it has one)
     */
    modelForViewNodeValue({ isComponent, objectId, name }) {
        if (isComponent) {
            return this.modelForComponent(this.componentById(objectId));
        }
        else {
            let foundOutlet = A(this.outletArray()).findBy('value.name', name);
            if (foundOutlet) {
                let { controller } = foundOutlet;
                return controller.get('model');
            }
            else {
                return null;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xpbW1lci10cmVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2xpbW1lci10cmVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHO0FBQ0gsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUMzQixPQUFPLEVBQ0wsU0FBUyxJQUFJLFlBQVksRUFDekIsY0FBYyxJQUFJLGlCQUFpQixFQUNuQyxtQkFBbUIsSUFBSSxzQkFBc0IsRUFDN0MsYUFBYSxJQUFJLGdCQUFnQixHQUNsQyxNQUFNLGtDQUFrQyxDQUFDO0FBTTFDLE1BQU0sRUFDSixNQUFNLEVBQUUsV0FBVyxFQUNuQixNQUFNLEVBQ04sTUFBTSxFQUNOLFVBQVUsRUFDVixTQUFTLEVBQ1QsR0FBRyxFQUNILENBQUMsR0FDRixHQUFHLEtBQUssQ0FBQztBQUNWLE1BQU0sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixFQUFFLEdBQUcsU0FBUyxDQUFDO0FBcUQ3RSxNQUFNLENBQUMsT0FBTztJQVFaOzs7Ozs7Ozs7Ozs7T0FZRztJQUNILFlBQVksRUFDVixLQUFLLEVBQ0wsWUFBWSxFQUNaLE9BQU8sRUFDUCxTQUFTLEVBQ1QsY0FBYyxFQUNkLGVBQWUsRUFDZixZQUFZLEdBQ1I7UUFDSixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztJQUNuQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsYUFBYSxDQUFDLE9BQWdCO1FBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxlQUFlLENBQUMsU0FBaUI7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDN0IsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0EyQkc7SUFDSCxLQUFLO1FBQ0gsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDbEIsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3hDLElBQUksY0FBYyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVTtnQkFDMUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLENBQUM7Z0JBQ3RDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLENBQUM7U0FDaEU7SUFDSCxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQkc7SUFDSCxlQUFlO1FBQ2IsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO1FBRWxFLHdCQUF3QjtRQUN4QixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDeEMsSUFBSSxXQUFXLFlBQVksV0FBVyxFQUFFO1lBQ3RDLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDN0Q7UUFDRCxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7UUFFakMsT0FBTyxVQUFVLENBQUM7SUFDcEIsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7O09BYUc7SUFFSCxjQUFjLENBQUMsV0FBd0I7UUFDckMsSUFBSSxFQUNGLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUN0QixPQUFPLEdBQ1IsR0FBRyxXQUFXLENBQUM7UUFDaEIsSUFBSSxJQUFJLEdBQUc7WUFDVCxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7WUFDdEMsVUFBVTtZQUNWLFFBQVEsRUFBRSxFQUFXO1NBQ3RCLENBQUM7UUFDRixLQUFLLElBQUksR0FBRyxJQUFJLE9BQU8sRUFBRTtZQUN2QixrS0FBa0s7WUFDbEssMkVBQTJFO1lBQzNFLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO2dCQUMxQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDdkQ7U0FDRjtRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7O09BYUc7SUFDSCxtQkFBbUIsQ0FBQyxVQUEwQjtRQUM1QyxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFN0QsT0FBTyxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ2xDLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FDM0MsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUNwQixVQUFVLENBQ1gsQ0FBQztZQUNGLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXdCRztJQUNILHVCQUF1QixDQUNyQixVQUE0QixFQUM1QixVQUEwQjtRQUUxQixJQUFJLEdBQUcsR0FBVSxFQUFFLENBQUM7UUFDcEIsVUFBVSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUM3QixJQUFJLGlCQUFpQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ3RCLE9BQU87YUFDUjtZQUVELElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FDekMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsRUFDL0IsVUFBVSxDQUNYLENBQUM7WUFDRixJQUFJLGlCQUFpQixLQUFLLFVBQVUsRUFBRTtnQkFDcEMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQzthQUNqRTtpQkFBTTtnQkFDTCxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQzthQUM1QjtRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsZUFBZSxDQUFDLFNBQXdCO1FBQ3RDLE9BQU8sYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGFBQWE7UUFDWCxPQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09Bc0JHO0lBQ0gsc0JBQXNCLENBQ3BCLFVBQTBCLEVBQzFCLGNBQStCO1FBRS9CLElBQUksRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxHQUFHLFVBQVUsQ0FBQztRQUNqRCxJQUFJLFdBQVcsR0FBUSxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQzFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQ25ELENBQUM7UUFDRixJQUFJLEVBQUUsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUk7WUFDekUsVUFBVSxFQUFFLEVBQUU7U0FDZixDQUFDO1FBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO0lBQzdELENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILHlCQUF5QixDQUFDLEVBQ3hCLFVBQVUsRUFDVixRQUFRLEdBQ087UUFDZixPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUN4QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUMzRCxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7T0FHRztJQUNILFNBQVM7UUFDUCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILE9BQU87UUFDTCxPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxvQkFBb0I7UUFDbEIsbUVBQW1FO1FBQ25FLE1BQU0sV0FBVyxHQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1FBQ3JFLE9BQU8sV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7SUFDbEMsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILGNBQWM7UUFDWixJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsRCxPQUFPLENBQ0wsUUFBUSxDQUFDLE1BQU07WUFDZixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNsQixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07WUFDekIsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQ3RDLENBQUM7SUFDSixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsb0JBQW9CLENBQ2xCLFNBR0M7UUFFRCxJQUFJLFFBQVEsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRTNDLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDYixJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxNQUFNLEVBQUU7Z0JBQ1gsSUFBSSxhQUFhLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUN4RCxJQUFJLGFBQWEsRUFBRTtvQkFDakIsSUFBSSxVQUFVLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FDcEMsWUFBWSxFQUNaLHNCQUFzQixDQUN2QixDQUFDO29CQUNGLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztpQkFDeEM7YUFDRjtZQUNELFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3hDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSCxhQUFhLENBQUMsTUFBbUI7UUFDL0IsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDOUMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELElBQUksS0FBSyxHQUFXO1lBQ2xCLFVBQVUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDO1lBQzlDLFFBQVE7WUFDUixJQUFJO1lBQ0osU0FBUyxFQUFFLElBQUk7WUFDZixXQUFXLEVBQUUsS0FBSztZQUNsQiw0Q0FBNEM7WUFDNUMsT0FBTyxFQUFFLEVBQUU7WUFDWCxLQUFLLEVBQUUsSUFBSTtTQUNaLENBQUM7UUFFRixJQUFJLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BDLElBQUksS0FBSyxFQUFFO1lBQ1QsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3hDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsaUJBQWlCLENBQUMsVUFBMEI7UUFDMUMsT0FBTztZQUNMLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7WUFDeEMsWUFBWSxFQUFFLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztZQUNoRCxRQUFRLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUM7U0FDeEMsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0gsZ0JBQWdCLENBQUMsU0FBeUI7UUFDeEMsSUFBSSxTQUFTLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUMsSUFBSSxpQkFBaUIsR0FBRyxTQUFTLENBQUM7UUFDbEMsSUFBSSxPQUFPLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2QyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFeEMsSUFBSSxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdkMsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXBELElBQUksS0FBSyxHQUFrQjtZQUN6QixRQUFRO1lBQ1IsSUFBSTtZQUNKLFFBQVE7WUFDUixTQUFTO1lBQ1QsUUFBUTtZQUNSLEtBQUssRUFBRSxJQUFJO1lBQ1gsaUJBQWlCO1lBQ2pCLFdBQVcsRUFBRSxJQUFJO1lBQ2pCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTztTQUMzQyxDQUFDO1FBRUYsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLElBQUksS0FBSyxFQUFFO1lBQ1QsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3hDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILGlCQUFpQixDQUNmLFNBQWlEO1FBRWpELE9BQU8sU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILFlBQVksQ0FBQyxLQUFVO1FBQ3JCLElBQUksV0FBVyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssT0FBTyxFQUFFO1lBQ2xFLE9BQU87Z0JBQ0wsSUFBSSxFQUFFLGlCQUFpQixDQUFDLEtBQUssQ0FBQztnQkFDOUIsWUFBWSxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUM7Z0JBQ2pDLFFBQVEsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztnQkFDbEMsSUFBSSxFQUFFLG1CQUFtQjthQUMxQixDQUFDO1NBQ0g7UUFDRCxPQUFPO1lBQ0wsSUFBSSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztZQUN6QyxJQUFJLEVBQUUsUUFBUSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7U0FDOUIsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxjQUFjLENBQUMsTUFBVztRQUN4QixJQUFJLFVBQVUsR0FBRyxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzFELElBQUksVUFBVSxFQUFFO1lBQ2QsT0FBTyxVQUFVLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUN6QzthQUFNO1lBQ0wsT0FBTyxJQUFJLENBQUM7U0FDYjtJQUNILENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxtQkFBbUIsQ0FBQyxXQUFnQjtRQUNsQyxPQUFPLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxhQUFhLENBQUMsV0FBd0I7UUFDcEMsT0FBTyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNqQyxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsaUJBQWlCLENBQUMsV0FBd0I7UUFDeEMsSUFBSSxRQUFRLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDM0MsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILHNCQUFzQixDQUNwQixTQUF3RDtRQUV4RCxJQUFJLFVBQVUsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDZixPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsSUFBSSxVQUFVLFlBQVksVUFBVSxFQUFFO1lBQ3BDLE9BQU8sVUFBVSxDQUFDO1NBQ25CO2FBQU07WUFDTCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUNoRDtJQUNILENBQUM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7T0FjRztJQUNILGtCQUFrQixDQUFDLFNBQWMsRUFBRSxZQUFxQixLQUFLO1FBQzNELElBQUksSUFBSSxHQUFHLHlCQUF5QixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRWhELElBQUksT0FBTyxHQUFHO1lBQ1osU0FBUztZQUNULFFBQVEsRUFBRSxJQUFXO1lBQ3JCLElBQUksRUFBRTtnQkFDSixJQUFJLEVBQUUsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO2dCQUNqQyxNQUFNLEVBQUUsU0FBUzthQUNsQjtTQUNGLENBQUM7UUFFRixJQUFJLFlBQVksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEQsSUFBSSxZQUFZLEVBQUU7WUFDaEIsT0FBTyxDQUFDLFFBQVEsR0FBRztnQkFDakIsSUFBSSxFQUFFLFlBQVk7YUFDbkIsQ0FBQztTQUNIO1FBQ0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7T0FZRztJQUNILGFBQWEsQ0FBQyxZQUFxQixLQUFLO1FBQ3RDLElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDcEQsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBRXBDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDWixPQUFPO1NBQ1I7UUFFRCxJQUFJLE9BQU8sR0FBRztZQUNaLFNBQVM7WUFDVCxLQUFLLEVBQUUsSUFBa0I7WUFDekIsVUFBVSxFQUFFLElBQWtCO1lBQzlCLE9BQU87WUFDUCxRQUFRLEVBQUU7Z0JBQ1IsSUFBSSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQzthQUNoRDtTQUNGLENBQUM7UUFFRixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3RCxJQUFJLFVBQVUsRUFBRTtZQUNkLE9BQU8sQ0FBQyxVQUFVLEdBQUc7Z0JBQ25CLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7Z0JBQ3hDLE1BQU0sRUFBRSxVQUFVO2FBQ25CLENBQUM7WUFFRixJQUFJLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLElBQUksS0FBSyxFQUFFO2dCQUNULElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNwRCxPQUFPLENBQUMsS0FBSyxHQUFHO29CQUNkLElBQUksRUFBRSxTQUFTO29CQUNmLE1BQU0sRUFBRSxLQUFLO2lCQUNkLENBQUM7YUFDSDtTQUNGO1FBQ0QsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0gscUJBQXFCLENBQUMsT0FBZ0I7UUFDcEMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25DLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUIsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUzQixPQUFPLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxlQUFlLENBQUMsU0FBaUIsRUFBRSxTQUFTLEdBQUcsS0FBSztRQUNsRCxJQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pELElBQUksT0FBTyxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDMUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztTQUMvQjtJQUNILENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILGNBQWMsQ0FBQyxTQUFpQixFQUFFLFlBQXFCLEtBQUs7UUFDMUQsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM5QyxJQUFJLFNBQVMsRUFBRTtZQUNiLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDL0M7YUFBTTtZQUNMLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1NBQzVDO0lBQ0gsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILGFBQWEsQ0FBQyxPQUFnQjtRQUM1QixPQUFPLElBQUksQ0FBQyxjQUFjLEVBQUUsS0FBSyxPQUFPLENBQUM7SUFDM0MsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BbUJHO0lBQ0gsV0FBVyxDQUFDLFVBQTJCO1FBQ3JDLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDZixVQUFVLEdBQUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1NBQ3JDO1FBQ0QsSUFBSSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEdBQUcsVUFBVSxDQUFDO1FBQ2pELElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRSxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQ25DLEdBQUcsV0FBVyxDQUNmLENBQUM7SUFDSixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsYUFBYSxDQUFDLEVBQVU7UUFDdEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILHFCQUFxQixDQUFDLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQXNCO1FBQ3ZFLElBQUksV0FBVyxFQUFFO1lBQ2YsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1NBQzdEO2FBQU07WUFDTCxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNuRSxJQUFJLFdBQVcsRUFBRTtnQkFDZixJQUFJLEVBQUUsVUFBVSxFQUFFLEdBQUcsV0FBVyxDQUFDO2dCQUNqQyxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDaEM7aUJBQU07Z0JBQ0wsT0FBTyxJQUFJLENBQUM7YUFDYjtTQUNGO0lBQ0gsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUaGlzIGNsYXNzIGNvbnRhaW5zIGZ1bmN0aW9uYWxpdHkgcmVsYXRlZCB0byBmb3IgRW1iZXIgdmVyc2lvbnNcbiAqIHVzaW5nIEdsaW1tZXIgMiAoRW1iZXIgPj0gMi45KTpcbiAqXG4gKiBJdCBoYXMgdGhlIGZvbGxvd2luZyBtYWluIHJlc3BvbnNpYmlsaXRpZXM6XG4gKlxuICogLSBCdWlsZGluZyB0aGUgdmlldyB0cmVlLlxuICogLSBIaWdobGlnaHRpbmcgY29tcG9uZW50cy9vdXRsZXRzIHdoZW4gdGhlIHZpZXcgdHJlZSBpcyBob3ZlcmVkLlxuICogLSBIaWdobGlnaHRpbmcgY29tcG9uZW50cy9vdXRsZXRzIHdoZW4gdGhlIHZpZXdzIHRoZW1zZWx2ZXMgYXJlIGhvdmVyZWQuXG4gKiAtIEZpbmRpbmcgdGhlIG1vZGVsIG9mIGEgc3BlY2lmaWMgb3V0bGV0L2NvbXBvbmVudC5cbiAqXG4gKiBUaGUgdmlldyB0cmVlIGlzIGEgaGllcmFyY2h5IG9mIG5vZGVzIChvcHRpb25hbGx5KSBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgaW5mbzpcbiAqIC0gbmFtZVxuICogLSB0ZW1wbGF0ZVxuICogLSBpZFxuICogLSB2aWV3IGNsYXNzXG4gKiAtIGR1cmF0aW9uXG4gKiAtIHRhZyBuYW1lXG4gKiAtIG1vZGVsXG4gKiAtIGNvbnRyb2xsZXJcbiAqIC0gdHlwZVxuICpcbiAqIE9uY2UgdGhlIHZpZXcgdHJlZSBpcyBnZW5lcmF0ZWQgaXQgY2FuIGJlIHNlbnQgdG8gdGhlIEVtYmVyIEluc3BlY3RvciB0byBiZSBkaXNwbGF5ZWQuXG4gKlxuICogQGNsYXNzIEdsaW1tZXJUcmVlXG4gKi9cbmNvbnN0IEVtYmVyID0gd2luZG93LkVtYmVyO1xuaW1wb3J0IHtcbiAgbW9kZWxOYW1lIGFzIGdldE1vZGVsTmFtZSxcbiAgc2hvcnRNb2RlbE5hbWUgYXMgZ2V0U2hvcnRNb2RlbE5hbWUsXG4gIHNob3J0Q29udHJvbGxlck5hbWUgYXMgZ2V0U2hvcnRDb250cm9sbGVyTmFtZSxcbiAgc2hvcnRWaWV3TmFtZSBhcyBnZXRTaG9ydFZpZXdOYW1lLFxufSBmcm9tICdlbWJlci1kZWJ1Zy91dGlscy9uYW1lLWZ1bmN0aW9ucyc7XG5pbXBvcnQgQ29udHJvbGxlclR5cGUgZnJvbSAnQGVtYmVyL2NvbnRyb2xsZXInO1xuaW1wb3J0IENvbXBvbmVudFR5cGUgZnJvbSAnQGVtYmVyL2NvbXBvbmVudCc7XG5pbXBvcnQgUm91dGVyVHlwZSBmcm9tICdAZW1iZXIvcm91dGluZy9yb3V0ZXInO1xuaW1wb3J0IHsgSW5zcGVjdGVkTm9kZVZhbHVlIH0gZnJvbSAnZW1iZXItZGVidWcvbWVzc2FnZS10eXBlcyc7XG5cbmNvbnN0IHtcbiAgT2JqZWN0OiBFbWJlck9iamVjdCxcbiAgdHlwZU9mLFxuICBpc05vbmUsXG4gIENvbnRyb2xsZXIsXG4gIFZpZXdVdGlscyxcbiAgZ2V0LFxuICBBLFxufSA9IEVtYmVyO1xuY29uc3QgeyBnZXRSb290Vmlld3MsIGdldENoaWxkVmlld3MsIGdldFZpZXdCb3VuZGluZ0NsaWVudFJlY3QgfSA9IFZpZXdVdGlscztcblxuaW50ZXJmYWNlIE91dGxldFN0YXRlIHtcbiAgcmVuZGVyOiB7IGNvbnRyb2xsZXI6IGFueTsgdGVtcGxhdGU6IGFueTsgbmFtZTogYW55IH07XG4gIG91dGxldHM6IGFueTtcbn1cblxudHlwZSBEZWJ1Z0NvbXBvbmVudCA9IENvbXBvbmVudFR5cGUgJiB7XG4gIGxheW91dE5hbWU6IHN0cmluZyB8IG51bGw7XG4gIF9kZWJ1Z0NvbnRhaW5lcktleTogc3RyaW5nIHwgbnVsbDtcbiAgX3RhcmdldE9iamVjdDogYW55IHwgbnVsbDtcbn07XG5pbnRlcmZhY2UgT3V0bGV0VHJlZU5vZGUge1xuICB2YWx1ZTogT3V0bGV0O1xuICBjb250cm9sbGVyOiBhbnk7XG4gIGNoaWxkcmVuOiBPdXRsZXRUcmVlTm9kZVtdO1xufVxuaW50ZXJmYWNlIE91dGxldCB7XG4gIGNvbnRyb2xsZXI6IGFueTtcbiAgdGVtcGxhdGU6IGFueTtcbiAgbmFtZTogYW55O1xuICBpc0NvbXBvbmVudDogYm9vbGVhbjtcbiAgLy8gT3V0bGV0cyAoZXhjZXB0IHJvb3QpIGRvbid0IGhhdmUgZWxlbWVudHNcbiAgdGFnTmFtZTogc3RyaW5nO1xuICBtb2RlbDogYW55IHwgbnVsbDtcbiAgZWxlbWVudElkOiBhbnkgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgQ29tcG9uZW50U3BlYyB7XG4gIHRlbXBsYXRlOiBhbnk7XG4gIG5hbWU6IGFueTtcbiAgb2JqZWN0SWQ6IGFueTtcbiAgdmlld0NsYXNzOiBhbnk7XG4gIGR1cmF0aW9uOiBhbnk7XG4gIG1vZGVsOiBhbnkgfCBudWxsO1xuICBjb21wbGV0ZVZpZXdDbGFzczogYW55O1xuICBpc0NvbXBvbmVudDogdHJ1ZTtcbiAgdGFnTmFtZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgT3V0bGV0U3BlYyB7XG4gIHZhbHVlOiBPdXRsZXQsXG4gIGNvbnRyb2xsZXI6IENvbnRyb2xsZXJUeXBlLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9wdGlvbnMge1xuY29tcG9uZW50czogQ29tcG9uZW50VHJlZVtdXG59XG5cbmludGVyZmFjZSBDb21wb25lbnRUcmVlIHtcbiAgY29udHJvbGxlcjogYW55O1xuICBjb21wb25lbnRzOiBhbnlbXTtcbn1cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIHtcbiAgb3B0aW9uczogT3B0aW9ucztcbiAgZHVyYXRpb25zOiBhbnk7XG4gIG93bmVyOiBhbnk7XG4gIHJldGFpbk9iamVjdDogYW55O1xuICBoaWdobGlnaHRSYW5nZTogYW55O1xuICBvYmplY3RJbnNwZWN0b3I6IGFueTtcbiAgdmlld1JlZ2lzdHJ5OiBhbnk7XG4gIC8qKlxuICAgKiBTZXRzIHVwIHRoZSBpbml0aWFsIG9wdGlvbnMuXG4gICAqXG4gICAqIEBtZXRob2QgY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAgICogIC0ge293bmVyfSAgICAgIG93bmVyICAgICAgICAgICBUaGUgRW1iZXIgYXBwJ3Mgb3duZXIuXG4gICAqICAtIHtGdW5jdGlvbn0gICByZXRhaW5PYmplY3QgICAgQ2FsbGVkIHRvIHJldGFpbiBhbiBvYmplY3QgZm9yIGZ1dHVyZSBpbnNwZWN0aW9uLlxuICAgKiAgLSB7T2JqZWN0fSAgICAgb3B0aW9ucyAgICAgICAgIE9wdGlvbnMgd2hldGhlciB0byBzaG93IGNvbXBvbmVudHMgb3Igbm90LlxuICAgKiAgLSB7T2JqZWN0fSAgICAgZHVyYXRpb25zICAgICAgIEhhc2ggY29udGFpbmluZyB0aW1lIHRvIHJlbmRlciBwZXIgdmlldyBpZC5cbiAgICogIC0ge0Z1bmN0aW9ufSAgIGhpZ2hsaWdodFJhbmdlICBDYWxsZWQgdG8gaGlnaGxpZ2h0IGEgcmFuZ2Ugb2YgZWxlbWVudHMuXG4gICAqICAtIHtPYmplY3R9ICAgICBPYmplY3RJbnNwZWN0b3IgVXNlZCB0byBpbnNwZWN0IG1vZGVscy5cbiAgICogIC0ge09iamVjdH0gICAgIHZpZXdSZWdpc3RyeSAgICBIYXNoIGNvbnRhaW5pbmcgYWxsIGN1cnJlbnRseSByZW5kZXJlZCBjb21wb25lbnRzIGJ5IGlkLlxuICAgKi9cbiAgY29uc3RydWN0b3Ioe1xuICAgIG93bmVyLFxuICAgIHJldGFpbk9iamVjdCxcbiAgICBvcHRpb25zLFxuICAgIGR1cmF0aW9ucyxcbiAgICBoaWdobGlnaHRSYW5nZSxcbiAgICBvYmplY3RJbnNwZWN0b3IsXG4gICAgdmlld1JlZ2lzdHJ5LFxuICB9OiBhbnkpIHtcbiAgICB0aGlzLm93bmVyID0gb3duZXI7XG4gICAgdGhpcy5yZXRhaW5PYmplY3QgPSByZXRhaW5PYmplY3Q7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmR1cmF0aW9ucyA9IGR1cmF0aW9ucztcbiAgICB0aGlzLmhpZ2hsaWdodFJhbmdlID0gaGlnaGxpZ2h0UmFuZ2U7XG4gICAgdGhpcy5vYmplY3RJbnNwZWN0b3IgPSBvYmplY3RJbnNwZWN0b3I7XG4gICAgdGhpcy52aWV3UmVnaXN0cnkgPSB2aWV3UmVnaXN0cnk7XG4gIH1cblxuICAvKipcbiAgICogQG1ldGhvZCB1cGRhdGVPcHRpb25zXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqL1xuICB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IE9wdGlvbnMpIHtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIEBtZXRob2QgdXBkYXRlRHVyYXRpb25zXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBkdXJhdGlvbnNcbiAgICovXG4gIHVwZGF0ZUR1cmF0aW9ucyhkdXJhdGlvbnM6IG9iamVjdCkge1xuICAgIHRoaXMuZHVyYXRpb25zID0gZHVyYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIEJ1aWxkcyB0aGUgdmlldyB0cmVlLiBUaGUgdmlldyB0cmVlIG1heSBvciBtYXkgbm90IGNvbnRhaW5cbiAgICogY29tcG9uZW50cyBkZXBlbmRpbmcgb24gdGhlIGN1cnJlbnQgb3B0aW9ucy5cbiAgICpcbiAgICogVGhlIHZpZXcgdHJlZSBoYXMgdGhlIHRvcCBsZXZlbCBvdXRsZXQgYXMgdGhlIHJvb3Qgb2YgdGhlIHRyZWUuXG4gICAqIFRoZSBmb3JtYXQgaXM6XG4gICAqIHtcbiAgICogICB2YWx1ZTogfGhhc2ggb2YgcHJvcGVydGllc3wsXG4gICAqICAgY2hpbGRyZW46IFtcbiAgICogICB7XG4gICAqICAgICB2YWx1ZTogfGhhc2ggb2YgcHJvcGVydGllc3wsXG4gICAqICAgICBjaGlsZHJlbjogW11cbiAgICogICB9LFxuICAgKiAgIHtcbiAgICogICAgIHZhbHVlOiB8aGFzaCBvZiBwcm9wZXJ0aWVzfCxcbiAgICogICAgIGNoaWxkcmVuOiBbLi4uXVxuICAgKiAgIH1dXG4gICAqIH1cbiAgICpcbiAgICogV2UgYXJlIGJ1aWxkaW5nIHRoZSB0cmVlIGlzIGJ5IGRvaW5nIHRoZSBmb2xsb3dpbmcgc3RlcHM6XG4gICAqIC0gQnVpbGQgdGhlIG91dGxldCB0cmVlIGJ5IHdhbGtpbmcgdGhlIG91dGxldCBzdGF0ZS5cbiAgICogLSBCdWlsZCBzZXZlcmFsIGNvbXBvbmVudCB0cmVlcywgZWFjaCB0cmVlIGJlbG9uZ2luZyB0byBvbmUgY29udHJvbGxlci5cbiAgICogLSBBc3NpZ24gZWFjaCBjb250cm9sbGVyLXNwZWNpZmljIGNvbXBvbmVudCB0cmVlIGFzIGEgY2hpbGQgb2YgdGhlIG91dGxldCBjb3JyZXNwb25kaW5nXG4gICAqIHRvIHRoYXQgc3BlY2lmaWMgY29udHJvbGxlci5cbiAgICpcbiAgICogQG1ldGhvZCBidWlsZFxuICAgKiBAcmV0dXJuIFRoZSB2aWV3IHRyZWVcbiAgICovXG4gIGJ1aWxkKCkge1xuICAgIGlmICh0aGlzLmdldFJvb3QoKSkge1xuICAgICAgbGV0IG91dGxldFRyZWUgPSB0aGlzLmJ1aWxkT3V0bGV0VHJlZSgpO1xuICAgICAgbGV0IGNvbXBvbmVudFRyZWVzID0gdGhpcy5vcHRpb25zLmNvbXBvbmVudHNcbiAgICAgICAgPyB0aGlzLmJ1aWxkQ29tcG9uZW50VHJlZXMob3V0bGV0VHJlZSlcbiAgICAgICAgOiBbXTtcbiAgICAgIHJldHVybiB0aGlzLmFkZENvbXBvbmVudHNUb091dGxldHMob3V0bGV0VHJlZSwgY29tcG9uZW50VHJlZXMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgd2l0aCB0aGUgcm9vdCBhbmQgd2Fsa3MgdGhlIHRyZWUgdGlsbFxuICAgKiB0aGUgbGVhZiBvdXRsZXRzLiBUaGUgZm9ybWF0IGlzOlxuICAgKiB7XG4gICAqICAgdmFsdWU6IHxpbnNwZWN0ZWQgb3V0bGV0fCxcbiAgICogICBjaGlsZHJlbjpcbiAgICogICBbXG4gICAqICAgIHtcbiAgICogICAgICB2YWx1ZTogfGluc3BlY3RlZCBvdXRsZXR8LFxuICAgKiAgICAgIGNoaWxkcmVuOiBbLi4uXVxuICAgKiAgICB9XG4gICAqICAgXVxuICAgKiB9XG4gICAqXG4gICAqIEBtZXRob2QgYnVpbGRPdXRsZXRUcmVlXG4gICAqIEByZXR1cm4gVHJlZSBvZiBpbnNwZWN0ZWQgb3V0bGV0c1xuICAgKi9cbiAgYnVpbGRPdXRsZXRUcmVlKCk6IE91dGxldFRyZWVOb2RlIHtcbiAgICBsZXQgb3V0bGV0VHJlZSA9IHRoaXMubWFrZU91dGxldFRyZWUodGhpcy5nZXRBcHBsaWNhdGlvbk91dGxldCgpKTtcblxuICAgIC8vIHNldCByb290IGVsZW1lbnQncyBpZFxuICAgIGxldCByb290RWxlbWVudCA9IHRoaXMuZWxlbWVudEZvclJvb3QoKTtcbiAgICBpZiAocm9vdEVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgb3V0bGV0VHJlZS52YWx1ZS5lbGVtZW50SWQgPSByb290RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgfVxuICAgIG91dGxldFRyZWUudmFsdWUudGFnTmFtZSA9ICdkaXYnO1xuXG4gICAgcmV0dXJuIG91dGxldFRyZWU7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHJlY3Vyc2l2ZSBwYXJ0IG9mIGJ1aWxkaW5nIHRoZSBvdXRsZXQgdHJlZS5cbiAgICpcbiAgICogUmV0dXJuIGZvcm1hdDpcbiAgICoge1xuICAgKiAgIHZhbHVlOiB8aW5zcGVjdGVkIG91dGxldHxcbiAgICogICBjb250cm9sbGVyOiB8Y29udHJvbGxlciBpbnN0YW5jZXxcbiAgICogICBjaGlsZHJlbjogWy4uLl1cbiAgICogfVxuICAgKlxuICAgKiBAbWV0aG9kIG1ha2VPdXRsZXRUcmVlXG4gICAqIEBwYXJhbSAge09iamVjdH0gb3V0bGV0U3RhdGVcbiAgICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICBUaGUgaW5zcGVjdGVkIG91dGxldCB0cmVlXG4gICAqL1xuXG4gIG1ha2VPdXRsZXRUcmVlKG91dGxldFN0YXRlOiBPdXRsZXRTdGF0ZSk6IE91dGxldFRyZWVOb2RlIHtcbiAgICBsZXQge1xuICAgICAgcmVuZGVyOiB7IGNvbnRyb2xsZXIgfSxcbiAgICAgIG91dGxldHMsXG4gICAgfSA9IG91dGxldFN0YXRlO1xuICAgIGxldCBub2RlID0ge1xuICAgICAgdmFsdWU6IHRoaXMuaW5zcGVjdE91dGxldChvdXRsZXRTdGF0ZSksXG4gICAgICBjb250cm9sbGVyLFxuICAgICAgY2hpbGRyZW46IFtdIGFzIGFueVtdLFxuICAgIH07XG4gICAgZm9yIChsZXQga2V5IGluIG91dGxldHMpIHtcbiAgICAgIC8vIGRpc2Nvbm5lY3RPdXRsZXQoKSByZXNldHMgdGhlIGNvbnRyb2xsZXIgdmFsdWUgYXMgdW5kZWZpbmVkIChodHRwczovL2dpdGh1Yi5jb20vZW1iZXJqcy9lbWJlci5qcy9ibG9iL3YyLjYuMi9wYWNrYWdlcy9lbWJlci1yb3V0aW5nL2xpYi9zeXN0ZW0vcm91dGUuanMjTDIwNDgpLlxuICAgICAgLy8gU28gc2tpcCBidWlsZGluZyB0aGUgdHJlZSwgaWYgdGhlIG91dGxldFN0YXRlIGRvZXNuJ3QgaGF2ZSBhIGNvbnRyb2xsZXIuXG4gICAgICBpZiAodGhpcy5jb250cm9sbGVyRm9yT3V0bGV0KG91dGxldHNba2V5XSkpIHtcbiAgICAgICAgbm9kZS5jaGlsZHJlbi5wdXNoKHRoaXMubWFrZU91dGxldFRyZWUob3V0bGV0c1trZXldKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBub2RlO1xuICB9XG5cbiAgLyoqXG4gICAqIEJ1aWxkcyB0aGUgY29tcG9uZW50IHRyZWVzLiBFYWNoIHRyZWUgY29ycmVzcG9uZHMgdG8gb25lIGNvbnRyb2xsZXIuXG4gICAqIEEgY29tcG9uZW50J3MgY29udHJvbGxlciBpcyBkZXRlcm1pbmVkIGJ5IGl0cyB0YXJnZXQgKG9yIGFuY2VzdG9yJ3MgdGFyZ2V0KS5cbiAgICpcbiAgICogSGFzIHRoZSBmb2xsb3dpbmcgZm9ybWF0OlxuICAgKiB7XG4gICAqICAgY29udHJvbGxlcjogfFRoZSBjb250cm9sbGVyIGluc3RhbmNlfCxcbiAgICogICBjb21wb25lbnRzOiBbfGNvbXBvbmVudCB0cmVlfF1cbiAgICogfVxuICAgKlxuICAgKiBAbWV0aG9kIGJ1aWxkQ29tcG9uZW50VHJlZXNcbiAgICogQHBhcmFtICB7T2JqZWN0fSBvdXRsZXRUcmVlXG4gICAqIEByZXR1cm4ge0FycmF5fSAgVGhlIGNvbXBvbmVudCB0cmVlXG4gICAqL1xuICBidWlsZENvbXBvbmVudFRyZWVzKG91dGxldFRyZWU6IE91dGxldFRyZWVOb2RlKTogQ29tcG9uZW50VHJlZVtdIHtcbiAgICBsZXQgY29udHJvbGxlcnMgPSB0aGlzLmNvbnRyb2xsZXJzRnJvbU91dGxldFRyZWUob3V0bGV0VHJlZSk7XG5cbiAgICByZXR1cm4gY29udHJvbGxlcnMubWFwKGNvbnRyb2xsZXIgPT4ge1xuICAgICAgbGV0IGNvbXBvbmVudHMgPSB0aGlzLmNvbXBvbmVudHNGb3JDb250cm9sbGVyKFxuICAgICAgICB0aGlzLnRvcENvbXBvbmVudHMoKSxcbiAgICAgICAgY29udHJvbGxlclxuICAgICAgKTtcbiAgICAgIHJldHVybiB7IGNvbnRyb2xsZXIsIGNvbXBvbmVudHMgfTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZHMgYSB0cmVlIG9mIGNvbXBvbmVudHMgdGhhdCBoYXZlIGEgc3BlY2lmaWMgY29udHJvbGxlclxuICAgKiBhcyB0aGVpciB0YXJnZXQuIElmIGEgY29tcG9uZW50IGRvZXMgbm90IG1hdGNoIHRoZSBnaXZlblxuICAgKiBjb250cm9sbGVyLCB3ZSBpZ25vcmUgaXQgYW5kIG1vdmUgb24gdG8gaXRzIGNoaWxkcmVuLlxuICAgKlxuICAgKiBGb3JtYXQ6XG4gICAqIFtcbiAgICogICB7XG4gICAqICAgICB2YWx1ZTogfGluc3BlY3RlZCBjb21wb25lbnR8LFxuICAgKiAgICAgY2hpbGRyZW46IFsuLi5dXG4gICAqICAgfSxcbiAgICogICB7XG4gICAqICAgICB2YWx1ZTogfGluc3BlY3RlZCBjb21wb25lbnR8XG4gICAqICAgICBjaGlsZHJlbjogW3tcbiAgICogICAgICAgdmFsdWU6IHxpbnNwZWN0ZWQgY29tcG9uZW50fFxuICAgKiAgICAgICBjaGlsZHJlbjogWy4uLl1cbiAgICogICAgIH1dXG4gICAqICAgfVxuICAgKiBdXG4gICAqXG4gICAqIEBtZXRob2QgY29tcG9uZW50c0ZvckNvbnRyb2xsZXJcbiAgICogQHBhcmFtICB7QXJyYXl9IGNvbXBvbmVudHMgU3VidHJlZSBvZiBjb21wb25lbnRzXG4gICAqIEBwYXJhbSAge0NvbnRyb2xsZXJ9IGNvbnRyb2xsZXJcbiAgICogQHJldHVybiB7QXJyYXl9ICBBcnJheSBvZiBpbnNwZWN0ZWQgY29tcG9uZW50c1xuICAgKi9cbiAgY29tcG9uZW50c0ZvckNvbnRyb2xsZXIoXG4gICAgY29tcG9uZW50czogRGVidWdDb21wb25lbnRbXSxcbiAgICBjb250cm9sbGVyOiBDb250cm9sbGVyVHlwZVxuICApOiBBcnJheTxhbnk+IHtcbiAgICBsZXQgYXJyOiBhbnlbXSA9IFtdO1xuICAgIGNvbXBvbmVudHMuZm9yRWFjaChjb21wb25lbnQgPT4ge1xuICAgICAgbGV0IGN1cnJlbnRDb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVyRm9yQ29tcG9uZW50KGNvbXBvbmVudCk7XG4gICAgICBpZiAoIWN1cnJlbnRDb250cm9sbGVyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGNoaWxkcmVuID0gdGhpcy5jb21wb25lbnRzRm9yQ29udHJvbGxlcihcbiAgICAgICAgdGhpcy5jaGlsZENvbXBvbmVudHMoY29tcG9uZW50KSxcbiAgICAgICAgY29udHJvbGxlclxuICAgICAgKTtcbiAgICAgIGlmIChjdXJyZW50Q29udHJvbGxlciA9PT0gY29udHJvbGxlcikge1xuICAgICAgICBhcnIucHVzaCh7IHZhbHVlOiB0aGlzLmluc3BlY3RDb21wb25lbnQoY29tcG9uZW50KSwgY2hpbGRyZW4gfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhcnIgPSBhcnIuY29uY2F0KGNoaWxkcmVuKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gYXJyO1xuICB9XG5cbiAgLyoqXG4gICAqIEdpdmVuIGEgY29tcG9uZW50LCByZXR1cm4gaXRzIGNoaWxkcmVuLlxuICAgKlxuICAgKiBAbWV0aG9kIGNoaWxkQ29tcG9uZW50c1xuICAgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbXBvbmVudCBUaGUgcGFyZW50IGNvbXBvbmVudFxuICAgKiBAcmV0dXJuIHtBcnJheX0gIEFycmF5IG9mIGNvbXBvbmVudHMgKGNoaWxkcmVuKVxuICAgKi9cbiAgY2hpbGRDb21wb25lbnRzKGNvbXBvbmVudDogQ29tcG9uZW50VHlwZSk6IEFycmF5PGFueT4ge1xuICAgIHJldHVybiBnZXRDaGlsZFZpZXdzKGNvbXBvbmVudCk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSB0b3AgbGV2ZWwgY29tcG9uZW50cy5cbiAgICpcbiAgICogQG1ldGhvZCB0b3BDb21wb25lbnRzXG4gICAqIEByZXR1cm4ge0FycmF5fSAgQXJyYXkgb2YgY29tcG9uZW50c1xuICAgKi9cbiAgdG9wQ29tcG9uZW50cygpOiBBcnJheTxhbnk+IHtcbiAgICByZXR1cm4gZ2V0Um9vdFZpZXdzKHRoaXMub3duZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFzc2lnbiBlYWNoIGNvbXBvbmVudCB0cmVlIHRvIGl0IG1hdGNoaW5nIG91dGxldFxuICAgKiBieSBjb21wYXJpbmcgY29udHJvbGxlcnMuXG4gICAqXG4gICAqIFJldHVybiBmb3JtYXQ6XG4gICAqIHtcbiAgICogICB2YWx1ZTogfGluc3BlY3RlZCByb290IG91dGxldHxcbiAgICogICBjaGlsZHJlbjogW1xuICAgKiAgICAge1xuICAgKiAgICAgICB2YWx1ZTogfGluc3BlY3RlZCBvdXRsZXQgb3IgY29tcG9uZW50fFxuICAgKiAgICAgICBjaGlkcmVuOiBbLi4uXVxuICAgKiAgICAgfSxcbiAgICogICAgIHtcbiAgICogICAgICAgdmFsdWU6IHxpbnNwZWN0ZWQgb3V0bGV0IG9yIGNvbXBvbmVudHxcbiAgICogICAgICAgY2hpZHJlbjogWy4uLl1cbiAgICogICAgIH1cbiAgICogICBdXG4gICAqIH1cbiAgICpcbiAgICogQG1ldGhvZCBhZGRDb21wb25lbnRzVG9PdXRsZXRzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvdXRsZXRUcmVlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb21wb25lbnRUcmVlc1xuICAgKi9cbiAgYWRkQ29tcG9uZW50c1RvT3V0bGV0cyhcbiAgICBvdXRsZXRUcmVlOiBPdXRsZXRUcmVlTm9kZSxcbiAgICBjb21wb25lbnRUcmVlczogQ29tcG9uZW50VHJlZVtdXG4gICkge1xuICAgIGxldCB7IHZhbHVlLCBjb250cm9sbGVyLCBjaGlsZHJlbiB9ID0gb3V0bGV0VHJlZTtcbiAgICBsZXQgbmV3Q2hpbGRyZW46IGFueSA9IGNoaWxkcmVuLm1hcChjaGlsZCA9PlxuICAgICAgdGhpcy5hZGRDb21wb25lbnRzVG9PdXRsZXRzKGNoaWxkLCBjb21wb25lbnRUcmVlcylcbiAgICApO1xuICAgIGxldCB7IGNvbXBvbmVudHMgfSA9IEEoY29tcG9uZW50VHJlZXMpLmZpbmRCeSgnY29udHJvbGxlcicsIGNvbnRyb2xsZXIpIHx8IHtcbiAgICAgIGNvbXBvbmVudHM6IFtdLFxuICAgIH07XG4gICAgcmV0dXJuIHsgdmFsdWUsIGNoaWxkcmVuOiBuZXdDaGlsZHJlbi5jb25jYXQoY29tcG9uZW50cykgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbWV0aG9kIGNvbnRyb2xsZXJzRnJvbU91dGxldFRyZWVcbiAgICpcbiAgICogQHBhcmFtICB7Q29udHJvbGxlcn0gaW5zcGVjdGVkT3V0bGV0XG4gICAqIEByZXR1cm4ge0FycmF5fSBMaXN0IG9mIGNvbnRyb2xsZXJzXG4gICAqL1xuICBjb250cm9sbGVyc0Zyb21PdXRsZXRUcmVlKHtcbiAgICBjb250cm9sbGVyLFxuICAgIGNoaWxkcmVuLFxuICB9OiBPdXRsZXRUcmVlTm9kZSk6IEFycmF5PGFueT4ge1xuICAgIHJldHVybiBbY29udHJvbGxlcl0uY29uY2F0KFxuICAgICAgLi4uY2hpbGRyZW4ubWFwKHRoaXMuY29udHJvbGxlcnNGcm9tT3V0bGV0VHJlZS5iaW5kKHRoaXMpKVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQG1ldGhvZCBnZXRSb3V0ZXJcbiAgICogQHJldHVybiB7Um91dGVyfVxuICAgKi9cbiAgZ2V0Um91dGVyKCk6IFJvdXRlclR5cGUgJiB7IF90b3BsZXZlbFZpZXc6IGFueSB9IHtcbiAgICByZXR1cm4gdGhpcy5vd25lci5sb29rdXAoJ3JvdXRlcjptYWluJyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgY3VycmVudCB0b3AgbGV2ZWwgdmlldy5cbiAgICpcbiAgICogQG1ldGhvZCBnZXRSb290XG4gICAqIEByZXR1cm4ge091dGxldFZpZXd9XG4gICAqL1xuICBnZXRSb290KCk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Um91dGVyKCkuZ2V0KCdfdG9wbGV2ZWxWaWV3Jyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgYXBwbGljYXRpb24gKHRvcCkgb3V0bGV0LlxuICAgKlxuICAgKiBAcmV0dXJuIFRoZSBhcHBsaWNhdGlvbiBvdXRsZXQgc3RhdGVcbiAgICovXG4gIGdldEFwcGxpY2F0aW9uT3V0bGV0KCkge1xuICAgIC8vIFN1cHBvcnQgbXVsdGlwbGUgcGF0aHMgdG8gb3V0bGV0U3RhdGUgZm9yIHZhcmlvdXMgRW1iZXIgdmVyc2lvbnNcbiAgICBjb25zdCBvdXRsZXRTdGF0ZSA9XG4gICAgICB0aGlzLmdldFJvb3QoKS5vdXRsZXRTdGF0ZSB8fCB0aGlzLmdldFJvb3QoKS5zdGF0ZS5yZWYub3V0bGV0U3RhdGU7XG4gICAgcmV0dXJuIG91dGxldFN0YXRlLm91dGxldHMubWFpbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgcm9vdCdzIERPTSBlbGVtZW50LiBUaGUgcm9vdCBpcyB0aGUgb25seSBvdXRsZXQgdmlld1xuICAgKiB3aXRoIGEgRE9NIGVsZW1lbnQuXG4gICAqXG4gICAqIEBtZXRob2QgZWxlbWVudEZvclJvb3RcbiAgICogQHJldHVybiB7RWxlbWVudH1cbiAgICovXG4gIGVsZW1lbnRGb3JSb290KCk6IEVsZW1lbnQge1xuICAgIGxldCByZW5kZXJlciA9IHRoaXMub3duZXIubG9va3VwKCdyZW5kZXJlcjotZG9tJyk7XG4gICAgcmV0dXJuIChcbiAgICAgIHJlbmRlcmVyLl9yb290cyAmJlxuICAgICAgcmVuZGVyZXIuX3Jvb3RzWzBdICYmXG4gICAgICByZW5kZXJlci5fcm9vdHNbMF0ucmVzdWx0ICYmXG4gICAgICByZW5kZXJlci5fcm9vdHNbMF0ucmVzdWx0LmZpcnN0Tm9kZSgpXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgY29tcG9uZW50J3MgdGVtcGxhdGUgbmFtZS5cbiAgICpcbiAgICogQG1ldGhvZCB0ZW1wbGF0ZUZvckNvbXBvbmVudFxuICAgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICAgKiBAcmV0dXJuIFRoZSB0ZW1wbGF0ZSBuYW1lXG4gICAqL1xuICB0ZW1wbGF0ZUZvckNvbXBvbmVudChcbiAgICBjb21wb25lbnQ6IENvbXBvbmVudFR5cGUgJiB7XG4gICAgICBsYXlvdXROYW1lOiBzdHJpbmcgfCBudWxsO1xuICAgICAgX2RlYnVnQ29udGFpbmVyS2V5OiBzdHJpbmcgfCBudWxsO1xuICAgIH1cbiAgKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgbGV0IHRlbXBsYXRlID0gY29tcG9uZW50LmdldCgnbGF5b3V0TmFtZScpO1xuXG4gICAgaWYgKCF0ZW1wbGF0ZSkge1xuICAgICAgbGV0IGxheW91dCA9IGNvbXBvbmVudC5nZXQoJ2xheW91dCcpO1xuICAgICAgaWYgKCFsYXlvdXQpIHtcbiAgICAgICAgbGV0IGNvbXBvbmVudE5hbWUgPSBjb21wb25lbnQuZ2V0KCdfZGVidWdDb250YWluZXJLZXknKTtcbiAgICAgICAgaWYgKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICBsZXQgbGF5b3V0TmFtZSA9IGNvbXBvbmVudE5hbWUucmVwbGFjZShcbiAgICAgICAgICAgIC9jb21wb25lbnQ6LyxcbiAgICAgICAgICAgICd0ZW1wbGF0ZTpjb21wb25lbnRzLydcbiAgICAgICAgICApO1xuICAgICAgICAgIGxheW91dCA9IHRoaXMub3duZXIubG9va3VwKGxheW91dE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0ZW1wbGF0ZSA9IHRoaXMubmFtZUZyb21MYXlvdXQobGF5b3V0KTtcbiAgICB9XG4gICAgcmV0dXJuIHRlbXBsYXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEluc3BlY3RzIGFuZCBvdXRsZXQgc3RhdGUuIEV4dHJhY3RzIHRoZSBuYW1lLCBjb250cm9sbGVyLCB0ZW1wbGF0ZSxcbiAgICogYW5kIG1vZGVsLlxuICAgKlxuICAgKiBAbWV0aG9kIGluc3BlY3RPdXRsZXRcbiAgICogQHBhcmFtICB7T2JqZWN0fSBvdXRsZXQgVGhlIG91dGxldCBzdGF0ZVxuICAgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICBUaGUgaW5zcGVjdGVkIG91dGxldFxuICAgKi9cbiAgaW5zcGVjdE91dGxldChvdXRsZXQ6IE91dGxldFN0YXRlKTogT3V0bGV0IHtcbiAgICBsZXQgbmFtZSA9IHRoaXMubmFtZUZvck91dGxldChvdXRsZXQpO1xuICAgIGxldCB0ZW1wbGF0ZSA9IHRoaXMudGVtcGxhdGVGb3JPdXRsZXQob3V0bGV0KTtcbiAgICBsZXQgY29udHJvbGxlciA9IHRoaXMuY29udHJvbGxlckZvck91dGxldChvdXRsZXQpO1xuICAgIGxldCB2YWx1ZTogT3V0bGV0ID0ge1xuICAgICAgY29udHJvbGxlcjogdGhpcy5pbnNwZWN0Q29udHJvbGxlcihjb250cm9sbGVyKSxcbiAgICAgIHRlbXBsYXRlLFxuICAgICAgbmFtZSxcbiAgICAgIGVsZW1lbnRJZDogbnVsbCxcbiAgICAgIGlzQ29tcG9uZW50OiBmYWxzZSxcbiAgICAgIC8vIE91dGxldHMgKGV4Y2VwdCByb290KSBkb24ndCBoYXZlIGVsZW1lbnRzXG4gICAgICB0YWdOYW1lOiAnJyxcbiAgICAgIG1vZGVsOiBudWxsLFxuICAgIH07XG5cbiAgICBsZXQgbW9kZWwgPSBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICBpZiAobW9kZWwpIHtcbiAgICAgIHZhbHVlLm1vZGVsID0gdGhpcy5pbnNwZWN0TW9kZWwobW9kZWwpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogUmVwcmVzZW50cyB0aGUgY29udHJvbGxlciBhcyBhIHNob3J0IGFuZCBsb25nIG5hbWUgKyBndWlkLlxuICAgKlxuICAgKiBAbWV0aG9kIGluc3BlY3RDb250cm9sbGVyXG4gICAqIEBwYXJhbSAge0NvbnRyb2xsZXJ9IGNvbnRyb2xsZXJcbiAgICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgIFRoZSBpbnNwZWN0ZWQgY29udHJvbGxlci5cbiAgICovXG4gIGluc3BlY3RDb250cm9sbGVyKGNvbnRyb2xsZXI6IENvbnRyb2xsZXJUeXBlKTogb2JqZWN0IHtcbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogZ2V0U2hvcnRDb250cm9sbGVyTmFtZShjb250cm9sbGVyKSxcbiAgICAgIGNvbXBsZXRlTmFtZTogZ2V0U2hvcnRDb250cm9sbGVyTmFtZShjb250cm9sbGVyKSxcbiAgICAgIG9iamVjdElkOiB0aGlzLnJldGFpbk9iamVjdChjb250cm9sbGVyKSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcHJlc2VudCBhIGNvbXBvbmVudCBhcyBhIGhhc2ggY29udGFpbmluZyBhIHRlbXBsYXRlLFxuICAgKiBuYW1lLCBvYmplY3RJZCwgY2xhc3MsIHJlbmRlciBkdXJhdGlvbiwgdGFnLCBtb2RlbC5cbiAgICpcbiAgICogQG1ldGhvZCBpbnNwZWN0Q29tcG9uZW50XG4gICAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29tcG9uZW50XG4gICAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgVGhlIGluc3BlY3RlZCBjb21wb25lbnRcbiAgICovXG4gIGluc3BlY3RDb21wb25lbnQoY29tcG9uZW50OiBEZWJ1Z0NvbXBvbmVudCk6IENvbXBvbmVudFNwZWMge1xuICAgIGxldCB2aWV3Q2xhc3MgPSBnZXRTaG9ydFZpZXdOYW1lKGNvbXBvbmVudCk7XG4gICAgbGV0IGNvbXBsZXRlVmlld0NsYXNzID0gdmlld0NsYXNzO1xuICAgIGxldCB0YWdOYW1lID0gY29tcG9uZW50LmdldCgndGFnTmFtZScpO1xuICAgIGxldCBvYmplY3RJZCA9IHRoaXMucmV0YWluT2JqZWN0KGNvbXBvbmVudCk7XG4gICAgbGV0IGR1cmF0aW9uID0gdGhpcy5kdXJhdGlvbnNbb2JqZWN0SWRdO1xuXG4gICAgbGV0IG5hbWUgPSBnZXRTaG9ydFZpZXdOYW1lKGNvbXBvbmVudCk7XG4gICAgbGV0IHRlbXBsYXRlID0gdGhpcy50ZW1wbGF0ZUZvckNvbXBvbmVudChjb21wb25lbnQpO1xuXG4gICAgbGV0IHZhbHVlOiBDb21wb25lbnRTcGVjID0ge1xuICAgICAgdGVtcGxhdGUsXG4gICAgICBuYW1lLFxuICAgICAgb2JqZWN0SWQsXG4gICAgICB2aWV3Q2xhc3MsXG4gICAgICBkdXJhdGlvbixcbiAgICAgIG1vZGVsOiBudWxsLFxuICAgICAgY29tcGxldGVWaWV3Q2xhc3MsXG4gICAgICBpc0NvbXBvbmVudDogdHJ1ZSxcbiAgICAgIHRhZ05hbWU6IGlzTm9uZSh0YWdOYW1lKSA/ICdkaXYnIDogdGFnTmFtZSxcbiAgICB9O1xuXG4gICAgbGV0IG1vZGVsID0gdGhpcy5tb2RlbEZvckNvbXBvbmVudChjb21wb25lbnQpO1xuICAgIGlmIChtb2RlbCkge1xuICAgICAgdmFsdWUubW9kZWwgPSB0aGlzLmluc3BlY3RNb2RlbChtb2RlbCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFNpbXBseSByZXR1cm5zIHRoZSBjb21wb25lbnQncyBtb2RlbCBpZiBpdFxuICAgKiBoYXMgb25lLlxuICAgKlxuICAgKiBAbWV0aG9kIG1vZGVsRm9yQ29tcG9uZW50XG4gICAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29tcG9uZW50XG4gICAqIEByZXR1cm4ge0FueX0gICAgICAgICAgICBUaGUgbW9kZWwgcHJvcGVydHlcbiAgICovXG4gIG1vZGVsRm9yQ29tcG9uZW50KFxuICAgIGNvbXBvbmVudDogQ29tcG9uZW50VHlwZSAmIHsgbW9kZWw/OiBhbnkgfCBudWxsIH1cbiAgKTogYW55IHwgbnVsbCB7XG4gICAgcmV0dXJuIGNvbXBvbmVudC5nZXQoJ21vZGVsJyk7XG4gIH1cblxuICAvKipcbiAgICogUmVwcmVzZW50IGEgbW9kZWwgYXMgYSBzaG9ydCBuYW1lLCBsb25nIG5hbWUsXG4gICAqIGd1aWQsIGFuZCB0eXBlLlxuICAgKlxuICAgKiBAbWV0aG9kIGluc3BlY3RNb2RlbFxuICAgKiBAcGFyYW0gIHtBbnl9IG1vZGVsXG4gICAqIEByZXR1cm4ge09iamVjdH0gICAgICAgVGhlIGluc3BlY3RlZCBtb2RlbC5cbiAgICovXG4gIGluc3BlY3RNb2RlbChtb2RlbDogYW55KTogb2JqZWN0IHtcbiAgICBpZiAoRW1iZXJPYmplY3QuZGV0ZWN0SW5zdGFuY2UobW9kZWwpIHx8IHR5cGVPZihtb2RlbCkgPT09ICdhcnJheScpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IGdldFNob3J0TW9kZWxOYW1lKG1vZGVsKSxcbiAgICAgICAgY29tcGxldGVOYW1lOiBnZXRNb2RlbE5hbWUobW9kZWwpLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5yZXRhaW5PYmplY3QobW9kZWwpLFxuICAgICAgICB0eXBlOiAndHlwZS1lbWJlci1vYmplY3QnLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IHRoaXMub2JqZWN0SW5zcGVjdG9yLmluc3BlY3QobW9kZWwpLFxuICAgICAgdHlwZTogYHR5cGUtJHt0eXBlT2YobW9kZWwpfWAsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVc2VzIHRoZSBtb2R1bGUgbmFtZSB0aGF0IHdhcyBzZXQgZHVyaW5nIGNvbXBpbGF0aW9uLlxuICAgKlxuICAgKiBAbWV0aG9kIG5hbWVGcm9tTGF5b3V0XG4gICAqIEBwYXJhbSAge0xheW91dH0gbGF5b3V0XG4gICAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgIFRoZSBsYXlvdXQncyBuYW1lXG4gICAqL1xuICBuYW1lRnJvbUxheW91dChsYXlvdXQ6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGxldCBtb2R1bGVOYW1lID0gbGF5b3V0ICYmIGdldChsYXlvdXQsICdtZXRhLm1vZHVsZU5hbWUnKTtcbiAgICBpZiAobW9kdWxlTmFtZSkge1xuICAgICAgcmV0dXJuIG1vZHVsZU5hbWUucmVwbGFjZSgvXFwuaGJzJC8sICcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRhZWtlcyBhbiBvdXRsZXQgc3RhdGUgYW5kIGV4dHJhY3RzIHRoZSBjb250cm9sbGVyIGZyb20gaXQuXG4gICAqXG4gICAqIEBtZXRob2QgY29udHJvbGxlckZvck91dGxldFxuICAgKiBAcGFyYW0gIHtDb250cm9sbGVyfSBvdXRsZXRTdGF0ZVxuICAgKiBAcmV0dXJuIHtDb250cm9sbGVyfVxuICAgKi9cbiAgY29udHJvbGxlckZvck91dGxldChvdXRsZXRTdGF0ZTogYW55KTogQ29udHJvbGxlclR5cGUge1xuICAgIHJldHVybiBvdXRsZXRTdGF0ZS5yZW5kZXIuY29udHJvbGxlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgb3V0bGV0J3MgbmFtZS5cbiAgICpcbiAgICogQG1ldGhvZCBuYW1lRm9yT3V0bGV0XG4gICAqIEBwYXJhbSAge09iamVjdH0gb3V0bGV0U3RhdGVcbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cbiAgbmFtZUZvck91dGxldChvdXRsZXRTdGF0ZTogT3V0bGV0U3RhdGUpOiBzdHJpbmcge1xuICAgIHJldHVybiBvdXRsZXRTdGF0ZS5yZW5kZXIubmFtZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgb3V0bGV0J3MgdGVtcGxhdGUgbmFtZS4gVXNlcyB0aGUgbW9kdWxlIG5hbWUgYXR0YWNoZWQgZHVyaW5nIGNvbXBpbGF0aW9uLlxuICAgKlxuICAgKiBAbWV0aG9kIHRlbXBsYXRlRm9yT3V0bGV0XG4gICAqIEBwYXJhbSAge09iamVjdH0gb3V0bGV0U3RhdGVcbiAgICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgICAgICBUaGUgdGVtcGxhdGUgbmFtZVxuICAgKi9cbiAgdGVtcGxhdGVGb3JPdXRsZXQob3V0bGV0U3RhdGU6IE91dGxldFN0YXRlKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgbGV0IHRlbXBsYXRlID0gb3V0bGV0U3RhdGUucmVuZGVyLnRlbXBsYXRlO1xuICAgIHJldHVybiB0aGlzLm5hbWVGcm9tTGF5b3V0KHRlbXBsYXRlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgY29tcG9uZW50J3MgY29udHJvbGxlci4gVGhlIGNvbnRyb2xsZXIgaXMgZWl0aGVyIHRoZSBjb21wb25lbnQnc1xuICAgKiB0YXJnZXQgb2JqZWN0LCBvciB0aGUgdGFyZ2V0IG9iamVjdCBvZiBvbmUgb2YgaXRzIGFuY2VzdG9ycy4gVGhhdCBpcyB3aHlcbiAgICogdGhlIG1ldGhvZCBpcyByZWN1cnNpdmUuXG4gICAqXG4gICAqIEBtZXRob2QgY29udHJvbGxlckZvckNvbXBvbmVudFxuICAgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICAgKiBAcmV0dXJuIHtDb250cm9sbGVyfSAgICAgICAgICAgVGhlIHRhcmdldCBjb250cm9sbGVyLlxuICAgKi9cbiAgY29udHJvbGxlckZvckNvbXBvbmVudChcbiAgICBjb21wb25lbnQ6IENvbXBvbmVudFR5cGUgJiB7IF90YXJnZXRPYmplY3Q6IGFueSB8IG51bGwgfVxuICApOiBDb250cm9sbGVyVHlwZSB8IG51bGwge1xuICAgIGxldCBjb250cm9sbGVyID0gY29tcG9uZW50LmdldCgnX3RhcmdldE9iamVjdCcpO1xuICAgIGlmICghY29udHJvbGxlcikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGNvbnRyb2xsZXIgaW5zdGFuY2VvZiBDb250cm9sbGVyKSB7XG4gICAgICByZXR1cm4gY29udHJvbGxlcjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuY29udHJvbGxlckZvckNvbXBvbmVudChjb250cm9sbGVyKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVuZGVycyBhIHJlY3RhbmdsZSBhcm91bmQgYSBjb21wb25lbnQncyBlbGVtZW50LiBUaGlzIGhhcHBlbnNcbiAgICogd2hlbiB0aGUgdXNlciBlaXRoZXIgaG92ZXJzIG92ZXIgdGhlIHZpZXcgdHJlZSBjb21wb25lbnRzXG4gICAqIG9yIGNsaWNrcyBvbiB0aGUgXCJpbnNwZWN0XCIgbWFnbmlmeWluZyBnbGFzcyBhbmQgc3RhcnRzXG4gICAqIGhvdmVyaW5nIG92ZXIgdGhlIGNvbXBvbmVudHMgdGhlbXNlbHZlcy5cbiAgICpcbiAgICogUGFzcyBgaXNQcmV2aWV3YCBpZiB5b3Ugd2FudCB0aGUgaGlnaGxpZ2h0IHRvIGJlIGhpZGRlblxuICAgKiB3aGVuIHRoZSBtb3VzZSBsZWF2ZXMgdGhlIGNvbXBvbmVudC4gU2V0IGBpc1ByZXZpZXdgIHRvIGZhbHNlXG4gICAqIHRvIHJlbmRlciBhIFtwZXJtYW5lbnRdIHJlY3RhbmdsZSB1bnRpbCB0aGUgKHgpIGJ1dHRvbiBpcyBjbGlja2VkLlxuICAgKlxuICAgKlxuICAgKiBAbWV0aG9kIGhpZ2hsaWdodENvbXBvbmVudFxuICAgKiBAcGFyYW0gIHtFbGVtZW50fSAgZWxlbWVudCAgIFRoZSBlbGVtZW50IHRvIGhpZ2hsaWdodFxuICAgKiBAcGFyYW0gIHtCb29sZWFufSBpc1ByZXZpZXcgV2hldGhlciBpdCdzIGEgcHJldmlldyBvciBub3RcbiAgICovXG4gIGhpZ2hsaWdodENvbXBvbmVudChjb21wb25lbnQ6IGFueSwgaXNQcmV2aWV3OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBsZXQgcmVjdCA9IGdldFZpZXdCb3VuZGluZ0NsaWVudFJlY3QoY29tcG9uZW50KTtcblxuICAgIGxldCBvcHRpb25zID0ge1xuICAgICAgaXNQcmV2aWV3LFxuICAgICAgdGVtcGxhdGU6IG51bGwgYXMgYW55LFxuICAgICAgdmlldzoge1xuICAgICAgICBuYW1lOiBnZXRTaG9ydFZpZXdOYW1lKGNvbXBvbmVudCksXG4gICAgICAgIG9iamVjdDogY29tcG9uZW50LFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgbGV0IHRlbXBsYXRlTmFtZSA9IHRoaXMudGVtcGxhdGVGb3JDb21wb25lbnQoY29tcG9uZW50KTtcbiAgICBpZiAodGVtcGxhdGVOYW1lKSB7XG4gICAgICBvcHRpb25zLnRlbXBsYXRlID0ge1xuICAgICAgICBuYW1lOiB0ZW1wbGF0ZU5hbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICB0aGlzLmhpZ2hsaWdodFJhbmdlKHJlY3QsIG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlcnMgYSByZWN0YW5nbGUgYXJvdW5kIHRoZSB0b3AgbGV2ZWwgb3V0bGV0J3MgZWxlbWVudC4gVGhpcyBoYXBwZW5zXG4gICAqIHdoZW4gdGhlIHVzZXIgZWl0aGVyIGhvdmVycyBvdmVyIHRoZSB2aWV3IHRyZWUgcm9vdCBvdXRsZXRzXG4gICAqIG9yIGNsaWNrcyBvbiB0aGUgXCJpbnNwZWN0XCIgbWFnbmlmeWluZyBnbGFzcyBhbmQgc3RhcnRzXG4gICAqIGhvdmVyaW5nIG92ZXIgdGhlIGFwcGxpY2F0aW9uIHRlbXBsYXRlLlxuICAgKlxuICAgKiBQYXNzIGBpc1ByZXZpZXdgIGlmIHlvdSB3YW50IHRoZSBoaWdobGlnaHQgdG8gYmUgaGlkZGVuXG4gICAqIHdoZW4gdGhlIG1vdXNlIGxlYXZlcyB0aGUgcm9vdC4gU2V0IGBpc1ByZXZpZXdgIHRvIGZhbHNlXG4gICAqIHRvIHJlbmRlciBhIFtwZXJtYW5lbnRdIHJlY3RhbmdsZSB1bnRpbCB0aGUgKHgpIGJ1dHRvbiBpcyBjbGlja2VkLlxuICAgKlxuICAgKiBAbWV0aG9kIGhpZ2hsaWdodFJvb3RcbiAgICogQHBhcmFtICB7Qm9vbGVhbn0gaXNQcmV2aWV3XG4gICAqL1xuICBoaWdobGlnaHRSb290KGlzUHJldmlldzogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgbGV0IGFwcGxpY2F0aW9uT3V0bGV0ID0gdGhpcy5nZXRBcHBsaWNhdGlvbk91dGxldCgpO1xuICAgIGxldCBlbGVtZW50ID0gdGhpcy5lbGVtZW50Rm9yUm9vdCgpO1xuXG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IG9wdGlvbnMgPSB7XG4gICAgICBpc1ByZXZpZXcsXG4gICAgICBtb2RlbDogbnVsbCBhcyBhbnkgfCBudWxsLFxuICAgICAgY29udHJvbGxlcjogbnVsbCBhcyBhbnkgfCBudWxsLFxuICAgICAgZWxlbWVudCxcbiAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgIG5hbWU6IHRoaXMudGVtcGxhdGVGb3JPdXRsZXQoYXBwbGljYXRpb25PdXRsZXQpLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgbGV0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXJGb3JPdXRsZXQoYXBwbGljYXRpb25PdXRsZXQpO1xuICAgIGlmIChjb250cm9sbGVyKSB7XG4gICAgICBvcHRpb25zLmNvbnRyb2xsZXIgPSB7XG4gICAgICAgIG5hbWU6IGdldFNob3J0Q29udHJvbGxlck5hbWUoY29udHJvbGxlciksXG4gICAgICAgIG9iamVjdDogY29udHJvbGxlcixcbiAgICAgIH07XG5cbiAgICAgIGxldCBtb2RlbCA9IGNvbnRyb2xsZXIuZ2V0KCdtb2RlbCcpO1xuICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgIGxldCBtb2RlbE5hbWUgPSB0aGlzLm9iamVjdEluc3BlY3Rvci5pbnNwZWN0KG1vZGVsKTtcbiAgICAgICAgb3B0aW9ucy5tb2RlbCA9IHtcbiAgICAgICAgICBuYW1lOiBtb2RlbE5hbWUsXG4gICAgICAgICAgb2JqZWN0OiBtb2RlbCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IHJlY3QgPSB0aGlzLmdldEJvdW5kaW5nQ2xpZW50UmVjdChlbGVtZW50KTtcbiAgICB0aGlzLmhpZ2hsaWdodFJhbmdlKHJlY3QsIG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNhbWUgYXMgYFZpZXdVdGlscy5nZXRCb3VuZGluZ0NsaWVudFJlY3RgIGV4Y2VwdCB0aGlzIGFwcGxpZXMgdG9cbiAgICogSFRNTCBlbGVtZW50cyBpbnN0ZWFkIG9mIGNvbXBvbmVudHMuXG4gICAqXG4gICAqIEBtZXRob2QgZ2V0Qm91bmRpbmdDbGllbnRSZWN0XG4gICAqIEBwYXJhbSAge0VsZW1lbnR9IGVsZW1lbnRcbiAgICogQHJldHVybiB7RE9NUmVjdH1cbiAgICovXG4gIGdldEJvdW5kaW5nQ2xpZW50UmVjdChlbGVtZW50OiBFbGVtZW50KTogQ2xpZW50UmVjdCB7XG4gICAgbGV0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgICByYW5nZS5zZXRTdGFydEJlZm9yZShlbGVtZW50KTtcbiAgICByYW5nZS5zZXRFbmRBZnRlcihlbGVtZW50KTtcblxuICAgIHJldHVybiByYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIaWdobGlnaHQgYW4gZWxlbWVudCBvbmx5IGlmIGl0IGlzIGEgcm9vdC5cbiAgICpcbiAgICogQG1ldGhvZCBoaWdobGlnaHRJZlJvb3RcbiAgICogQHBhcmFtICB7U3RyaW5nfSBlbGVtZW50SWRcbiAgICogQHBhcmFtIGlzUHJldmlld1xuICAgKi9cbiAgaGlnaGxpZ2h0SWZSb290KGVsZW1lbnRJZDogc3RyaW5nLCBpc1ByZXZpZXcgPSBmYWxzZSkge1xuICAgIGxldCBlbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZWxlbWVudElkKTtcbiAgICBpZiAoZWxlbWVudCAmJiB0aGlzLmlzUm9vdEVsZW1lbnQoZWxlbWVudCkpIHtcbiAgICAgIHRoaXMuaGlnaGxpZ2h0Um9vdChpc1ByZXZpZXcpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxsIHRoaXMgbWV0aG9kIHdoZW4geW91IGhhdmUgdGhlIGlkIG9mIGFuIGVsZW1lbnQgeW91IHdhbnRcbiAgICogdG8gaGlnaGxpZ2h0IGJ1dCBhcmUgdW5zdXJlIGlmIHRoYXQgZWxlbWVudCByZXByZXNlbnRzIGEgY29tcG9uZW50XG4gICAqIG9yIHRoZSByb290IG91dGxldC5cbiAgICpcbiAgICogQG1ldGhvZCBoaWdobGlnaHRMYXllclxuICAgKiBAcGFyYW0gIHtTdHJpbmd9ICBlbGVtZW50SWQgICAgICAgICBUaGUgZWxlbWVudCB0byBoaWdobGlnaHQncyBpZFxuICAgKiBAcGFyYW0gIHtCb29sZWFufSBbaXNQcmV2aWV3PWZhbHNlXSBQcmV2aWV3L0ZpeGVkXG4gICAqL1xuICBoaWdobGlnaHRMYXllcihlbGVtZW50SWQ6IHN0cmluZywgaXNQcmV2aWV3OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBsZXQgY29tcG9uZW50ID0gdGhpcy5jb21wb25lbnRCeUlkKGVsZW1lbnRJZCk7XG4gICAgaWYgKGNvbXBvbmVudCkge1xuICAgICAgdGhpcy5oaWdobGlnaHRDb21wb25lbnQoY29tcG9uZW50LCBpc1ByZXZpZXcpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmhpZ2hsaWdodElmUm9vdChlbGVtZW50SWQsIGlzUHJldmlldyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRlc3QgaWYgYW4gZWxlbWVudCBpcyB0aGUgcm9vdCBvdXRsZXQgZWxlbWVudC5cbiAgICpcbiAgICogQG1ldGhvZCBpc1Jvb3RFbGVtZW50XG4gICAqIEBwYXJhbSAge0VsZW1lbnR9ICBlbGVtZW50XG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuICBpc1Jvb3RFbGVtZW50KGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5lbGVtZW50Rm9yUm9vdCgpID09PSBlbGVtZW50O1xuICB9XG5cbiAgLyoqXG4gICAqIFR1cm4gdGhlIG91dGxldCB0cmVlIGludG8gYW4gYXJyYXkuIFVzZWZ1bCB3aGVuIHNlYXJjaGluZyBmb3IgYSBzcGVjaWZpY1xuICAgKiBvdXRsZXQuXG4gICAqXG4gICAqIFJldHVybiBmb3JtYXQ6XG4gICAqIFtcbiAgICogICB7XG4gICAqICAgICB2YWx1ZTogfGluc3BlY3RlZCByb290IG91dGxldHwsXG4gICAqICAgICBjb250cm9sbGVyOiB8YXBwbGljYXRpb24gY29udHJvbGxlciBpbnN0YW5jZXxcbiAgICogICB9LFxuICAgKiAgIHtcbiAgICogICAgIHZhbHVlOiB8aW5zcGVjdGVkIG91dGxldHwsXG4gICAqICAgICBjb250b3JsbGVyOiB8Y29udHJvbGxlciBpbnN0YW5jZXxcbiAgICogICB9XG4gICAqICAgXVxuICAgKlxuICAgKiBAbWV0aG9kIG91dGxldEFycmF5XG4gICAqIEBwYXJhbSAge09iamVjdH0gb3V0bGV0VHJlZVxuICAgKiBAcmV0dXJuIFRoZSBhcnJheSBvZiBpbnNwZWN0ZWQgb3V0bGV0c1xuICAgKi9cbiAgb3V0bGV0QXJyYXkob3V0bGV0VHJlZT86IE91dGxldFRyZWVOb2RlKTogT3V0bGV0U3BlY1tdIHtcbiAgICBpZiAoIW91dGxldFRyZWUpIHtcbiAgICAgIG91dGxldFRyZWUgPSB0aGlzLmJ1aWxkT3V0bGV0VHJlZSgpO1xuICAgIH1cbiAgICBsZXQgeyB2YWx1ZSwgY29udHJvbGxlciwgY2hpbGRyZW4gfSA9IG91dGxldFRyZWU7XG4gICAgbGV0IGNoaWxkVmFsdWVzID0gY2hpbGRyZW4ubWFwKGMgPT4gdGhpcy5vdXRsZXRBcnJheS5jYWxsKHRoaXMsIGMpKTtcbiAgICByZXR1cm4gW3sgdmFsdWUsIGNvbnRyb2xsZXIgfV0uY29uY2F0KFxuICAgICAgLi4uY2hpbGRWYWx1ZXNcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSBjb21wb25lbnQgd2hlbiBwcm92aWRlZCBieSBpdHMgZ3VpZC5cbiAgICpcbiAgICogQG1ldGhvZCBjb21wb25lbnRCeUlkXG4gICAqIEBwYXJhbSAge1N0cmluZ30gaWQgIFRoZSBjb21wb25lbnQncyBndWlkLlxuICAgKiBAcmV0dXJuIHtDb21wb25lbnR9ICBUaGUgY29tcG9uZW50LlxuICAgKi9cbiAgY29tcG9uZW50QnlJZChpZDogc3RyaW5nKTogQ29tcG9uZW50VHlwZSB7XG4gICAgcmV0dXJuIHRoaXMudmlld1JlZ2lzdHJ5W2lkXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAbWV0aG9kIG1vZGVsRm9yVmlld05vZGVWYWx1ZVxuICAgKiBAcGFyYW0gIHtCb29sZWFufSBpc0NvbXBvbmVudFxuICAgKiBAcGFyYW0gIHtPYmplY3R9ICBpbnNwZWN0ZWROb2RlVmFsdWVcbiAgICogQHJldHVybiBUaGUgaW5zcGVjdGVkIG5vZGUncyBtb2RlbCAoaWYgaXQgaGFzIG9uZSlcbiAgICovXG4gIG1vZGVsRm9yVmlld05vZGVWYWx1ZSh7IGlzQ29tcG9uZW50LCBvYmplY3RJZCwgbmFtZSB9OiBJbnNwZWN0ZWROb2RlVmFsdWUpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoaXNDb21wb25lbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLm1vZGVsRm9yQ29tcG9uZW50KHRoaXMuY29tcG9uZW50QnlJZChvYmplY3RJZCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZm91bmRPdXRsZXQgPSBBKHRoaXMub3V0bGV0QXJyYXkoKSkuZmluZEJ5KCd2YWx1ZS5uYW1lJywgbmFtZSk7XG4gICAgICBpZiAoZm91bmRPdXRsZXQpIHtcbiAgICAgICAgbGV0IHsgY29udHJvbGxlciB9ID0gZm91bmRPdXRsZXQ7XG4gICAgICAgIHJldHVybiBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl19