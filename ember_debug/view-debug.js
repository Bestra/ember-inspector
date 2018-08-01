/* eslint no-cond-assign:0 */
import PortMixin from 'ember-debug/mixins/port-mixin';
import GlimmerTree from 'ember-debug/libs/glimmer-tree';
import { modelName as getModelName, shortModelName as getShortModelName, controllerName as getControllerName, shortControllerName as getShortControllerName, viewName as getViewName, shortViewName as getShortViewName, } from 'ember-debug/utils/name-functions';
const Ember = window.Ember;
const { guidFor, computed, run, Object: EmberObject, typeOf, Component, Controller, ViewUtils, A, } = Ember;
const { later } = run;
const { readOnly } = computed;
const { getViewBoundingClientRect } = ViewUtils;
const keys = Object.keys || Ember.keys;
let layerDiv;
let previewDiv;
let highlightedElement;
const noOp = () => { };
export default class extends EmberObject.extend(PortMixin, {
    namespace: null,
    adapter: readOnly('namespace.adapter'),
    port: readOnly('namespace.port'),
    objectInspector: readOnly('namespace.objectInspector'),
    retainedObjects: [],
    _durations: {},
    options: {},
    portNamespace: 'view',
    glimmerTree: {},
    resizeHandler: noOp,
    viewTreeChanged: noOp,
    lastClickedHandler: noOp,
    mousemoveHandler: noOp,
    mousedownHandler: noOp,
    mouseupHandler: noOp,
    lastClickedElement: null,
    eventNamespace: computed(function () {
        return `view_debug_${guidFor(this)}`;
    }),
    /**
     * List of render nodes from the last
     * sent view tree.
     *
     * @property lastNodes
     * @type {Array}
     */
    _lastNodes: computed(function () {
        return A([]);
    }),
    viewRegistry: computed('namespace.owner', function () {
        return this.getOwner().lookup('-view-registry:main');
    }),
    messages: {
        getTree() {
            this.sendTree();
        },
        hideLayer() {
            this.hideLayer();
        },
        previewLayer(message) {
            if (this.glimmerTree) {
                // >= Ember 2.9
                this.glimmerTree.highlightLayer(message.objectId || message.elementId, true);
            }
            else {
                // 1.13 >= Ember <= 2.8
                if (message.renderNodeId !== undefined) {
                    this._highlightNode(this.get('_lastNodes').objectAt(message.renderNodeId), true);
                }
                else if (message.objectId) {
                    this.highlightView(this.get('objectInspector').sentObjects[message.objectId], true);
                }
            }
        },
        hidePreview() {
            this.hidePreview();
        },
        inspectViews(message) {
            if (message.inspect) {
                this.startInspecting();
            }
            else {
                this.stopInspecting();
            }
        },
        scrollToElement({ elementId }) {
            let el = document.querySelector(`#${elementId}`);
            if (el) {
                el.scrollIntoView();
            }
        },
        inspectElement({ objectId, elementId }) {
            if (objectId) {
                this.inspectViewElement(objectId);
            }
            else {
                let element = document.getElementById(elementId);
                if (element) {
                    this.inspectElement(element);
                }
            }
        },
        setOptions({ options }) {
            this.set('options', options);
            if (this.glimmerTree) {
                this.glimmerTree.updateOptions(options);
            }
            this.sendTree();
        },
        sendModelToConsole(message) {
            let model;
            if (this.glimmerTree) {
                model = this.glimmerTree.modelForViewNodeValue(message);
            }
            else {
                let renderNode = this.get('_lastNodes').objectAt(message.renderNodeId);
                model = this._modelForNode(renderNode);
            }
            if (model) {
                this.get('objectInspector').sendValueToConsole(model);
            }
        },
        contextMenu() {
            this.inspectComponentForNode(this.lastClickedElement);
        },
    },
    inspectComponentForNode(domNode) {
        let viewElem = this.findNearestView(domNode);
        if (!viewElem) {
            this.get('adapter').log('No Ember component found.');
            return;
        }
        this.sendMessage('inspectComponent', {
            viewId: viewElem.id,
        });
    },
    updateDurations(durations) {
        for (let guid in durations) {
            if (!durations.hasOwnProperty(guid)) {
                continue;
            }
            this._durations[guid] = durations[guid];
        }
        if (this.glimmerTree) {
            this.glimmerTree.updateDurations(this._durations);
        }
        this.sendTree();
    },
    retainObject(object) {
        this.retainedObjects.push(object);
        return this.get('objectInspector').retainObject(object);
    },
    releaseCurrentObjects() {
        this.retainedObjects.forEach((item) => {
            this.get('objectInspector').releaseObject(guidFor(item));
        });
        this.retainedObjects = [];
    },
    willDestroy() {
        this._super();
        window.removeEventListener('resize', this.resizeHandler);
        window.removeEventListener('mousedown', this.lastClickedHandler);
        document.body.removeChild(layerDiv);
        document.body.removeChild(previewDiv);
        this.get('_lastNodes').clear();
        this.releaseCurrentObjects();
        this.stopInspecting();
    },
    inspectViewElement(objectId) {
        let view = this.get('objectInspector').sentObjects[objectId];
        if (view && view.get('element')) {
            this.inspectElement(view.get('element'));
        }
    },
    /**
     * Opens the "Elements" tab and selects the given element. Doesn't work in all
     * browsers/addons (only in the Chrome and FF devtools addons at the time of writing).
     *
     * @method inspectElement
     * @param  {Element} element The element to inspect
     */
    inspectElement(element) {
        this.get('adapter').inspectElement(element);
    },
    sendTree() {
        run.scheduleOnce('afterRender', this, this.scheduledSendTree);
    },
    startInspecting() {
        let viewElem = null;
        this.sendMessage('startInspecting', {});
        // we don't want the preview div to intercept the mousemove event
        previewDiv.style.pointerEvents = 'none';
        let pinView = () => {
            if (viewElem) {
                if (this.glimmerTree) {
                    this.glimmerTree.highlightLayer(viewElem.id);
                }
                else {
                    this.highlightView(viewElem);
                }
                let view = this.get('objectInspector').sentObjects[viewElem.id];
                if (view instanceof Component) {
                    this.get('objectInspector').sendObject(view);
                    this.sendMessage('inspectComponent', { viewId: viewElem.id });
                }
            }
            this.stopInspecting();
            return false;
        };
        this.mousemoveHandler = (e) => {
            viewElem = this.findNearestView(e.target);
            if (viewElem) {
                if (this.glimmerTree) {
                    this.glimmerTree.highlightLayer(viewElem.id, true);
                }
                else {
                    this.highlightView(viewElem, true);
                }
            }
        };
        this.mousedownHandler = () => {
            // prevent app-defined clicks from being fired
            previewDiv.style.pointerEvents = '';
            previewDiv.addEventListener('mouseup', () => pinView(), { once: true });
        };
        this.mouseupHandler = () => pinView();
        document.body.addEventListener('mousemove', this.mousemoveHandler);
        document.body.addEventListener('mousedown', this.mousedownHandler);
        document.body.addEventListener('mouseup', this.mouseupHandler);
        document.body.style.cursor = '-webkit-zoom-in';
    },
    findNearestView(elem) {
        if (!elem) {
            return null;
        }
        if (elem.classList.contains('ember-view')) {
            return elem;
        }
        return this.findNearestView(elem.closest('.ember-view'));
    },
    stopInspecting() {
        document.body.removeEventListener('mousemove', this.mousemoveHandler);
        document.body.removeEventListener('mousedown', this.mousedownHandler);
        document.body.removeEventListener('mouseup', this.mouseupHandler);
        document.body.style.cursor = '';
        this.hidePreview();
        this.sendMessage('stopInspecting', {});
    },
    scheduledSendTree() {
        // Send out of band
        later(() => {
            if (this.isDestroying) {
                return;
            }
            this.releaseCurrentObjects();
            let tree = this.viewTree();
            if (tree) {
                this.sendMessage('viewTree', { tree });
            }
        }, 50);
    },
    viewListener() {
        this.viewTreeChanged = () => {
            this.sendTree();
            this.hideLayer();
        };
    },
    viewTree() {
        let tree;
        let emberApp = this.get('namespace.owner');
        if (!emberApp) {
            return false;
        }
        let applicationView = document.querySelector(`${emberApp.rootElement} > .ember-view`);
        let applicationViewId = applicationView ? applicationView.id : undefined;
        let rootView = this.get('viewRegistry')[applicationViewId];
        // In case of App.reset view is destroyed
        if (this.glimmerTree) {
            // Glimmer 2
            tree = this.glimmerTree.build();
        }
        else if (rootView) {
            let children = [];
            this.get('_lastNodes').clear();
            let renderNode = rootView._renderNode;
            tree = { value: this._inspectNode(renderNode), children };
            this._appendNodeChildren(renderNode, children);
        }
        return tree;
    },
    getOwner() {
        return this.get('namespace.owner');
    },
    isGlimmerTwo() {
        return this.get('namespace.owner').hasRegistration('service:-glimmer-environment');
    },
    modelForView(view) {
        const controller = view.get('controller');
        let model = controller.get('model');
        if (view.get('context') !== controller) {
            model = view.get('context');
        }
        return model;
    },
    shouldShowView(view) {
        if (view instanceof Component) {
            return this.options.components;
        }
        return ((this.hasOwnController(view) || this.hasOwnContext(view)) &&
            (!view.get('isVirtual') ||
                this.hasOwnController(view) ||
                this.hasOwnContext(view)));
    },
    hasOwnController(view) {
        return (view.get('controller') !== view.get('_parentView.controller') &&
            (view instanceof Component ||
                !(view.get('_parentView.controller') instanceof Component)));
    },
    hasOwnContext(view) {
        // Context switching is deprecated, we will need to find a better way for {{#each}} helpers.
        return (view.get('context') !== view.get('_parentView.context') &&
            // make sure not a view inside a component, like `{{yield}}` for example.
            !(view.get('_parentView.context') instanceof Component));
    },
    highlightView(element, isPreview = false) {
        let view, rect;
        if (!isPreview) {
            highlightedElement = element;
        }
        if (!element) {
            return;
        }
        // element && element._renderNode to detect top view (application)
        if (element instanceof Component || (element && element._renderNode)) {
            view = element;
        }
        else {
            view = this.get('viewRegistry')[element.id];
        }
        rect = getViewBoundingClientRect(view);
        let templateName = view.get('templateName') || view.get('_debugTemplateName');
        let controller = view.get('controller');
        let model = controller && controller.get('model');
        let modelName;
        let options = {
            isPreview,
            view: {
                name: getShortViewName(view),
                object: view,
            },
        };
        if (controller) {
            options.controller = {
                name: getControllerName(controller),
                object: controller,
            };
        }
        if (templateName) {
            options.template = {
                name: templateName,
            };
        }
        if (model) {
            modelName = this.get('objectInspector').inspect(model);
            options.model = {
                name: modelName,
                object: model,
            };
        }
        this._highlightRange(rect, options);
    },
    // TODO: This method needs a serious refactor/cleanup
    _highlightRange(rect, options) {
        let div;
        let isPreview = options.isPreview;
        // take into account the scrolling position as mentioned in docs
        // https://developer.mozilla.org/en-US/docs/Web/API/element.getBoundingClientRect
        let styles = {
            display: 'block',
            position: 'absolute',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            border: '2px solid rgb(102, 102, 102)',
            padding: '0',
            right: 'auto',
            direction: 'ltr',
            boxSizing: 'border-box',
            color: 'rgb(51, 51, 255)',
            fontFamily: 'Menlo, sans-serif',
            minHeight: '63px',
            zIndex: 10000,
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
        };
        if (isPreview) {
            div = previewDiv;
        }
        else {
            this.hideLayer();
            div = layerDiv;
            this.hidePreview();
        }
        for (let prop in styles) {
            div.style[prop] = styles[prop];
        }
        let output = '';
        if (!isPreview) {
            output = "<span class='close' data-label='layer-close'>&times;</span>";
        }
        let template = options.template;
        if (template) {
            output += `<p class='template'><span>template</span>=<span data-label='layer-template'>${escapeHTML(template.name)}</span></p>`;
        }
        let view = options.view;
        let controller = options.controller;
        if (!view || !(view.object instanceof Component)) {
            if (controller) {
                output += `<p class='controller'><span>controller</span>=<span data-label='layer-controller'>${escapeHTML(controller.name)}</span></p>`;
            }
            if (view) {
                output += `<p class='view'><span>view</span>=<span data-label='layer-view'>${escapeHTML(view.name)}</span></p>`;
            }
        }
        else {
            output += `<p class='component'><span>component</span>=<span data-label='layer-component'>${escapeHTML(view.name)}</span></p>`;
        }
        let model = options.model;
        if (model) {
            output += `<p class='model'><span>model</span>=<span data-label='layer-model'>${escapeHTML(model.name)}</span></p>`;
        }
        div.innerHTML = output;
        for (let p of div.querySelectorAll('p')) {
            p.style.cssFloat = 'left';
            p.style.margin = '0';
            p.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            p.style.padding = '5px';
            p.style.color = 'rgb(0, 0, 153)';
        }
        for (let p of div.querySelectorAll('p.model')) {
            p.style.clear = 'left';
        }
        for (let p of div.querySelectorAll('p span:first-child')) {
            p.style.color = 'rgb(153, 153, 0)';
        }
        for (let p of div.querySelectorAll('p span:last-child')) {
            p.style.color = 'rgb(153, 0, 153)';
        }
        if (!isPreview) {
            let cancelEvent = function (e) {
                e.preventDefault();
                e.stopPropagation();
            };
            for (let span of div.querySelectorAll('span.close')) {
                span.style.cssFloat = 'right';
                span.style.margin = '5px';
                span.style.background = '#666';
                span.style.color = '#eee';
                span.style.fontFamily = 'helvetica, sans-serif';
                span.style.fontSize = '14px';
                span.style.width = '16px';
                span.style.height = '16px';
                span.style.lineHeight = '14px';
                span.style.borderRadius = '16px';
                span.style.textAlign = 'center';
                span.style.cursor = 'pointer';
                span.style.opacity = '0.5';
                span.style.fontWeight = 'normal';
                span.style.textShadow = 'none';
                span.addEventListener('click', (e) => {
                    cancelEvent(e);
                    this.hideLayer();
                });
                span.addEventListener('mouseup', cancelEvent);
                span.addEventListener('mousedown', cancelEvent);
            }
        }
        this._addClickListeners(div, view, 'component');
        this._addClickListeners(div, controller, 'controller');
        this._addClickListeners(div, view, 'view');
        for (let span of div.querySelectorAll('p.template span:last-child')) {
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => {
                if (view) {
                    this.inspectViewElement(guidFor(view.object));
                }
                else if (options.element) {
                    this.inspectElement(options.element);
                }
            });
        }
        if (model &&
            model.object &&
            (model.object instanceof EmberObject || typeOf(model.object) === 'array')) {
            for (let span of div.querySelectorAll('p.model span:last-child')) {
                span.style.cursor = 'pointer';
                span.addEventListener('click', () => {
                    this.get('objectInspector').sendObject(model.object);
                });
            }
        }
    },
    hideLayer() {
        layerDiv.style.display = 'none';
        highlightedElement = null;
    },
    hidePreview() {
        previewDiv.style.display = 'none';
    },
    _addClickListeners(div, item, selector) {
        for (let span of div.querySelectorAll(`p.${selector} span:last-child`)) {
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => {
                this.get('objectInspector').sendObject(item.object);
            });
        }
    },
    /**
     * Walk the render node hierarchy and build the tree.
     *
     * @param  {Object} renderNode
     * @param  {Array} children
     */
    _appendNodeChildren(renderNode, children) {
        let childNodes = this._childrenForNode(renderNode);
        if (!childNodes) {
            return;
        }
        childNodes.forEach((childNode) => {
            if (this._shouldShowNode(childNode, renderNode)) {
                let grandChildren = [];
                children.push({
                    value: this._inspectNode(childNode),
                    children: grandChildren,
                });
                this._appendNodeChildren(childNode, grandChildren);
            }
            else {
                this._appendNodeChildren(childNode, children);
            }
        });
    },
    /**
     * Gather the children assigned to the render node.
     *
     * @param  {Object} renderNode
     * @return {Array} children
     */
    _childrenForNode(renderNode) {
        if (renderNode.morphMap) {
            return keys(renderNode.morphMap)
                .map(key => renderNode.morphMap[key])
                .filter(node => !!node);
        }
        else {
            return renderNode.childNodes;
        }
    },
    /**
     * Whether a render node is elligible to be included
     * in the tree.
     * Depends on whether the node is actually a view node
     * (as opposed to an attribute node for example),
     * and also checks the filtering options. For example,
     * showing Ember component nodes can be toggled.
     *
     * @param  {Object} renderNode
     * @param  {Object} parentNode
     * @return {Boolean} `true` for show and `false` to skip the node
     */
    _shouldShowNode(renderNode, parentNode) {
        // Filter out non-(view/components)
        if (!this._nodeIsView(renderNode)) {
            return false;
        }
        // Has either a template or a view/component instance
        if (!this._nodeTemplateName(renderNode) &&
            !this._nodeHasViewInstance(renderNode)) {
            return false;
        }
        return (this._nodeHasOwnController(renderNode, parentNode) &&
            (this.options.components || !this._nodeIsEmberComponent(renderNode)) &&
            (this._nodeHasViewInstance(renderNode) ||
                this._nodeHasOwnController(renderNode, parentNode)));
    },
    /**
     * The node's model. If the view has a controller,
     * it will be the controller's `model` property.s
     *
     * @param  {Object} renderNode
     * @return {Object} the model
     */
    _modelForNode(renderNode) {
        let controller = this._controllerForNode(renderNode);
        if (controller) {
            return controller.get('model');
        }
    },
    /**
     * Not all nodes are actually views/components.
     * Nodes can be attributes for example.
     *
     * @param  {Object} renderNode
     * @return {Boolean}
     */
    _nodeIsView(renderNode) {
        if (renderNode.getState) {
            return !!renderNode.getState().manager;
        }
        else {
            return !!renderNode.state.manager;
        }
    },
    /**
     * Check if a node has its own controller (as opposed to sharing
     * its parent's controller).
     * Useful to identify route views from other views.
     *
     * @param  {Object} renderNode
     * @param  {Object} parentNode
     * @return {Boolean}
     */
    _nodeHasOwnController(renderNode, parentNode) {
        return (this._controllerForNode(renderNode) !==
            this._controllerForNode(parentNode));
    },
    /**
     * Check if the node has a view instance.
     * Virtual nodes don't have a view/component instance.
     *
     * @param  {Object} renderNode
     * @return {Boolean}
     */
    _nodeHasViewInstance(renderNode) {
        return !!this._viewInstanceForNode(renderNode);
    },
    /**
     * Returns the nodes' controller.
     *
     * @param  {Object} renderNode
     * @return {Ember.Controller}
     */
    _controllerForNode(renderNode) {
        // If it's a component then return the component instance itself
        if (this._nodeIsEmberComponent(renderNode)) {
            return this._viewInstanceForNode(renderNode);
        }
        if (renderNode.lastResult) {
            let scope = renderNode.lastResult.scope;
            let controller;
            if (scope.getLocal) {
                controller = scope.getLocal('controller');
            }
            else {
                controller = scope.locals.controller.value();
            }
            if ((!controller || !(controller instanceof Controller)) &&
                scope.getSelf) {
                // Ember >= 2.2 + no ember-legacy-controllers addon
                controller = scope.getSelf().value();
                if (!(controller instanceof Controller)) {
                    controller = controller._controller || controller.controller;
                }
            }
            return controller;
        }
    },
    /**
     * Inspect a node. This will return an object with all
     * the required properties to be added to the view tree
     * to be sent.
     *
     * @param  {Object} renderNode
     * @return {Object} the object containing the required values
     */
    _inspectNode(renderNode) {
        let name, viewClassName, completeViewClassName, tagName, viewId, timeToRender;
        let viewClass = this._viewInstanceForNode(renderNode);
        if (viewClass) {
            viewClassName = getShortViewName(viewClass);
            completeViewClassName = getViewName(viewClass);
            tagName = viewClass.get('tagName') || 'div';
            viewId = this.retainObject(viewClass);
            timeToRender = this._durations[viewId];
        }
        name = this._nodeDescription(renderNode);
        let value = {
            template: this._nodeTemplateName(renderNode) || '(inline)',
            name,
            objectId: viewId,
            viewClass: viewClassName,
            duration: timeToRender,
            completeViewClass: completeViewClassName,
            isComponent: this._nodeIsEmberComponent(renderNode),
            tagName,
            isVirtual: !viewClass,
            renderNodeId: 0,
        };
        let controller = this._controllerForNode(renderNode);
        if (controller && !this._nodeIsEmberComponent(renderNode)) {
            value.controller = {
                name: getShortControllerName(controller),
                completeName: getControllerName(controller),
                objectId: this.retainObject(controller),
            };
            let model = this._modelForNode(renderNode);
            if (model) {
                if (EmberObject.detectInstance(model) || typeOf(model) === 'array') {
                    value.model = {
                        name: getShortModelName(model),
                        completeName: getModelName(model),
                        objectId: this.retainObject(model),
                        type: 'type-ember-object',
                    };
                }
                else {
                    value.model = {
                        name: this.get('objectInspector').inspect(model),
                        type: `type-${typeOf(model)}`,
                    };
                }
            }
        }
        value.renderNodeId = this.get('_lastNodes').push(renderNode) - 1;
        return value;
    },
    /**
     * Get the node's template name. Relies on an htmlbars
     * feature that adds the module name as a meta property
     * to compiled templates.
     *
     * @param  {Object} renderNode
     * @return {String} the template name
     */
    _nodeTemplateName(renderNode) {
        let template = renderNode.lastResult && renderNode.lastResult.template;
        if (template && template.meta && template.meta.moduleName) {
            return template.meta.moduleName.replace(/\.hbs$/, '');
        }
    },
    /**
     * The node's name. Should be anything that the user
     * can use to identity what node we are talking about.
     *
     * Usually either the view instance name, or the template name.
     *
     * @param  {Object} renderNode
     * @return {String}
     */
    _nodeDescription(renderNode) {
        let name;
        let viewClass = this._viewInstanceForNode(renderNode);
        if (viewClass) {
            //. Has a view instance - take the view's name
            name = viewClass.get('_debugContainerKey');
            if (name) {
                name = name.replace(/.*(view|component):/, '').replace(/:$/, '');
            }
        }
        else {
            // Virtual - no view instance
            let templateName = this._nodeTemplateName(renderNode);
            if (templateName) {
                return templateName.replace(/^.*templates\//, '').replace(/\//g, '.');
            }
        }
        // If application view was not defined, it uses a `toplevel` view
        if (name === 'toplevel') {
            name = 'application';
        }
        return name;
    },
    /**
     * Return a node's view instance.
     *
     * @param  {Object} renderNode
     * @return {Ember.View|Ember.Component} The view or component instance
     */
    _viewInstanceForNode(renderNode) {
        return renderNode.emberView;
    },
    /**
     * Returns whether the node is an Ember Component or not.
     *
     * @param  {Object} renderNode
     * @return {Boolean}
     */
    _nodeIsEmberComponent(renderNode) {
        let viewInstance = this._viewInstanceForNode(renderNode);
        return !!(viewInstance && viewInstance instanceof Component);
    },
    /**
     * Highlight a render node on the screen.
     *
     * @param  {Object} renderNode
     * @param  {Boolean} isPreview (whether to pin the layer or not)
     */
    _highlightNode(renderNode, isPreview) {
        let modelName;
        // Todo: should be in Ember core
        let range = document.createRange();
        range.setStartBefore(renderNode.firstNode);
        range.setEndAfter(renderNode.lastNode);
        let rect = range.getBoundingClientRect();
        let options = { isPreview };
        let controller = this._controllerForNode(renderNode);
        if (controller) {
            options.controller = {
                name: getControllerName(controller),
                object: controller,
            };
        }
        let templateName = this._nodeTemplateName(renderNode);
        if (templateName) {
            options.template = {
                name: templateName,
            };
        }
        let model;
        if (controller) {
            model = controller.get('model');
        }
        if (model) {
            modelName = this.get('objectInspector').inspect(model);
            options.model = {
                name: modelName,
                object: model,
            };
        }
        let view = this._viewInstanceForNode(renderNode);
        if (view) {
            options.view = {
                name: getViewName(view),
                object: view,
            };
        }
        this._highlightRange(rect, options);
    },
}) {
    constructor() {
        super();
        this.viewListener();
        this.retainedObjects = [];
        this.options = { components: [] };
        layerDiv = document.createElement('div');
        layerDiv.setAttribute('data-label', 'layer-div');
        layerDiv.style.display = 'none';
        document.body.appendChild(layerDiv);
        previewDiv = document.createElement('div');
        previewDiv.style.pointerEvents = 'none';
        previewDiv.style.display = 'none';
        previewDiv.setAttribute('data-label', 'preview-div');
        document.body.appendChild(previewDiv);
        // Store last clicked element for context menu
        this.lastClickedHandler = (event) => {
            if (event.button === 2) {
                this.lastClickedElement = event.target;
            }
        };
        window.addEventListener('mousedown', this.lastClickedHandler);
        this.resizeHandler = () => {
            if (this.glimmerTree) {
                this.hideLayer();
            }
            else {
                if (highlightedElement) {
                    this.highlightView(highlightedElement);
                }
            }
        };
        window.addEventListener('resize', this.resizeHandler);
        if (this.isGlimmerTwo()) {
            this.glimmerTree = new GlimmerTree({
                owner: this.getOwner(),
                retainObject: this.retainObject.bind(this),
                highlightRange: this._highlightRange.bind(this),
                options: this.get('options'),
                objectInspector: this.get('objectInspector'),
                durations: this._durations,
                viewRegistry: this.get('viewRegistry'),
            });
        }
    }
}
function escapeHTML(string) {
    let div = document.createElement('div');
    div.appendChild(document.createTextNode(string));
    return div.innerHTML;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlldy1kZWJ1Zy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZXctZGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsNkJBQTZCO0FBQzdCLE9BQU8sU0FBUyxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sV0FFTixNQUFNLCtCQUErQixDQUFDO0FBQ3ZDLE9BQU8sRUFDTCxTQUFTLElBQUksWUFBWSxFQUN6QixjQUFjLElBQUksaUJBQWlCLEVBQ25DLGNBQWMsSUFBSSxpQkFBaUIsRUFDbkMsbUJBQW1CLElBQUksc0JBQXNCLEVBQzdDLFFBQVEsSUFBSSxXQUFXLEVBQ3ZCLGFBQWEsSUFBSSxnQkFBZ0IsR0FDbEMsTUFBTSxrQ0FBa0MsQ0FBQztBQU8xQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO0FBRTNCLE1BQU0sRUFDSixPQUFPLEVBQ1AsUUFBUSxFQUNSLEdBQUcsRUFDSCxNQUFNLEVBQUUsV0FBVyxFQUNuQixNQUFNLEVBQ04sU0FBUyxFQUNULFVBQVUsRUFDVixTQUFTLEVBQ1QsQ0FBQyxHQUNGLEdBQUcsS0FBSyxDQUFDO0FBQ1YsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQztBQUN0QixNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsUUFBUSxDQUFDO0FBQzlCLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxHQUFHLFNBQVMsQ0FBQztBQUVoRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFFdkMsSUFBSSxRQUF3QixDQUFDO0FBQzdCLElBQUksVUFBMEIsQ0FBQztBQUMvQixJQUFJLGtCQUF1QixDQUFDO0FBQzVCLE1BQU0sSUFBSSxHQUFHLEdBQUcsRUFBRSxHQUFFLENBQUMsQ0FBQztBQXdDdEIsTUFBTSxDQUFDLE9BQU8sTUFBTyxTQUFRLFdBQVcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFO0lBQ3pELFNBQVMsRUFBRSxJQUFJO0lBRWYsT0FBTyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztJQUN0QyxJQUFJLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDO0lBQ2hDLGVBQWUsRUFBRSxRQUFRLENBQUMsMkJBQTJCLENBQUM7SUFFdEQsZUFBZSxFQUFFLEVBQVM7SUFFMUIsVUFBVSxFQUFFLEVBQVM7SUFFckIsT0FBTyxFQUFFLEVBQXdCO0lBRWpDLGFBQWEsRUFBRSxNQUFNO0lBQ3JCLFdBQVcsRUFBRSxFQUFpQjtJQUU5QixhQUFhLEVBQUUsSUFBVztJQUMxQixlQUFlLEVBQUUsSUFBVztJQUM1QixrQkFBa0IsRUFBRSxJQUFXO0lBQy9CLGdCQUFnQixFQUFFLElBQVc7SUFDN0IsZ0JBQWdCLEVBQUUsSUFBVztJQUM3QixjQUFjLEVBQUUsSUFBVztJQUUzQixrQkFBa0IsRUFBRSxJQUFXO0lBRS9CLGNBQWMsRUFBRSxRQUFRLENBQUM7UUFDdkIsT0FBTyxjQUFjLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3ZDLENBQUMsQ0FBQztJQUVGOzs7Ozs7T0FNRztJQUNILFVBQVUsRUFBRSxRQUFRLENBQUM7UUFDbkIsT0FBTyxDQUFDLENBQU0sRUFBRSxDQUFDLENBQUM7SUFDcEIsQ0FBQyxDQUFDO0lBRUYsWUFBWSxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRTtRQUN4QyxPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUM7SUFFRixRQUFRLEVBQUU7UUFDUixPQUFPO1lBQ0wsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xCLENBQUM7UUFDRCxTQUFTO1lBQ1AsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFDRCxZQUFZLENBQUMsT0FBZ0I7WUFDM0IsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO2dCQUNwQixlQUFlO2dCQUNmLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUM3QixPQUFPLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQ3JDLElBQUksQ0FDTCxDQUFDO2FBQ0g7aUJBQU07Z0JBQ0wsdUJBQXVCO2dCQUN2QixJQUFJLE9BQU8sQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO29CQUN0QyxJQUFJLENBQUMsY0FBYyxDQUNqQixJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQ3JELElBQUksQ0FDTCxDQUFDO2lCQUNIO3FCQUFNLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRTtvQkFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FDaEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQ3pELElBQUksQ0FDTCxDQUFDO2lCQUNIO2FBQ0Y7UUFDSCxDQUFDO1FBQ0QsV0FBVztZQUNULElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyQixDQUFDO1FBQ0QsWUFBWSxDQUFDLE9BQXVCO1lBQ2xDLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRTtnQkFDbkIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2FBQ3hCO2lCQUFNO2dCQUNMLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQzthQUN2QjtRQUNILENBQUM7UUFFRCxlQUFlLENBQUMsRUFBRSxTQUFTLEVBQVc7WUFDcEMsSUFBSSxFQUFFLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDakQsSUFBSSxFQUFFLEVBQUU7Z0JBQ04sRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDO2FBQ3JCO1FBQ0gsQ0FBQztRQUVELGNBQWMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQVc7WUFDN0MsSUFBSSxRQUFRLEVBQUU7Z0JBQ1osSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQ25DO2lCQUFNO2dCQUNMLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ2pELElBQUksT0FBTyxFQUFFO29CQUNYLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7aUJBQzlCO2FBQ0Y7UUFDSCxDQUFDO1FBQ0QsVUFBVSxDQUFDLEVBQUUsT0FBTyxFQUFtQztZQUNyRCxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM3QixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7Z0JBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ3pDO1lBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xCLENBQUM7UUFDRCxrQkFBa0IsQ0FBQyxPQUEyQjtZQUM1QyxJQUFJLEtBQUssQ0FBQztZQUNWLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtnQkFDcEIsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDekQ7aUJBQU07Z0JBQ0wsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN2RSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQzthQUN4QztZQUNELElBQUksS0FBSyxFQUFFO2dCQUNULElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN2RDtRQUNILENBQUM7UUFDRCxXQUFXO1lBQ1QsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3hELENBQUM7S0FDRjtJQUVELHVCQUF1QixDQUFDLE9BQWdCO1FBQ3RDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNiLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDckQsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRTtZQUNuQyxNQUFNLEVBQUUsUUFBUSxDQUFDLEVBQUU7U0FDcEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGVBQWUsQ0FBQyxTQUFjO1FBQzVCLEtBQUssSUFBSSxJQUFJLElBQUksU0FBUyxFQUFFO1lBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNuQyxTQUFTO2FBQ1Y7WUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUN6QztRQUNELElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNwQixJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7U0FDbkQ7UUFDRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELFlBQVksQ0FBQyxNQUFXO1FBQ3RCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xDLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQscUJBQXFCO1FBQ25CLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUU7WUFDekMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRCxXQUFXO1FBQ1QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2QsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNqRSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBYTtRQUM5QixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdELElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7U0FDMUM7SUFDSCxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsY0FBYyxDQUFDLE9BQWdCO1FBQzdCLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxRQUFRO1FBQ04sR0FBRyxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxlQUFlO1FBQ2IsSUFBSSxRQUFRLEdBQVEsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFeEMsaUVBQWlFO1FBQ2pFLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQztRQUV4QyxJQUFJLE9BQU8sR0FBRyxHQUFHLEVBQUU7WUFDakIsSUFBSSxRQUFRLEVBQUU7Z0JBQ1osSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO29CQUNwQixJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQzlDO3FCQUFNO29CQUNMLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7aUJBQzlCO2dCQUVELElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRSxJQUFJLElBQUksWUFBWSxTQUFTLEVBQUU7b0JBQzdCLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzdDLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7aUJBQy9EO2FBQ0Y7WUFDRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdEIsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFhLEVBQUUsRUFBRTtZQUN4QyxRQUFRLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFbkQsSUFBSSxRQUFRLEVBQUU7Z0JBQ1osSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO29CQUNwQixJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO2lCQUNwRDtxQkFBTTtvQkFDTCxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDcEM7YUFDRjtRQUNILENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxHQUFHLEVBQUU7WUFDM0IsOENBQThDO1lBQzlDLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUNwQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUUsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGNBQWMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN0QyxRQUFRLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRSxRQUFRLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRSxRQUFRLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDL0QsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLGlCQUFpQixDQUFDO0lBQ2pELENBQUM7SUFFRCxlQUFlLENBQUMsSUFBb0I7UUFDbEMsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNULE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFDRCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ3pDLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFDRCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxjQUFjO1FBQ1osUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdEUsUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdEUsUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2xFLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25CLElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELGlCQUFpQjtRQUNmLG1CQUFtQjtRQUNuQixLQUFLLENBQUMsR0FBRyxFQUFFO1lBQ1QsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFO2dCQUNyQixPQUFPO2FBQ1I7WUFDRCxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDM0IsSUFBSSxJQUFJLEVBQUU7Z0JBQ1IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2FBQ3hDO1FBQ0gsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ1QsQ0FBQztJQUVELFlBQVk7UUFDVixJQUFJLENBQUMsZUFBZSxHQUFHLEdBQUcsRUFBRTtZQUMxQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ25CLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxRQUFRO1FBQ04sSUFBSSxJQUFJLENBQUM7UUFDVCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNiLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7UUFDRCxJQUFJLGVBQWUsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUMxQyxHQUFHLFFBQVEsQ0FBQyxXQUFXLGdCQUFnQixDQUN4QyxDQUFDO1FBQ0YsSUFBSSxpQkFBaUIsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6RSxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDM0QseUNBQXlDO1FBQ3pDLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNwQixZQUFZO1lBQ1osSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDakM7YUFBTSxJQUFJLFFBQVEsRUFBRTtZQUNuQixJQUFJLFFBQVEsR0FBVSxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMvQixJQUFJLFVBQVUsR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDO1lBQ3RDLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDaEQ7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCxRQUFRO1FBQ04sT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxlQUFlLENBQ2hELDhCQUE4QixDQUMvQixDQUFDO0lBQ0osQ0FBQztJQUVELFlBQVksQ0FBQyxJQUFTO1FBQ3BCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUMsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssVUFBVSxFQUFFO1lBQ3RDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQzdCO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQsY0FBYyxDQUFDLElBQVM7UUFDdEIsSUFBSSxJQUFJLFlBQVksU0FBUyxFQUFFO1lBQzdCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7U0FDaEM7UUFDRCxPQUFPLENBQ0wsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6RCxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7Z0JBQzNCLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FDNUIsQ0FBQztJQUNKLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxJQUFTO1FBQ3hCLE9BQU8sQ0FDTCxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUM7WUFDN0QsQ0FBQyxJQUFJLFlBQVksU0FBUztnQkFDeEIsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsWUFBWSxTQUFTLENBQUMsQ0FBQyxDQUM5RCxDQUFDO0lBQ0osQ0FBQztJQUVELGFBQWEsQ0FBQyxJQUFTO1FBQ3JCLDRGQUE0RjtRQUM1RixPQUFPLENBQ0wsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO1lBQ3ZELHlFQUF5RTtZQUN6RSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLFNBQVMsQ0FBQyxDQUN4RCxDQUFDO0lBQ0osQ0FBQztJQUVELGFBQWEsQ0FBQyxPQUFZLEVBQUUsU0FBUyxHQUFHLEtBQUs7UUFDM0MsSUFBSSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBRWYsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNkLGtCQUFrQixHQUFHLE9BQU8sQ0FBQztTQUM5QjtRQUVELElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDWixPQUFPO1NBQ1I7UUFFRCxrRUFBa0U7UUFDbEUsSUFBSSxPQUFPLFlBQVksU0FBUyxJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUNwRSxJQUFJLEdBQUcsT0FBTyxDQUFDO1NBQ2hCO2FBQU07WUFDTCxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDN0M7UUFFRCxJQUFJLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFdkMsSUFBSSxZQUFZLEdBQ2QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDN0QsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN4QyxJQUFJLEtBQUssR0FBRyxVQUFVLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsRCxJQUFJLFNBQVMsQ0FBQztRQUVkLElBQUksT0FBTyxHQUFxQjtZQUM5QixTQUFTO1lBQ1QsSUFBSSxFQUFFO2dCQUNKLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxJQUFJO2FBQ2I7U0FDRixDQUFDO1FBRUYsSUFBSSxVQUFVLEVBQUU7WUFDZCxPQUFPLENBQUMsVUFBVSxHQUFHO2dCQUNuQixJQUFJLEVBQUUsaUJBQWlCLENBQUMsVUFBVSxDQUFDO2dCQUNuQyxNQUFNLEVBQUUsVUFBVTthQUNuQixDQUFDO1NBQ0g7UUFFRCxJQUFJLFlBQVksRUFBRTtZQUNoQixPQUFPLENBQUMsUUFBUSxHQUFHO2dCQUNqQixJQUFJLEVBQUUsWUFBWTthQUNuQixDQUFDO1NBQ0g7UUFFRCxJQUFJLEtBQUssRUFBRTtZQUNULFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sQ0FBQyxLQUFLLEdBQUc7Z0JBQ2QsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1NBQ0g7UUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQscURBQXFEO0lBQ3JELGVBQWUsQ0FBQyxJQUFTLEVBQUUsT0FBeUI7UUFDbEQsSUFBSSxHQUFHLENBQUM7UUFDUixJQUFJLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBRWxDLGdFQUFnRTtRQUNoRSxpRkFBaUY7UUFDakYsSUFBSSxNQUFNLEdBQVE7WUFDaEIsT0FBTyxFQUFFLE9BQU87WUFDaEIsUUFBUSxFQUFFLFVBQVU7WUFDcEIsZUFBZSxFQUFFLDBCQUEwQjtZQUMzQyxNQUFNLEVBQUUsOEJBQThCO1lBQ3RDLE9BQU8sRUFBRSxHQUFHO1lBQ1osS0FBSyxFQUFFLE1BQU07WUFDYixTQUFTLEVBQUUsS0FBSztZQUNoQixTQUFTLEVBQUUsWUFBWTtZQUN2QixLQUFLLEVBQUUsa0JBQWtCO1lBQ3pCLFVBQVUsRUFBRSxtQkFBbUI7WUFDL0IsU0FBUyxFQUFFLE1BQU07WUFDakIsTUFBTSxFQUFFLEtBQUs7WUFDYixHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxPQUFPLElBQUk7WUFDckMsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxJQUFJO1lBQ3ZDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLElBQUk7WUFDeEIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSTtTQUMzQixDQUFDO1FBRUYsSUFBSSxTQUFTLEVBQUU7WUFDYixHQUFHLEdBQUcsVUFBVSxDQUFDO1NBQ2xCO2FBQU07WUFDTCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDakIsR0FBRyxHQUFHLFFBQVEsQ0FBQztZQUNmLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUNwQjtRQUNELEtBQUssSUFBSSxJQUFJLElBQUksTUFBTSxFQUFFO1lBQ3RCLEdBQUcsQ0FBQyxLQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3pDO1FBQ0QsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBRWhCLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDZCxNQUFNLEdBQUcsNkRBQTZELENBQUM7U0FDeEU7UUFFRCxJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDO1FBRWhDLElBQUksUUFBUSxFQUFFO1lBQ1osTUFBTSxJQUFJLCtFQUErRSxVQUFVLENBQ2pHLFFBQVEsQ0FBQyxJQUFJLENBQ2QsYUFBYSxDQUFDO1NBQ2hCO1FBQ0QsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN4QixJQUFJLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFlBQVksU0FBUyxDQUFDLEVBQUU7WUFDaEQsSUFBSSxVQUFVLEVBQUU7Z0JBQ2QsTUFBTSxJQUFJLHFGQUFxRixVQUFVLENBQ3ZHLFVBQVUsQ0FBQyxJQUFJLENBQ2hCLGFBQWEsQ0FBQzthQUNoQjtZQUNELElBQUksSUFBSSxFQUFFO2dCQUNSLE1BQU0sSUFBSSxtRUFBbUUsVUFBVSxDQUNyRixJQUFJLENBQUMsSUFBSSxDQUNWLGFBQWEsQ0FBQzthQUNoQjtTQUNGO2FBQU07WUFDTCxNQUFNLElBQUksa0ZBQWtGLFVBQVUsQ0FDcEcsSUFBSSxDQUFDLElBQUksQ0FDVixhQUFhLENBQUM7U0FDaEI7UUFFRCxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzFCLElBQUksS0FBSyxFQUFFO1lBQ1QsTUFBTSxJQUFJLHNFQUFzRSxVQUFVLENBQ3hGLEtBQUssQ0FBQyxJQUFJLENBQ1gsYUFBYSxDQUFDO1NBQ2hCO1FBQ0QsR0FBRyxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7UUFFdkIsS0FBSyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQWMsR0FBRyxDQUFDLEVBQUU7WUFDcEQsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDO1lBQzFCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNyQixDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRywwQkFBMEIsQ0FBQztZQUNyRCxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDeEIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUM7U0FDbEM7UUFDRCxLQUFLLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBYyxTQUFTLENBQUMsRUFBRTtZQUMxRCxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7U0FDeEI7UUFDRCxLQUFLLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBYyxvQkFBb0IsQ0FBQyxFQUFFO1lBQ3JFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLGtCQUFrQixDQUFDO1NBQ3BDO1FBQ0QsS0FBSyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQWMsbUJBQW1CLENBQUMsRUFBRTtZQUNwRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQztTQUNwQztRQUVELElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDZCxJQUFJLFdBQVcsR0FBRyxVQUFTLENBQVE7Z0JBQ2pDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3RCLENBQUMsQ0FBQztZQUNGLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFjLFlBQVksQ0FBQyxFQUFFO2dCQUNoRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztnQkFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO2dCQUMvQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLHVCQUF1QixDQUFDO2dCQUNoRCxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQztnQkFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO2dCQUMzQixJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQztnQkFDakMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDM0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsUUFBUSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFhLEVBQUUsRUFBRTtvQkFDL0MsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNmLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDbkIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQzthQUNqRDtTQUNGO1FBRUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFM0MsS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQWMsNEJBQTRCLENBQUMsRUFBRTtZQUNoRixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7WUFDOUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2xDLElBQUksSUFBSSxFQUFFO29CQUNSLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7aUJBQy9DO3FCQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRTtvQkFDMUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7aUJBQ3RDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7U0FDSjtRQUVELElBQ0UsS0FBSztZQUNMLEtBQUssQ0FBQyxNQUFNO1lBQ1osQ0FBQyxLQUFLLENBQUMsTUFBTSxZQUFZLFdBQVcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLE9BQU8sQ0FBQyxFQUN6RTtZQUNBLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFjLHlCQUF5QixDQUFDLEVBQUU7Z0JBQzdFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN4RCxDQUFDLENBQUMsQ0FBQzthQUNKO1NBQ0Y7SUFDSCxDQUFDO0lBRUQsU0FBUztRQUNQLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUNoQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7SUFDNUIsQ0FBQztJQUVELFdBQVc7UUFDVCxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7SUFDcEMsQ0FBQztJQUVELGtCQUFrQixDQUFDLEdBQWdCLEVBQUUsSUFBUyxFQUFFLFFBQWdCO1FBQzlELEtBQUssSUFBSSxJQUFJLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUNuQyxLQUFLLFFBQVEsa0JBQWtCLENBQ2hDLEVBQUU7WUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7WUFDOUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RELENBQUMsQ0FBQyxDQUFDO1NBQ0o7SUFDSCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxtQkFBbUIsQ0FBQyxVQUEwQixFQUFFLFFBQTBCO1FBQ3hFLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsVUFBVSxFQUFFO1lBQ2YsT0FBTztTQUNSO1FBQ0QsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQWMsRUFBRSxFQUFFO1lBQ3BDLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLEVBQUU7Z0JBQy9DLElBQUksYUFBYSxHQUFxQixFQUFFLENBQUM7Z0JBQ3pDLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQ1osS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDO29CQUNuQyxRQUFRLEVBQUUsYUFBYTtpQkFDeEIsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7YUFDcEQ7aUJBQU07Z0JBQ0wsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQzthQUMvQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsZ0JBQWdCLENBQUMsVUFBc0I7UUFDckMsSUFBSSxVQUFVLENBQUMsUUFBUSxFQUFFO1lBQ3ZCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7aUJBQzdCLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUMzQjthQUFNO1lBQ0wsT0FBTyxVQUFVLENBQUMsVUFBVSxDQUFDO1NBQzlCO0lBQ0gsQ0FBQztJQUVEOzs7Ozs7Ozs7OztPQVdHO0lBQ0gsZUFBZSxDQUFDLFVBQXNCLEVBQUUsVUFBc0I7UUFDNUQsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7UUFDRCxxREFBcUQ7UUFDckQsSUFDRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUM7WUFDbkMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLEVBQ3RDO1lBQ0EsT0FBTyxLQUFLLENBQUM7U0FDZDtRQUNELE9BQU8sQ0FDTCxJQUFJLENBQUMscUJBQXFCLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQztZQUNsRCxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUN0RCxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILGFBQWEsQ0FBQyxVQUFzQjtRQUNsQyxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckQsSUFBSSxVQUFVLEVBQUU7WUFDZCxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDaEM7SUFDSCxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gsV0FBVyxDQUFDLFVBQXNCO1FBQ2hDLElBQUksVUFBVSxDQUFDLFFBQVEsRUFBRTtZQUN2QixPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsT0FBTyxDQUFDO1NBQ3hDO2FBQU07WUFDTCxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztTQUNuQztJQUNILENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILHFCQUFxQixDQUFDLFVBQXNCLEVBQUUsVUFBc0I7UUFDbEUsT0FBTyxDQUNMLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUM7WUFDbkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUNwQyxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILG9CQUFvQixDQUFDLFVBQXNCO1FBQ3pDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxrQkFBa0IsQ0FBQyxVQUFzQjtRQUN2QyxnRUFBZ0U7UUFDaEUsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDMUMsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7U0FDOUM7UUFDRCxJQUFJLFVBQVUsQ0FBQyxVQUFVLEVBQUU7WUFDekIsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUM7WUFDeEMsSUFBSSxVQUFVLENBQUM7WUFDZixJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUU7Z0JBQ2xCLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO2FBQzNDO2lCQUFNO2dCQUNMLFVBQVUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUM5QztZQUNELElBQ0UsQ0FBQyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsVUFBVSxZQUFZLFVBQVUsQ0FBQyxDQUFDO2dCQUNwRCxLQUFLLENBQUMsT0FBTyxFQUNiO2dCQUNBLG1EQUFtRDtnQkFDbkQsVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLENBQUMsVUFBVSxZQUFZLFVBQVUsQ0FBQyxFQUFFO29CQUN2QyxVQUFVLEdBQUcsVUFBVSxDQUFDLFdBQVcsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDO2lCQUM5RDthQUNGO1lBQ0QsT0FBTyxVQUFVLENBQUM7U0FDbkI7SUFDSCxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILFlBQVksQ0FBQyxVQUFzQjtRQUNqQyxJQUFJLElBQUksRUFDTixhQUFhLEVBQ2IscUJBQXFCLEVBQ3JCLE9BQU8sRUFDUCxNQUFNLEVBQ04sWUFBWSxDQUFDO1FBRWYsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXRELElBQUksU0FBUyxFQUFFO1lBQ2IsYUFBYSxHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzVDLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMvQyxPQUFPLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxLQUFLLENBQUM7WUFDNUMsTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdEMsWUFBWSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDeEM7UUFFRCxJQUFJLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXpDLElBQUksS0FBSyxHQUFtQjtZQUMxQixRQUFRLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVU7WUFDMUQsSUFBSTtZQUNKLFFBQVEsRUFBRSxNQUFNO1lBQ2hCLFNBQVMsRUFBRSxhQUFhO1lBQ3hCLFFBQVEsRUFBRSxZQUFZO1lBQ3RCLGlCQUFpQixFQUFFLHFCQUFxQjtZQUN4QyxXQUFXLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQztZQUNuRCxPQUFPO1lBQ1AsU0FBUyxFQUFFLENBQUMsU0FBUztZQUNyQixZQUFZLEVBQUUsQ0FBQztTQUNoQixDQUFDO1FBRUYsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3JELElBQUksVUFBVSxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ3pELEtBQUssQ0FBQyxVQUFVLEdBQUc7Z0JBQ2pCLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7Z0JBQ3hDLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxVQUFVLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQzthQUN4QyxDQUFDO1lBRUYsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMzQyxJQUFJLEtBQUssRUFBRTtnQkFDVCxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLE9BQU8sRUFBRTtvQkFDbEUsS0FBSyxDQUFDLEtBQUssR0FBRzt3QkFDWixJQUFJLEVBQUUsaUJBQWlCLENBQUMsS0FBSyxDQUFDO3dCQUM5QixZQUFZLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQzt3QkFDakMsUUFBUSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO3dCQUNsQyxJQUFJLEVBQUUsbUJBQW1CO3FCQUMxQixDQUFDO2lCQUNIO3FCQUFNO29CQUNMLEtBQUssQ0FBQyxLQUFLLEdBQUc7d0JBQ1osSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO3dCQUNoRCxJQUFJLEVBQUUsUUFBUSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7cUJBQzlCLENBQUM7aUJBQ0g7YUFDRjtTQUNGO1FBRUQsS0FBSyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFakUsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILGlCQUFpQixDQUFDLFVBQXNCO1FBQ3RDLElBQUksUUFBUSxHQUFHLFVBQVUsQ0FBQyxVQUFVLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7UUFDdkUsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtZQUN6RCxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDdkQ7SUFDSCxDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSCxnQkFBZ0IsQ0FBQyxVQUFzQjtRQUNyQyxJQUFJLElBQUksQ0FBQztRQUVULElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV0RCxJQUFJLFNBQVMsRUFBRTtZQUNiLDhDQUE4QztZQUM5QyxJQUFJLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQzNDLElBQUksSUFBSSxFQUFFO2dCQUNSLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7YUFDbEU7U0FDRjthQUFNO1lBQ0wsNkJBQTZCO1lBQzdCLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN0RCxJQUFJLFlBQVksRUFBRTtnQkFDaEIsT0FBTyxZQUFZLENBQUMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDdkU7U0FDRjtRQUVELGlFQUFpRTtRQUNqRSxJQUFJLElBQUksS0FBSyxVQUFVLEVBQUU7WUFDdkIsSUFBSSxHQUFHLGFBQWEsQ0FBQztTQUN0QjtRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsb0JBQW9CLENBQUMsVUFBc0I7UUFDekMsT0FBTyxVQUFVLENBQUMsU0FBUyxDQUFDO0lBQzlCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILHFCQUFxQixDQUFDLFVBQXNCO1FBQzFDLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN6RCxPQUFPLENBQUMsQ0FBQyxDQUFDLFlBQVksSUFBSSxZQUFZLFlBQVksU0FBUyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsY0FBYyxDQUFDLFVBQXNCLEVBQUUsU0FBa0I7UUFDdkQsSUFBSSxTQUFTLENBQUM7UUFDZCxnQ0FBZ0M7UUFDaEMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25DLEtBQUssQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLEtBQUssQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRXpDLElBQUksT0FBTyxHQUFxQixFQUFFLFNBQVMsRUFBRSxDQUFDO1FBRTlDLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNyRCxJQUFJLFVBQVUsRUFBRTtZQUNkLE9BQU8sQ0FBQyxVQUFVLEdBQUc7Z0JBQ25CLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxVQUFVLENBQUM7Z0JBQ25DLE1BQU0sRUFBRSxVQUFVO2FBQ25CLENBQUM7U0FDSDtRQUVELElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0RCxJQUFJLFlBQVksRUFBRTtZQUNoQixPQUFPLENBQUMsUUFBUSxHQUFHO2dCQUNqQixJQUFJLEVBQUUsWUFBWTthQUNuQixDQUFDO1NBQ0g7UUFFRCxJQUFJLEtBQUssQ0FBQztRQUNWLElBQUksVUFBVSxFQUFFO1lBQ2QsS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDakM7UUFDRCxJQUFJLEtBQUssRUFBRTtZQUNULFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sQ0FBQyxLQUFLLEdBQUc7Z0JBQ2QsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1NBQ0g7UUFFRCxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFakQsSUFBSSxJQUFJLEVBQUU7WUFDUixPQUFPLENBQUMsSUFBSSxHQUFHO2dCQUNiLElBQUksRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDO2dCQUN2QixNQUFNLEVBQUUsSUFBSTthQUNiLENBQUM7U0FDSDtRQUVELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRixDQUFDO0lBQ0E7UUFDRSxLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUMsVUFBVSxFQUFFLEVBQUUsRUFBQyxDQUFDO1FBQ2hDLFFBQVEsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLFFBQVEsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUNoQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVwQyxVQUFVLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxVQUFVLENBQUMsS0FBSyxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7UUFDeEMsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ2xDLFVBQVUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQ3JELFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXRDLDhDQUE4QztRQUM5QyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxLQUFpQixFQUFFLEVBQUU7WUFDOUMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtnQkFDdEIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7YUFDeEM7UUFDSCxDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTlELElBQUksQ0FBQyxhQUFhLEdBQUcsR0FBRyxFQUFFO1lBQ3hCLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtnQkFDcEIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2FBQ2xCO2lCQUFNO2dCQUNMLElBQUksa0JBQWtCLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsQ0FBQztpQkFDeEM7YUFDRjtRQUNILENBQUMsQ0FBQztRQUNGLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRXRELElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3ZCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUM7Z0JBQ2pDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFO2dCQUN0QixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUMxQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUMvQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUM7Z0JBQzVCLGVBQWUsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDO2dCQUM1QyxTQUFTLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQzFCLFlBQVksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQzthQUN2QyxDQUFDLENBQUM7U0FDSjtJQUNILENBQUM7Q0FDRjtBQUVELFNBQVMsVUFBVSxDQUFDLE1BQWM7SUFDaEMsSUFBSSxHQUFHLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN4QyxHQUFHLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNqRCxPQUFPLEdBQUcsQ0FBQyxTQUFTLENBQUM7QUFDdkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludCBuby1jb25kLWFzc2lnbjowICovXG5pbXBvcnQgUG9ydE1peGluIGZyb20gJ2VtYmVyLWRlYnVnL21peGlucy9wb3J0LW1peGluJztcbmltcG9ydCBHbGltbWVyVHJlZSwge1xuICBPcHRpb25zIGFzIEdsaW1tZXJUcmVlT3B0aW9ucyxcbn0gZnJvbSAnZW1iZXItZGVidWcvbGlicy9nbGltbWVyLXRyZWUnO1xuaW1wb3J0IHtcbiAgbW9kZWxOYW1lIGFzIGdldE1vZGVsTmFtZSxcbiAgc2hvcnRNb2RlbE5hbWUgYXMgZ2V0U2hvcnRNb2RlbE5hbWUsXG4gIGNvbnRyb2xsZXJOYW1lIGFzIGdldENvbnRyb2xsZXJOYW1lLFxuICBzaG9ydENvbnRyb2xsZXJOYW1lIGFzIGdldFNob3J0Q29udHJvbGxlck5hbWUsXG4gIHZpZXdOYW1lIGFzIGdldFZpZXdOYW1lLFxuICBzaG9ydFZpZXdOYW1lIGFzIGdldFNob3J0Vmlld05hbWUsXG59IGZyb20gJ2VtYmVyLWRlYnVnL3V0aWxzL25hbWUtZnVuY3Rpb25zJztcbmltcG9ydCB7XG4gIEluc3BlY3RlZE5vZGVWYWx1ZSxcbiAgTWVzc2FnZSxcbiAgSW5zcGVjdE1lc3NhZ2UsXG59IGZyb20gJ2VtYmVyLWRlYnVnL21lc3NhZ2UtdHlwZXMnO1xuXG5jb25zdCBFbWJlciA9IHdpbmRvdy5FbWJlcjtcblxuY29uc3Qge1xuICBndWlkRm9yLFxuICBjb21wdXRlZCxcbiAgcnVuLFxuICBPYmplY3Q6IEVtYmVyT2JqZWN0LFxuICB0eXBlT2YsXG4gIENvbXBvbmVudCxcbiAgQ29udHJvbGxlcixcbiAgVmlld1V0aWxzLFxuICBBLFxufSA9IEVtYmVyO1xuY29uc3QgeyBsYXRlciB9ID0gcnVuO1xuY29uc3QgeyByZWFkT25seSB9ID0gY29tcHV0ZWQ7XG5jb25zdCB7IGdldFZpZXdCb3VuZGluZ0NsaWVudFJlY3QgfSA9IFZpZXdVdGlscztcblxuY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzIHx8IEVtYmVyLmtleXM7XG5cbmxldCBsYXllckRpdjogSFRNTERpdkVsZW1lbnQ7XG5sZXQgcHJldmlld0RpdjogSFRNTERpdkVsZW1lbnQ7XG5sZXQgaGlnaGxpZ2h0ZWRFbGVtZW50OiBhbnk7XG5jb25zdCBub09wID0gKCkgPT4ge307XG5cbnR5cGUgUmVuZGVyTm9kZSA9IGFueTtcblxuaW50ZXJmYWNlIFJlbmRlclRyZWVOb2RlIHtcbiAgdmFsdWU6IGFueTtcbiAgY2hpbGRyZW46IGFueVtdO1xufVxuXG5pbnRlcmZhY2UgUmVuZGVyTm9kZVNwZWMge1xuICB0ZW1wbGF0ZTogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIG9iamVjdElkOiBhbnk7XG4gIHJlbmRlck5vZGVJZDogbnVtYmVyO1xuICB2aWV3Q2xhc3M/OiBzdHJpbmc7XG4gIGR1cmF0aW9uPzogYW55O1xuICBjb21wbGV0ZVZpZXdDbGFzcz86IHN0cmluZztcbiAgaXNDb21wb25lbnQ6IGJvb2xlYW47XG4gIHRhZ05hbWU/OiBzdHJpbmc7XG4gIGlzVmlydHVhbDogYm9vbGVhbjtcbiAgY29udHJvbGxlcj86IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgY29tcGxldGVOYW1lOiBzdHJpbmc7XG4gICAgb2JqZWN0SWQ6IHN0cmluZztcbiAgfTtcbiAgbW9kZWw/OiB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBjb21wbGV0ZU5hbWU/OiBzdHJpbmc7XG4gICAgb2JqZWN0SWQ/OiBzdHJpbmc7XG4gIH07XG59XG5pbnRlcmZhY2UgSGlnaGxpZ2h0T3B0aW9ucyB7XG4gIGlzUHJldmlldzogYm9vbGVhbjtcbiAgY29udHJvbGxlcj86IHsgbmFtZTogc3RyaW5nOyBvYmplY3Q6IGFueSB9O1xuICB0ZW1wbGF0ZT86IHsgbmFtZTogc3RyaW5nIH07XG4gIG1vZGVsPzogeyBuYW1lOiBzdHJpbmc7IG9iamVjdDogYW55IH07XG4gIHZpZXc/OiB7IG5hbWU6IHN0cmluZzsgb2JqZWN0OiBhbnkgfTtcbiAgZWxlbWVudD86IEVsZW1lbnRcbn1cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIGV4dGVuZHMgRW1iZXJPYmplY3QuZXh0ZW5kKFBvcnRNaXhpbiwge1xuICBuYW1lc3BhY2U6IG51bGwsXG5cbiAgYWRhcHRlcjogcmVhZE9ubHkoJ25hbWVzcGFjZS5hZGFwdGVyJyksXG4gIHBvcnQ6IHJlYWRPbmx5KCduYW1lc3BhY2UucG9ydCcpLFxuICBvYmplY3RJbnNwZWN0b3I6IHJlYWRPbmx5KCduYW1lc3BhY2Uub2JqZWN0SW5zcGVjdG9yJyksXG5cbiAgcmV0YWluZWRPYmplY3RzOiBbXSBhcyBhbnksXG5cbiAgX2R1cmF0aW9uczoge30gYXMgYW55LFxuXG4gIG9wdGlvbnM6IHt9IGFzIEdsaW1tZXJUcmVlT3B0aW9ucyxcblxuICBwb3J0TmFtZXNwYWNlOiAndmlldycsXG4gIGdsaW1tZXJUcmVlOiB7fSBhcyBHbGltbWVyVHJlZSxcblxuICByZXNpemVIYW5kbGVyOiBub09wIGFzIGFueSxcbiAgdmlld1RyZWVDaGFuZ2VkOiBub09wIGFzIGFueSxcbiAgbGFzdENsaWNrZWRIYW5kbGVyOiBub09wIGFzIGFueSxcbiAgbW91c2Vtb3ZlSGFuZGxlcjogbm9PcCBhcyBhbnksXG4gIG1vdXNlZG93bkhhbmRsZXI6IG5vT3AgYXMgYW55LFxuICBtb3VzZXVwSGFuZGxlcjogbm9PcCBhcyBhbnksXG5cbiAgbGFzdENsaWNrZWRFbGVtZW50OiBudWxsIGFzIGFueSxcblxuICBldmVudE5hbWVzcGFjZTogY29tcHV0ZWQoZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGB2aWV3X2RlYnVnXyR7Z3VpZEZvcih0aGlzKX1gO1xuICB9KSxcblxuICAvKipcbiAgICogTGlzdCBvZiByZW5kZXIgbm9kZXMgZnJvbSB0aGUgbGFzdFxuICAgKiBzZW50IHZpZXcgdHJlZS5cbiAgICpcbiAgICogQHByb3BlcnR5IGxhc3ROb2Rlc1xuICAgKiBAdHlwZSB7QXJyYXl9XG4gICAqL1xuICBfbGFzdE5vZGVzOiBjb21wdXRlZChmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gQTxhbnk+KFtdKTtcbiAgfSksXG5cbiAgdmlld1JlZ2lzdHJ5OiBjb21wdXRlZCgnbmFtZXNwYWNlLm93bmVyJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T3duZXIoKS5sb29rdXAoJy12aWV3LXJlZ2lzdHJ5Om1haW4nKTtcbiAgfSksXG5cbiAgbWVzc2FnZXM6IHtcbiAgICBnZXRUcmVlKCkge1xuICAgICAgdGhpcy5zZW5kVHJlZSgpO1xuICAgIH0sXG4gICAgaGlkZUxheWVyKCkge1xuICAgICAgdGhpcy5oaWRlTGF5ZXIoKTtcbiAgICB9LFxuICAgIHByZXZpZXdMYXllcihtZXNzYWdlOiBNZXNzYWdlKSB7XG4gICAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgICAvLyA+PSBFbWJlciAyLjlcbiAgICAgICAgdGhpcy5nbGltbWVyVHJlZS5oaWdobGlnaHRMYXllcihcbiAgICAgICAgICBtZXNzYWdlLm9iamVjdElkIHx8IG1lc3NhZ2UuZWxlbWVudElkLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIDEuMTMgPj0gRW1iZXIgPD0gMi44XG4gICAgICAgIGlmIChtZXNzYWdlLnJlbmRlck5vZGVJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhpcy5faGlnaGxpZ2h0Tm9kZShcbiAgICAgICAgICAgIHRoaXMuZ2V0KCdfbGFzdE5vZGVzJykub2JqZWN0QXQobWVzc2FnZS5yZW5kZXJOb2RlSWQpLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0VmlldyhcbiAgICAgICAgICAgIHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5zZW50T2JqZWN0c1ttZXNzYWdlLm9iamVjdElkXSxcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBoaWRlUHJldmlldygpIHtcbiAgICAgIHRoaXMuaGlkZVByZXZpZXcoKTtcbiAgICB9LFxuICAgIGluc3BlY3RWaWV3cyhtZXNzYWdlOiBJbnNwZWN0TWVzc2FnZSkge1xuICAgICAgaWYgKG1lc3NhZ2UuaW5zcGVjdCkge1xuICAgICAgICB0aGlzLnN0YXJ0SW5zcGVjdGluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdG9wSW5zcGVjdGluZygpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBzY3JvbGxUb0VsZW1lbnQoeyBlbGVtZW50SWQgfTogTWVzc2FnZSkge1xuICAgICAgbGV0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgIyR7ZWxlbWVudElkfWApO1xuICAgICAgaWYgKGVsKSB7XG4gICAgICAgIGVsLnNjcm9sbEludG9WaWV3KCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGluc3BlY3RFbGVtZW50KHsgb2JqZWN0SWQsIGVsZW1lbnRJZCB9OiBNZXNzYWdlKSB7XG4gICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgdGhpcy5pbnNwZWN0Vmlld0VsZW1lbnQob2JqZWN0SWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChlbGVtZW50SWQpO1xuICAgICAgICBpZiAoZWxlbWVudCkge1xuICAgICAgICAgIHRoaXMuaW5zcGVjdEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIHNldE9wdGlvbnMoeyBvcHRpb25zIH06IHsgb3B0aW9uczogR2xpbW1lclRyZWVPcHRpb25zIH0pIHtcbiAgICAgIHRoaXMuc2V0KCdvcHRpb25zJywgb3B0aW9ucyk7XG4gICAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgICB0aGlzLmdsaW1tZXJUcmVlLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG4gICAgICB9XG4gICAgICB0aGlzLnNlbmRUcmVlKCk7XG4gICAgfSxcbiAgICBzZW5kTW9kZWxUb0NvbnNvbGUobWVzc2FnZTogSW5zcGVjdGVkTm9kZVZhbHVlKSB7XG4gICAgICBsZXQgbW9kZWw7XG4gICAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgICBtb2RlbCA9IHRoaXMuZ2xpbW1lclRyZWUubW9kZWxGb3JWaWV3Tm9kZVZhbHVlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHJlbmRlck5vZGUgPSB0aGlzLmdldCgnX2xhc3ROb2RlcycpLm9iamVjdEF0KG1lc3NhZ2UucmVuZGVyTm9kZUlkKTtcbiAgICAgICAgbW9kZWwgPSB0aGlzLl9tb2RlbEZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgICB9XG4gICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLnNlbmRWYWx1ZVRvQ29uc29sZShtb2RlbCk7XG4gICAgICB9XG4gICAgfSxcbiAgICBjb250ZXh0TWVudSgpIHtcbiAgICAgIHRoaXMuaW5zcGVjdENvbXBvbmVudEZvck5vZGUodGhpcy5sYXN0Q2xpY2tlZEVsZW1lbnQpO1xuICAgIH0sXG4gIH0sXG5cbiAgaW5zcGVjdENvbXBvbmVudEZvck5vZGUoZG9tTm9kZTogRWxlbWVudCkge1xuICAgIGxldCB2aWV3RWxlbSA9IHRoaXMuZmluZE5lYXJlc3RWaWV3KGRvbU5vZGUpO1xuICAgIGlmICghdmlld0VsZW0pIHtcbiAgICAgIHRoaXMuZ2V0KCdhZGFwdGVyJykubG9nKCdObyBFbWJlciBjb21wb25lbnQgZm91bmQuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZW5kTWVzc2FnZSgnaW5zcGVjdENvbXBvbmVudCcsIHtcbiAgICAgIHZpZXdJZDogdmlld0VsZW0uaWQsXG4gICAgfSk7XG4gIH0sXG5cbiAgdXBkYXRlRHVyYXRpb25zKGR1cmF0aW9uczogYW55KSB7XG4gICAgZm9yIChsZXQgZ3VpZCBpbiBkdXJhdGlvbnMpIHtcbiAgICAgIGlmICghZHVyYXRpb25zLmhhc093blByb3BlcnR5KGd1aWQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgdGhpcy5fZHVyYXRpb25zW2d1aWRdID0gZHVyYXRpb25zW2d1aWRdO1xuICAgIH1cbiAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgdGhpcy5nbGltbWVyVHJlZS51cGRhdGVEdXJhdGlvbnModGhpcy5fZHVyYXRpb25zKTtcbiAgICB9XG4gICAgdGhpcy5zZW5kVHJlZSgpO1xuICB9LFxuXG4gIHJldGFpbk9iamVjdChvYmplY3Q6IGFueSkge1xuICAgIHRoaXMucmV0YWluZWRPYmplY3RzLnB1c2gob2JqZWN0KTtcbiAgICByZXR1cm4gdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLnJldGFpbk9iamVjdChvYmplY3QpO1xuICB9LFxuXG4gIHJlbGVhc2VDdXJyZW50T2JqZWN0cygpIHtcbiAgICB0aGlzLnJldGFpbmVkT2JqZWN0cy5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgIHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5yZWxlYXNlT2JqZWN0KGd1aWRGb3IoaXRlbSkpO1xuICAgIH0pO1xuICAgIHRoaXMucmV0YWluZWRPYmplY3RzID0gW107XG4gIH0sXG5cbiAgd2lsbERlc3Ryb3koKSB7XG4gICAgdGhpcy5fc3VwZXIoKTtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5yZXNpemVIYW5kbGVyKTtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5sYXN0Q2xpY2tlZEhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobGF5ZXJEaXYpO1xuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQocHJldmlld0Rpdik7XG4gICAgdGhpcy5nZXQoJ19sYXN0Tm9kZXMnKS5jbGVhcigpO1xuICAgIHRoaXMucmVsZWFzZUN1cnJlbnRPYmplY3RzKCk7XG4gICAgdGhpcy5zdG9wSW5zcGVjdGluZygpO1xuICB9LFxuXG4gIGluc3BlY3RWaWV3RWxlbWVudChvYmplY3RJZDogYW55KSB7XG4gICAgbGV0IHZpZXcgPSB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuc2VudE9iamVjdHNbb2JqZWN0SWRdO1xuICAgIGlmICh2aWV3ICYmIHZpZXcuZ2V0KCdlbGVtZW50JykpIHtcbiAgICAgIHRoaXMuaW5zcGVjdEVsZW1lbnQodmlldy5nZXQoJ2VsZW1lbnQnKSk7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBPcGVucyB0aGUgXCJFbGVtZW50c1wiIHRhYiBhbmQgc2VsZWN0cyB0aGUgZ2l2ZW4gZWxlbWVudC4gRG9lc24ndCB3b3JrIGluIGFsbFxuICAgKiBicm93c2Vycy9hZGRvbnMgKG9ubHkgaW4gdGhlIENocm9tZSBhbmQgRkYgZGV2dG9vbHMgYWRkb25zIGF0IHRoZSB0aW1lIG9mIHdyaXRpbmcpLlxuICAgKlxuICAgKiBAbWV0aG9kIGluc3BlY3RFbGVtZW50XG4gICAqIEBwYXJhbSAge0VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gaW5zcGVjdFxuICAgKi9cbiAgaW5zcGVjdEVsZW1lbnQoZWxlbWVudDogRWxlbWVudCkge1xuICAgIHRoaXMuZ2V0KCdhZGFwdGVyJykuaW5zcGVjdEVsZW1lbnQoZWxlbWVudCk7XG4gIH0sXG5cbiAgc2VuZFRyZWUoKSB7XG4gICAgcnVuLnNjaGVkdWxlT25jZSgnYWZ0ZXJSZW5kZXInLCB0aGlzLCB0aGlzLnNjaGVkdWxlZFNlbmRUcmVlKTtcbiAgfSxcblxuICBzdGFydEluc3BlY3RpbmcoKSB7XG4gICAgbGV0IHZpZXdFbGVtOiBhbnkgPSBudWxsO1xuICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ3N0YXJ0SW5zcGVjdGluZycsIHt9KTtcblxuICAgIC8vIHdlIGRvbid0IHdhbnQgdGhlIHByZXZpZXcgZGl2IHRvIGludGVyY2VwdCB0aGUgbW91c2Vtb3ZlIGV2ZW50XG4gICAgcHJldmlld0Rpdi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXG4gICAgbGV0IHBpblZpZXcgPSAoKSA9PiB7XG4gICAgICBpZiAodmlld0VsZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgICAgICB0aGlzLmdsaW1tZXJUcmVlLmhpZ2hsaWdodExheWVyKHZpZXdFbGVtLmlkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmhpZ2hsaWdodFZpZXcodmlld0VsZW0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHZpZXcgPSB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuc2VudE9iamVjdHNbdmlld0VsZW0uaWRdO1xuICAgICAgICBpZiAodmlldyBpbnN0YW5jZW9mIENvbXBvbmVudCkge1xuICAgICAgICAgIHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5zZW5kT2JqZWN0KHZpZXcpO1xuICAgICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ2luc3BlY3RDb21wb25lbnQnLCB7IHZpZXdJZDogdmlld0VsZW0uaWQgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMuc3RvcEluc3BlY3RpbmcoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuXG4gICAgdGhpcy5tb3VzZW1vdmVIYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIHZpZXdFbGVtID0gdGhpcy5maW5kTmVhcmVzdFZpZXcoPEVsZW1lbnQ+ZS50YXJnZXQpO1xuXG4gICAgICBpZiAodmlld0VsZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgICAgICB0aGlzLmdsaW1tZXJUcmVlLmhpZ2hsaWdodExheWVyKHZpZXdFbGVtLmlkLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmhpZ2hsaWdodFZpZXcodmlld0VsZW0sIHRydWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICB0aGlzLm1vdXNlZG93bkhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAvLyBwcmV2ZW50IGFwcC1kZWZpbmVkIGNsaWNrcyBmcm9tIGJlaW5nIGZpcmVkXG4gICAgICBwcmV2aWV3RGl2LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJztcbiAgICAgIHByZXZpZXdEaXYuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsICgpID0+IHBpblZpZXcoKSwgeyBvbmNlOiB0cnVlIH0pO1xuICAgIH07XG4gICAgdGhpcy5tb3VzZXVwSGFuZGxlciA9ICgpID0+IHBpblZpZXcoKTtcbiAgICBkb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2Vtb3ZlSGFuZGxlcik7XG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm1vdXNlZG93bkhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMubW91c2V1cEhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gJy13ZWJraXQtem9vbS1pbic7XG4gIH0sXG5cbiAgZmluZE5lYXJlc3RWaWV3KGVsZW06IEVsZW1lbnQgfCBudWxsKTogRWxlbWVudCB8IG51bGwge1xuICAgIGlmICghZWxlbSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChlbGVtLmNsYXNzTGlzdC5jb250YWlucygnZW1iZXItdmlldycpKSB7XG4gICAgICByZXR1cm4gZWxlbTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZmluZE5lYXJlc3RWaWV3KGVsZW0uY2xvc2VzdCgnLmVtYmVyLXZpZXcnKSk7XG4gIH0sXG5cbiAgc3RvcEluc3BlY3RpbmcoKSB7XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlbW92ZUhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5tb3VzZWRvd25IYW5kbGVyKTtcbiAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLm1vdXNldXBIYW5kbGVyKTtcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgIHRoaXMuaGlkZVByZXZpZXcoKTtcbiAgICB0aGlzLnNlbmRNZXNzYWdlKCdzdG9wSW5zcGVjdGluZycsIHt9KTtcbiAgfSxcblxuICBzY2hlZHVsZWRTZW5kVHJlZSgpIHtcbiAgICAvLyBTZW5kIG91dCBvZiBiYW5kXG4gICAgbGF0ZXIoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNEZXN0cm95aW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVsZWFzZUN1cnJlbnRPYmplY3RzKCk7XG4gICAgICBsZXQgdHJlZSA9IHRoaXMudmlld1RyZWUoKTtcbiAgICAgIGlmICh0cmVlKSB7XG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ3ZpZXdUcmVlJywgeyB0cmVlIH0pO1xuICAgICAgfVxuICAgIH0sIDUwKTtcbiAgfSxcblxuICB2aWV3TGlzdGVuZXIoKSB7XG4gICAgdGhpcy52aWV3VHJlZUNoYW5nZWQgPSAoKSA9PiB7XG4gICAgICB0aGlzLnNlbmRUcmVlKCk7XG4gICAgICB0aGlzLmhpZGVMYXllcigpO1xuICAgIH07XG4gIH0sXG5cbiAgdmlld1RyZWUoKSB7XG4gICAgbGV0IHRyZWU7XG4gICAgbGV0IGVtYmVyQXBwID0gdGhpcy5nZXQoJ25hbWVzcGFjZS5vd25lcicpO1xuICAgIGlmICghZW1iZXJBcHApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgbGV0IGFwcGxpY2F0aW9uVmlldyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICBgJHtlbWJlckFwcC5yb290RWxlbWVudH0gPiAuZW1iZXItdmlld2BcbiAgICApO1xuICAgIGxldCBhcHBsaWNhdGlvblZpZXdJZCA9IGFwcGxpY2F0aW9uVmlldyA/IGFwcGxpY2F0aW9uVmlldy5pZCA6IHVuZGVmaW5lZDtcbiAgICBsZXQgcm9vdFZpZXcgPSB0aGlzLmdldCgndmlld1JlZ2lzdHJ5JylbYXBwbGljYXRpb25WaWV3SWRdO1xuICAgIC8vIEluIGNhc2Ugb2YgQXBwLnJlc2V0IHZpZXcgaXMgZGVzdHJveWVkXG4gICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgIC8vIEdsaW1tZXIgMlxuICAgICAgdHJlZSA9IHRoaXMuZ2xpbW1lclRyZWUuYnVpbGQoKTtcbiAgICB9IGVsc2UgaWYgKHJvb3RWaWV3KSB7XG4gICAgICBsZXQgY2hpbGRyZW46IGFueVtdID0gW107XG4gICAgICB0aGlzLmdldCgnX2xhc3ROb2RlcycpLmNsZWFyKCk7XG4gICAgICBsZXQgcmVuZGVyTm9kZSA9IHJvb3RWaWV3Ll9yZW5kZXJOb2RlO1xuICAgICAgdHJlZSA9IHsgdmFsdWU6IHRoaXMuX2luc3BlY3ROb2RlKHJlbmRlck5vZGUpLCBjaGlsZHJlbiB9O1xuICAgICAgdGhpcy5fYXBwZW5kTm9kZUNoaWxkcmVuKHJlbmRlck5vZGUsIGNoaWxkcmVuKTtcbiAgICB9XG4gICAgcmV0dXJuIHRyZWU7XG4gIH0sXG5cbiAgZ2V0T3duZXIoKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0KCduYW1lc3BhY2Uub3duZXInKTtcbiAgfSxcblxuICBpc0dsaW1tZXJUd28oKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0KCduYW1lc3BhY2Uub3duZXInKS5oYXNSZWdpc3RyYXRpb24oXG4gICAgICAnc2VydmljZTotZ2xpbW1lci1lbnZpcm9ubWVudCdcbiAgICApO1xuICB9LFxuXG4gIG1vZGVsRm9yVmlldyh2aWV3OiBhbnkpIHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gdmlldy5nZXQoJ2NvbnRyb2xsZXInKTtcbiAgICBsZXQgbW9kZWwgPSBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICBpZiAodmlldy5nZXQoJ2NvbnRleHQnKSAhPT0gY29udHJvbGxlcikge1xuICAgICAgbW9kZWwgPSB2aWV3LmdldCgnY29udGV4dCcpO1xuICAgIH1cbiAgICByZXR1cm4gbW9kZWw7XG4gIH0sXG5cbiAgc2hvdWxkU2hvd1ZpZXcodmlldzogYW55KSB7XG4gICAgaWYgKHZpZXcgaW5zdGFuY2VvZiBDb21wb25lbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuY29tcG9uZW50cztcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgICh0aGlzLmhhc093bkNvbnRyb2xsZXIodmlldykgfHwgdGhpcy5oYXNPd25Db250ZXh0KHZpZXcpKSAmJlxuICAgICAgKCF2aWV3LmdldCgnaXNWaXJ0dWFsJykgfHxcbiAgICAgICAgdGhpcy5oYXNPd25Db250cm9sbGVyKHZpZXcpIHx8XG4gICAgICAgIHRoaXMuaGFzT3duQ29udGV4dCh2aWV3KSlcbiAgICApO1xuICB9LFxuXG4gIGhhc093bkNvbnRyb2xsZXIodmlldzogYW55KSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHZpZXcuZ2V0KCdjb250cm9sbGVyJykgIT09IHZpZXcuZ2V0KCdfcGFyZW50Vmlldy5jb250cm9sbGVyJykgJiZcbiAgICAgICh2aWV3IGluc3RhbmNlb2YgQ29tcG9uZW50IHx8XG4gICAgICAgICEodmlldy5nZXQoJ19wYXJlbnRWaWV3LmNvbnRyb2xsZXInKSBpbnN0YW5jZW9mIENvbXBvbmVudCkpXG4gICAgKTtcbiAgfSxcblxuICBoYXNPd25Db250ZXh0KHZpZXc6IGFueSkge1xuICAgIC8vIENvbnRleHQgc3dpdGNoaW5nIGlzIGRlcHJlY2F0ZWQsIHdlIHdpbGwgbmVlZCB0byBmaW5kIGEgYmV0dGVyIHdheSBmb3Ige3sjZWFjaH19IGhlbHBlcnMuXG4gICAgcmV0dXJuIChcbiAgICAgIHZpZXcuZ2V0KCdjb250ZXh0JykgIT09IHZpZXcuZ2V0KCdfcGFyZW50Vmlldy5jb250ZXh0JykgJiZcbiAgICAgIC8vIG1ha2Ugc3VyZSBub3QgYSB2aWV3IGluc2lkZSBhIGNvbXBvbmVudCwgbGlrZSBge3t5aWVsZH19YCBmb3IgZXhhbXBsZS5cbiAgICAgICEodmlldy5nZXQoJ19wYXJlbnRWaWV3LmNvbnRleHQnKSBpbnN0YW5jZW9mIENvbXBvbmVudClcbiAgICApO1xuICB9LFxuXG4gIGhpZ2hsaWdodFZpZXcoZWxlbWVudDogYW55LCBpc1ByZXZpZXcgPSBmYWxzZSkge1xuICAgIGxldCB2aWV3LCByZWN0O1xuXG4gICAgaWYgKCFpc1ByZXZpZXcpIHtcbiAgICAgIGhpZ2hsaWdodGVkRWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgfVxuXG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gZWxlbWVudCAmJiBlbGVtZW50Ll9yZW5kZXJOb2RlIHRvIGRldGVjdCB0b3AgdmlldyAoYXBwbGljYXRpb24pXG4gICAgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21wb25lbnQgfHwgKGVsZW1lbnQgJiYgZWxlbWVudC5fcmVuZGVyTm9kZSkpIHtcbiAgICAgIHZpZXcgPSBlbGVtZW50O1xuICAgIH0gZWxzZSB7XG4gICAgICB2aWV3ID0gdGhpcy5nZXQoJ3ZpZXdSZWdpc3RyeScpW2VsZW1lbnQuaWRdO1xuICAgIH1cblxuICAgIHJlY3QgPSBnZXRWaWV3Qm91bmRpbmdDbGllbnRSZWN0KHZpZXcpO1xuXG4gICAgbGV0IHRlbXBsYXRlTmFtZSA9XG4gICAgICB2aWV3LmdldCgndGVtcGxhdGVOYW1lJykgfHwgdmlldy5nZXQoJ19kZWJ1Z1RlbXBsYXRlTmFtZScpO1xuICAgIGxldCBjb250cm9sbGVyID0gdmlldy5nZXQoJ2NvbnRyb2xsZXInKTtcbiAgICBsZXQgbW9kZWwgPSBjb250cm9sbGVyICYmIGNvbnRyb2xsZXIuZ2V0KCdtb2RlbCcpO1xuICAgIGxldCBtb2RlbE5hbWU7XG5cbiAgICBsZXQgb3B0aW9uczogSGlnaGxpZ2h0T3B0aW9ucyA9IHtcbiAgICAgIGlzUHJldmlldyxcbiAgICAgIHZpZXc6IHtcbiAgICAgICAgbmFtZTogZ2V0U2hvcnRWaWV3TmFtZSh2aWV3KSxcbiAgICAgICAgb2JqZWN0OiB2aWV3LFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgaWYgKGNvbnRyb2xsZXIpIHtcbiAgICAgIG9wdGlvbnMuY29udHJvbGxlciA9IHtcbiAgICAgICAgbmFtZTogZ2V0Q29udHJvbGxlck5hbWUoY29udHJvbGxlciksXG4gICAgICAgIG9iamVjdDogY29udHJvbGxlcixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKHRlbXBsYXRlTmFtZSkge1xuICAgICAgb3B0aW9ucy50ZW1wbGF0ZSA9IHtcbiAgICAgICAgbmFtZTogdGVtcGxhdGVOYW1lLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAobW9kZWwpIHtcbiAgICAgIG1vZGVsTmFtZSA9IHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5pbnNwZWN0KG1vZGVsKTtcbiAgICAgIG9wdGlvbnMubW9kZWwgPSB7XG4gICAgICAgIG5hbWU6IG1vZGVsTmFtZSxcbiAgICAgICAgb2JqZWN0OiBtb2RlbCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhpcy5faGlnaGxpZ2h0UmFuZ2UocmVjdCwgb3B0aW9ucyk7XG4gIH0sXG5cbiAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgYSBzZXJpb3VzIHJlZmFjdG9yL2NsZWFudXBcbiAgX2hpZ2hsaWdodFJhbmdlKHJlY3Q6IGFueSwgb3B0aW9uczogSGlnaGxpZ2h0T3B0aW9ucykge1xuICAgIGxldCBkaXY7XG4gICAgbGV0IGlzUHJldmlldyA9IG9wdGlvbnMuaXNQcmV2aWV3O1xuXG4gICAgLy8gdGFrZSBpbnRvIGFjY291bnQgdGhlIHNjcm9sbGluZyBwb3NpdGlvbiBhcyBtZW50aW9uZWQgaW4gZG9jc1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdFxuICAgIGxldCBzdHlsZXM6IGFueSA9IHtcbiAgICAgIGRpc3BsYXk6ICdibG9jaycsXG4gICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC43KScsXG4gICAgICBib3JkZXI6ICcycHggc29saWQgcmdiKDEwMiwgMTAyLCAxMDIpJyxcbiAgICAgIHBhZGRpbmc6ICcwJyxcbiAgICAgIHJpZ2h0OiAnYXV0bycsXG4gICAgICBkaXJlY3Rpb246ICdsdHInLFxuICAgICAgYm94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG4gICAgICBjb2xvcjogJ3JnYig1MSwgNTEsIDI1NSknLFxuICAgICAgZm9udEZhbWlseTogJ01lbmxvLCBzYW5zLXNlcmlmJyxcbiAgICAgIG1pbkhlaWdodDogJzYzcHgnLFxuICAgICAgekluZGV4OiAxMDAwMCxcbiAgICAgIHRvcDogYCR7cmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWX1weGAsXG4gICAgICBsZWZ0OiBgJHtyZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWH1weGAsXG4gICAgICB3aWR0aDogYCR7cmVjdC53aWR0aH1weGAsXG4gICAgICBoZWlnaHQ6IGAke3JlY3QuaGVpZ2h0fXB4YCxcbiAgICB9O1xuXG4gICAgaWYgKGlzUHJldmlldykge1xuICAgICAgZGl2ID0gcHJldmlld0RpdjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5oaWRlTGF5ZXIoKTtcbiAgICAgIGRpdiA9IGxheWVyRGl2O1xuICAgICAgdGhpcy5oaWRlUHJldmlldygpO1xuICAgIH1cbiAgICBmb3IgKGxldCBwcm9wIGluIHN0eWxlcykge1xuICAgICAgKGRpdi5zdHlsZSBhcyBhbnkpW3Byb3BdID0gc3R5bGVzW3Byb3BdO1xuICAgIH1cbiAgICBsZXQgb3V0cHV0ID0gJyc7XG5cbiAgICBpZiAoIWlzUHJldmlldykge1xuICAgICAgb3V0cHV0ID0gXCI8c3BhbiBjbGFzcz0nY2xvc2UnIGRhdGEtbGFiZWw9J2xheWVyLWNsb3NlJz4mdGltZXM7PC9zcGFuPlwiO1xuICAgIH1cblxuICAgIGxldCB0ZW1wbGF0ZSA9IG9wdGlvbnMudGVtcGxhdGU7XG5cbiAgICBpZiAodGVtcGxhdGUpIHtcbiAgICAgIG91dHB1dCArPSBgPHAgY2xhc3M9J3RlbXBsYXRlJz48c3Bhbj50ZW1wbGF0ZTwvc3Bhbj49PHNwYW4gZGF0YS1sYWJlbD0nbGF5ZXItdGVtcGxhdGUnPiR7ZXNjYXBlSFRNTChcbiAgICAgICAgdGVtcGxhdGUubmFtZVxuICAgICAgKX08L3NwYW4+PC9wPmA7XG4gICAgfVxuICAgIGxldCB2aWV3ID0gb3B0aW9ucy52aWV3O1xuICAgIGxldCBjb250cm9sbGVyID0gb3B0aW9ucy5jb250cm9sbGVyO1xuICAgIGlmICghdmlldyB8fCAhKHZpZXcub2JqZWN0IGluc3RhbmNlb2YgQ29tcG9uZW50KSkge1xuICAgICAgaWYgKGNvbnRyb2xsZXIpIHtcbiAgICAgICAgb3V0cHV0ICs9IGA8cCBjbGFzcz0nY29udHJvbGxlcic+PHNwYW4+Y29udHJvbGxlcjwvc3Bhbj49PHNwYW4gZGF0YS1sYWJlbD0nbGF5ZXItY29udHJvbGxlcic+JHtlc2NhcGVIVE1MKFxuICAgICAgICAgIGNvbnRyb2xsZXIubmFtZVxuICAgICAgICApfTwvc3Bhbj48L3A+YDtcbiAgICAgIH1cbiAgICAgIGlmICh2aWV3KSB7XG4gICAgICAgIG91dHB1dCArPSBgPHAgY2xhc3M9J3ZpZXcnPjxzcGFuPnZpZXc8L3NwYW4+PTxzcGFuIGRhdGEtbGFiZWw9J2xheWVyLXZpZXcnPiR7ZXNjYXBlSFRNTChcbiAgICAgICAgICB2aWV3Lm5hbWVcbiAgICAgICAgKX08L3NwYW4+PC9wPmA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dCArPSBgPHAgY2xhc3M9J2NvbXBvbmVudCc+PHNwYW4+Y29tcG9uZW50PC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci1jb21wb25lbnQnPiR7ZXNjYXBlSFRNTChcbiAgICAgICAgdmlldy5uYW1lXG4gICAgICApfTwvc3Bhbj48L3A+YDtcbiAgICB9XG5cbiAgICBsZXQgbW9kZWwgPSBvcHRpb25zLm1vZGVsO1xuICAgIGlmIChtb2RlbCkge1xuICAgICAgb3V0cHV0ICs9IGA8cCBjbGFzcz0nbW9kZWwnPjxzcGFuPm1vZGVsPC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci1tb2RlbCc+JHtlc2NhcGVIVE1MKFxuICAgICAgICBtb2RlbC5uYW1lXG4gICAgICApfTwvc3Bhbj48L3A+YDtcbiAgICB9XG4gICAgZGl2LmlubmVySFRNTCA9IG91dHB1dDtcblxuICAgIGZvciAobGV0IHAgb2YgZGl2LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdwJykpIHtcbiAgICAgIHAuc3R5bGUuY3NzRmxvYXQgPSAnbGVmdCc7XG4gICAgICBwLnN0eWxlLm1hcmdpbiA9ICcwJztcbiAgICAgIHAuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC45KSc7XG4gICAgICBwLnN0eWxlLnBhZGRpbmcgPSAnNXB4JztcbiAgICAgIHAuc3R5bGUuY29sb3IgPSAncmdiKDAsIDAsIDE1MyknO1xuICAgIH1cbiAgICBmb3IgKGxldCBwIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PigncC5tb2RlbCcpKSB7XG4gICAgICBwLnN0eWxlLmNsZWFyID0gJ2xlZnQnO1xuICAgIH1cbiAgICBmb3IgKGxldCBwIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PigncCBzcGFuOmZpcnN0LWNoaWxkJykpIHtcbiAgICAgIHAuc3R5bGUuY29sb3IgPSAncmdiKDE1MywgMTUzLCAwKSc7XG4gICAgfVxuICAgIGZvciAobGV0IHAgb2YgZGl2LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdwIHNwYW46bGFzdC1jaGlsZCcpKSB7XG4gICAgICBwLnN0eWxlLmNvbG9yID0gJ3JnYigxNTMsIDAsIDE1MyknO1xuICAgIH1cblxuICAgIGlmICghaXNQcmV2aWV3KSB7XG4gICAgICBsZXQgY2FuY2VsRXZlbnQgPSBmdW5jdGlvbihlOiBFdmVudCkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICB9O1xuICAgICAgZm9yIChsZXQgc3BhbiBvZiBkaXYucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3NwYW4uY2xvc2UnKSkge1xuICAgICAgICBzcGFuLnN0eWxlLmNzc0Zsb2F0ID0gJ3JpZ2h0JztcbiAgICAgICAgc3Bhbi5zdHlsZS5tYXJnaW4gPSAnNXB4JztcbiAgICAgICAgc3Bhbi5zdHlsZS5iYWNrZ3JvdW5kID0gJyM2NjYnO1xuICAgICAgICBzcGFuLnN0eWxlLmNvbG9yID0gJyNlZWUnO1xuICAgICAgICBzcGFuLnN0eWxlLmZvbnRGYW1pbHkgPSAnaGVsdmV0aWNhLCBzYW5zLXNlcmlmJztcbiAgICAgICAgc3Bhbi5zdHlsZS5mb250U2l6ZSA9ICcxNHB4JztcbiAgICAgICAgc3Bhbi5zdHlsZS53aWR0aCA9ICcxNnB4JztcbiAgICAgICAgc3Bhbi5zdHlsZS5oZWlnaHQgPSAnMTZweCc7XG4gICAgICAgIHNwYW4uc3R5bGUubGluZUhlaWdodCA9ICcxNHB4JztcbiAgICAgICAgc3Bhbi5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnMTZweCc7XG4gICAgICAgIHNwYW4uc3R5bGUudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgICAgIHNwYW4uc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICBzcGFuLnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgc3Bhbi5zdHlsZS5mb250V2VpZ2h0ID0gJ25vcm1hbCc7XG4gICAgICAgIHNwYW4uc3R5bGUudGV4dFNoYWRvdyA9ICdub25lJztcbiAgICAgICAgc3Bhbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgY2FuY2VsRXZlbnQoZSk7XG4gICAgICAgICAgdGhpcy5oaWRlTGF5ZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGNhbmNlbEV2ZW50KTtcbiAgICAgICAgc3Bhbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBjYW5jZWxFdmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fYWRkQ2xpY2tMaXN0ZW5lcnMoZGl2LCB2aWV3LCAnY29tcG9uZW50Jyk7XG4gICAgdGhpcy5fYWRkQ2xpY2tMaXN0ZW5lcnMoZGl2LCBjb250cm9sbGVyLCAnY29udHJvbGxlcicpO1xuICAgIHRoaXMuX2FkZENsaWNrTGlzdGVuZXJzKGRpdiwgdmlldywgJ3ZpZXcnKTtcblxuICAgIGZvciAobGV0IHNwYW4gb2YgZGl2LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdwLnRlbXBsYXRlIHNwYW46bGFzdC1jaGlsZCcpKSB7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICh2aWV3KSB7XG4gICAgICAgICAgdGhpcy5pbnNwZWN0Vmlld0VsZW1lbnQoZ3VpZEZvcih2aWV3Lm9iamVjdCkpO1xuICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnMuZWxlbWVudCkge1xuICAgICAgICAgIHRoaXMuaW5zcGVjdEVsZW1lbnQob3B0aW9ucy5lbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgbW9kZWwgJiZcbiAgICAgIG1vZGVsLm9iamVjdCAmJlxuICAgICAgKG1vZGVsLm9iamVjdCBpbnN0YW5jZW9mIEVtYmVyT2JqZWN0IHx8IHR5cGVPZihtb2RlbC5vYmplY3QpID09PSAnYXJyYXknKVxuICAgICkge1xuICAgICAgZm9yIChsZXQgc3BhbiBvZiBkaXYucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3AubW9kZWwgc3BhbjpsYXN0LWNoaWxkJykpIHtcbiAgICAgICAgc3Bhbi5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLnNlbmRPYmplY3QobW9kZWwhLm9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICBoaWRlTGF5ZXIoKSB7XG4gICAgbGF5ZXJEaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICBoaWdobGlnaHRlZEVsZW1lbnQgPSBudWxsO1xuICB9LFxuXG4gIGhpZGVQcmV2aWV3KCkge1xuICAgIHByZXZpZXdEaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgfSxcblxuICBfYWRkQ2xpY2tMaXN0ZW5lcnMoZGl2OiBIVE1MRWxlbWVudCwgaXRlbTogYW55LCBzZWxlY3Rvcjogc3RyaW5nKSB7XG4gICAgZm9yIChsZXQgc3BhbiBvZiBkaXYucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICBgcC4ke3NlbGVjdG9yfSBzcGFuOmxhc3QtY2hpbGRgXG4gICAgKSkge1xuICAgICAgc3Bhbi5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICBzcGFuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuc2VuZE9iamVjdChpdGVtLm9iamVjdCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdhbGsgdGhlIHJlbmRlciBub2RlIGhpZXJhcmNoeSBhbmQgYnVpbGQgdGhlIHRyZWUuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcGFyYW0gIHtBcnJheX0gY2hpbGRyZW5cbiAgICovXG4gIF9hcHBlbmROb2RlQ2hpbGRyZW4ocmVuZGVyTm9kZTogUmVuZGVyVHJlZU5vZGUsIGNoaWxkcmVuOiBSZW5kZXJUcmVlTm9kZVtdKSB7XG4gICAgbGV0IGNoaWxkTm9kZXMgPSB0aGlzLl9jaGlsZHJlbkZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgaWYgKCFjaGlsZE5vZGVzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNoaWxkTm9kZXMuZm9yRWFjaCgoY2hpbGROb2RlOiBhbnkpID0+IHtcbiAgICAgIGlmICh0aGlzLl9zaG91bGRTaG93Tm9kZShjaGlsZE5vZGUsIHJlbmRlck5vZGUpKSB7XG4gICAgICAgIGxldCBncmFuZENoaWxkcmVuOiBSZW5kZXJUcmVlTm9kZVtdID0gW107XG4gICAgICAgIGNoaWxkcmVuLnB1c2goe1xuICAgICAgICAgIHZhbHVlOiB0aGlzLl9pbnNwZWN0Tm9kZShjaGlsZE5vZGUpLFxuICAgICAgICAgIGNoaWxkcmVuOiBncmFuZENoaWxkcmVuLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fYXBwZW5kTm9kZUNoaWxkcmVuKGNoaWxkTm9kZSwgZ3JhbmRDaGlsZHJlbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9hcHBlbmROb2RlQ2hpbGRyZW4oY2hpbGROb2RlLCBjaGlsZHJlbik7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEdhdGhlciB0aGUgY2hpbGRyZW4gYXNzaWduZWQgdG8gdGhlIHJlbmRlciBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7QXJyYXl9IGNoaWxkcmVuXG4gICAqL1xuICBfY2hpbGRyZW5Gb3JOb2RlKHJlbmRlck5vZGU6IFJlbmRlck5vZGUpIHtcbiAgICBpZiAocmVuZGVyTm9kZS5tb3JwaE1hcCkge1xuICAgICAgcmV0dXJuIGtleXMocmVuZGVyTm9kZS5tb3JwaE1hcClcbiAgICAgICAgLm1hcChrZXkgPT4gcmVuZGVyTm9kZS5tb3JwaE1hcFtrZXldKVxuICAgICAgICAuZmlsdGVyKG5vZGUgPT4gISFub2RlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHJlbmRlck5vZGUuY2hpbGROb2RlcztcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgYSByZW5kZXIgbm9kZSBpcyBlbGxpZ2libGUgdG8gYmUgaW5jbHVkZWRcbiAgICogaW4gdGhlIHRyZWUuXG4gICAqIERlcGVuZHMgb24gd2hldGhlciB0aGUgbm9kZSBpcyBhY3R1YWxseSBhIHZpZXcgbm9kZVxuICAgKiAoYXMgb3Bwb3NlZCB0byBhbiBhdHRyaWJ1dGUgbm9kZSBmb3IgZXhhbXBsZSksXG4gICAqIGFuZCBhbHNvIGNoZWNrcyB0aGUgZmlsdGVyaW5nIG9wdGlvbnMuIEZvciBleGFtcGxlLFxuICAgKiBzaG93aW5nIEVtYmVyIGNvbXBvbmVudCBub2RlcyBjYW4gYmUgdG9nZ2xlZC5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEBwYXJhbSAge09iamVjdH0gcGFyZW50Tm9kZVxuICAgKiBAcmV0dXJuIHtCb29sZWFufSBgdHJ1ZWAgZm9yIHNob3cgYW5kIGBmYWxzZWAgdG8gc2tpcCB0aGUgbm9kZVxuICAgKi9cbiAgX3Nob3VsZFNob3dOb2RlKHJlbmRlck5vZGU6IFJlbmRlck5vZGUsIHBhcmVudE5vZGU6IFJlbmRlck5vZGUpIHtcbiAgICAvLyBGaWx0ZXIgb3V0IG5vbi0odmlldy9jb21wb25lbnRzKVxuICAgIGlmICghdGhpcy5fbm9kZUlzVmlldyhyZW5kZXJOb2RlKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBIYXMgZWl0aGVyIGEgdGVtcGxhdGUgb3IgYSB2aWV3L2NvbXBvbmVudCBpbnN0YW5jZVxuICAgIGlmIChcbiAgICAgICF0aGlzLl9ub2RlVGVtcGxhdGVOYW1lKHJlbmRlck5vZGUpICYmXG4gICAgICAhdGhpcy5fbm9kZUhhc1ZpZXdJbnN0YW5jZShyZW5kZXJOb2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fbm9kZUhhc093bkNvbnRyb2xsZXIocmVuZGVyTm9kZSwgcGFyZW50Tm9kZSkgJiZcbiAgICAgICh0aGlzLm9wdGlvbnMuY29tcG9uZW50cyB8fCAhdGhpcy5fbm9kZUlzRW1iZXJDb21wb25lbnQocmVuZGVyTm9kZSkpICYmXG4gICAgICAodGhpcy5fbm9kZUhhc1ZpZXdJbnN0YW5jZShyZW5kZXJOb2RlKSB8fFxuICAgICAgICB0aGlzLl9ub2RlSGFzT3duQ29udHJvbGxlcihyZW5kZXJOb2RlLCBwYXJlbnROb2RlKSlcbiAgICApO1xuICB9LFxuXG4gIC8qKlxuICAgKiBUaGUgbm9kZSdzIG1vZGVsLiBJZiB0aGUgdmlldyBoYXMgYSBjb250cm9sbGVyLFxuICAgKiBpdCB3aWxsIGJlIHRoZSBjb250cm9sbGVyJ3MgYG1vZGVsYCBwcm9wZXJ0eS5zXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcmV0dXJuIHtPYmplY3R9IHRoZSBtb2RlbFxuICAgKi9cbiAgX21vZGVsRm9yTm9kZShyZW5kZXJOb2RlOiBSZW5kZXJOb2RlKSB7XG4gICAgbGV0IGNvbnRyb2xsZXIgPSB0aGlzLl9jb250cm9sbGVyRm9yTm9kZShyZW5kZXJOb2RlKTtcbiAgICBpZiAoY29udHJvbGxlcikge1xuICAgICAgcmV0dXJuIGNvbnRyb2xsZXIuZ2V0KCdtb2RlbCcpO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogTm90IGFsbCBub2RlcyBhcmUgYWN0dWFsbHkgdmlld3MvY29tcG9uZW50cy5cbiAgICogTm9kZXMgY2FuIGJlIGF0dHJpYnV0ZXMgZm9yIGV4YW1wbGUuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKi9cbiAgX25vZGVJc1ZpZXcocmVuZGVyTm9kZTogUmVuZGVyTm9kZSkge1xuICAgIGlmIChyZW5kZXJOb2RlLmdldFN0YXRlKSB7XG4gICAgICByZXR1cm4gISFyZW5kZXJOb2RlLmdldFN0YXRlKCkubWFuYWdlcjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICEhcmVuZGVyTm9kZS5zdGF0ZS5tYW5hZ2VyO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBub2RlIGhhcyBpdHMgb3duIGNvbnRyb2xsZXIgKGFzIG9wcG9zZWQgdG8gc2hhcmluZ1xuICAgKiBpdHMgcGFyZW50J3MgY29udHJvbGxlcikuXG4gICAqIFVzZWZ1bCB0byBpZGVudGlmeSByb3V0ZSB2aWV3cyBmcm9tIG90aGVyIHZpZXdzLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHBhcmFtICB7T2JqZWN0fSBwYXJlbnROb2RlXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuICBfbm9kZUhhc093bkNvbnRyb2xsZXIocmVuZGVyTm9kZTogUmVuZGVyTm9kZSwgcGFyZW50Tm9kZTogUmVuZGVyTm9kZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9jb250cm9sbGVyRm9yTm9kZShyZW5kZXJOb2RlKSAhPT1cbiAgICAgIHRoaXMuX2NvbnRyb2xsZXJGb3JOb2RlKHBhcmVudE5vZGUpXG4gICAgKTtcbiAgfSxcblxuICAvKipcbiAgICogQ2hlY2sgaWYgdGhlIG5vZGUgaGFzIGEgdmlldyBpbnN0YW5jZS5cbiAgICogVmlydHVhbCBub2RlcyBkb24ndCBoYXZlIGEgdmlldy9jb21wb25lbnQgaW5zdGFuY2UuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKi9cbiAgX25vZGVIYXNWaWV3SW5zdGFuY2UocmVuZGVyTm9kZTogUmVuZGVyTm9kZSkge1xuICAgIHJldHVybiAhIXRoaXMuX3ZpZXdJbnN0YW5jZUZvck5vZGUocmVuZGVyTm9kZSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG5vZGVzJyBjb250cm9sbGVyLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7RW1iZXIuQ29udHJvbGxlcn1cbiAgICovXG4gIF9jb250cm9sbGVyRm9yTm9kZShyZW5kZXJOb2RlOiBSZW5kZXJOb2RlKSB7XG4gICAgLy8gSWYgaXQncyBhIGNvbXBvbmVudCB0aGVuIHJldHVybiB0aGUgY29tcG9uZW50IGluc3RhbmNlIGl0c2VsZlxuICAgIGlmICh0aGlzLl9ub2RlSXNFbWJlckNvbXBvbmVudChyZW5kZXJOb2RlKSkge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZpZXdJbnN0YW5jZUZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgfVxuICAgIGlmIChyZW5kZXJOb2RlLmxhc3RSZXN1bHQpIHtcbiAgICAgIGxldCBzY29wZSA9IHJlbmRlck5vZGUubGFzdFJlc3VsdC5zY29wZTtcbiAgICAgIGxldCBjb250cm9sbGVyO1xuICAgICAgaWYgKHNjb3BlLmdldExvY2FsKSB7XG4gICAgICAgIGNvbnRyb2xsZXIgPSBzY29wZS5nZXRMb2NhbCgnY29udHJvbGxlcicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udHJvbGxlciA9IHNjb3BlLmxvY2Fscy5jb250cm9sbGVyLnZhbHVlKCk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICghY29udHJvbGxlciB8fCAhKGNvbnRyb2xsZXIgaW5zdGFuY2VvZiBDb250cm9sbGVyKSkgJiZcbiAgICAgICAgc2NvcGUuZ2V0U2VsZlxuICAgICAgKSB7XG4gICAgICAgIC8vIEVtYmVyID49IDIuMiArIG5vIGVtYmVyLWxlZ2FjeS1jb250cm9sbGVycyBhZGRvblxuICAgICAgICBjb250cm9sbGVyID0gc2NvcGUuZ2V0U2VsZigpLnZhbHVlKCk7XG4gICAgICAgIGlmICghKGNvbnRyb2xsZXIgaW5zdGFuY2VvZiBDb250cm9sbGVyKSkge1xuICAgICAgICAgIGNvbnRyb2xsZXIgPSBjb250cm9sbGVyLl9jb250cm9sbGVyIHx8IGNvbnRyb2xsZXIuY29udHJvbGxlcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGNvbnRyb2xsZXI7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBJbnNwZWN0IGEgbm9kZS4gVGhpcyB3aWxsIHJldHVybiBhbiBvYmplY3Qgd2l0aCBhbGxcbiAgICogdGhlIHJlcXVpcmVkIHByb3BlcnRpZXMgdG8gYmUgYWRkZWQgdG8gdGhlIHZpZXcgdHJlZVxuICAgKiB0byBiZSBzZW50LlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7T2JqZWN0fSB0aGUgb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlcXVpcmVkIHZhbHVlc1xuICAgKi9cbiAgX2luc3BlY3ROb2RlKHJlbmRlck5vZGU6IFJlbmRlck5vZGUpOiBSZW5kZXJOb2RlU3BlYyB7XG4gICAgbGV0IG5hbWUsXG4gICAgICB2aWV3Q2xhc3NOYW1lLFxuICAgICAgY29tcGxldGVWaWV3Q2xhc3NOYW1lLFxuICAgICAgdGFnTmFtZSxcbiAgICAgIHZpZXdJZCxcbiAgICAgIHRpbWVUb1JlbmRlcjtcblxuICAgIGxldCB2aWV3Q2xhc3MgPSB0aGlzLl92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGUpO1xuXG4gICAgaWYgKHZpZXdDbGFzcykge1xuICAgICAgdmlld0NsYXNzTmFtZSA9IGdldFNob3J0Vmlld05hbWUodmlld0NsYXNzKTtcbiAgICAgIGNvbXBsZXRlVmlld0NsYXNzTmFtZSA9IGdldFZpZXdOYW1lKHZpZXdDbGFzcyk7XG4gICAgICB0YWdOYW1lID0gdmlld0NsYXNzLmdldCgndGFnTmFtZScpIHx8ICdkaXYnO1xuICAgICAgdmlld0lkID0gdGhpcy5yZXRhaW5PYmplY3Qodmlld0NsYXNzKTtcbiAgICAgIHRpbWVUb1JlbmRlciA9IHRoaXMuX2R1cmF0aW9uc1t2aWV3SWRdO1xuICAgIH1cblxuICAgIG5hbWUgPSB0aGlzLl9ub2RlRGVzY3JpcHRpb24ocmVuZGVyTm9kZSk7XG5cbiAgICBsZXQgdmFsdWU6IFJlbmRlck5vZGVTcGVjID0ge1xuICAgICAgdGVtcGxhdGU6IHRoaXMuX25vZGVUZW1wbGF0ZU5hbWUocmVuZGVyTm9kZSkgfHwgJyhpbmxpbmUpJyxcbiAgICAgIG5hbWUsXG4gICAgICBvYmplY3RJZDogdmlld0lkLFxuICAgICAgdmlld0NsYXNzOiB2aWV3Q2xhc3NOYW1lLFxuICAgICAgZHVyYXRpb246IHRpbWVUb1JlbmRlcixcbiAgICAgIGNvbXBsZXRlVmlld0NsYXNzOiBjb21wbGV0ZVZpZXdDbGFzc05hbWUsXG4gICAgICBpc0NvbXBvbmVudDogdGhpcy5fbm9kZUlzRW1iZXJDb21wb25lbnQocmVuZGVyTm9kZSksXG4gICAgICB0YWdOYW1lLFxuICAgICAgaXNWaXJ0dWFsOiAhdmlld0NsYXNzLFxuICAgICAgcmVuZGVyTm9kZUlkOiAwLFxuICAgIH07XG5cbiAgICBsZXQgY29udHJvbGxlciA9IHRoaXMuX2NvbnRyb2xsZXJGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgIGlmIChjb250cm9sbGVyICYmICF0aGlzLl9ub2RlSXNFbWJlckNvbXBvbmVudChyZW5kZXJOb2RlKSkge1xuICAgICAgdmFsdWUuY29udHJvbGxlciA9IHtcbiAgICAgICAgbmFtZTogZ2V0U2hvcnRDb250cm9sbGVyTmFtZShjb250cm9sbGVyKSxcbiAgICAgICAgY29tcGxldGVOYW1lOiBnZXRDb250cm9sbGVyTmFtZShjb250cm9sbGVyKSxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMucmV0YWluT2JqZWN0KGNvbnRyb2xsZXIpLFxuICAgICAgfTtcblxuICAgICAgbGV0IG1vZGVsID0gdGhpcy5fbW9kZWxGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgIGlmIChFbWJlck9iamVjdC5kZXRlY3RJbnN0YW5jZShtb2RlbCkgfHwgdHlwZU9mKG1vZGVsKSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgIHZhbHVlLm1vZGVsID0ge1xuICAgICAgICAgICAgbmFtZTogZ2V0U2hvcnRNb2RlbE5hbWUobW9kZWwpLFxuICAgICAgICAgICAgY29tcGxldGVOYW1lOiBnZXRNb2RlbE5hbWUobW9kZWwpLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMucmV0YWluT2JqZWN0KG1vZGVsKSxcbiAgICAgICAgICAgIHR5cGU6ICd0eXBlLWVtYmVyLW9iamVjdCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZS5tb2RlbCA9IHtcbiAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5pbnNwZWN0KG1vZGVsKSxcbiAgICAgICAgICAgIHR5cGU6IGB0eXBlLSR7dHlwZU9mKG1vZGVsKX1gLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YWx1ZS5yZW5kZXJOb2RlSWQgPSB0aGlzLmdldCgnX2xhc3ROb2RlcycpLnB1c2gocmVuZGVyTm9kZSkgLSAxO1xuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9LFxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIG5vZGUncyB0ZW1wbGF0ZSBuYW1lLiBSZWxpZXMgb24gYW4gaHRtbGJhcnNcbiAgICogZmVhdHVyZSB0aGF0IGFkZHMgdGhlIG1vZHVsZSBuYW1lIGFzIGEgbWV0YSBwcm9wZXJ0eVxuICAgKiB0byBjb21waWxlZCB0ZW1wbGF0ZXMuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcmV0dXJuIHtTdHJpbmd9IHRoZSB0ZW1wbGF0ZSBuYW1lXG4gICAqL1xuICBfbm9kZVRlbXBsYXRlTmFtZShyZW5kZXJOb2RlOiBSZW5kZXJOb2RlKSB7XG4gICAgbGV0IHRlbXBsYXRlID0gcmVuZGVyTm9kZS5sYXN0UmVzdWx0ICYmIHJlbmRlck5vZGUubGFzdFJlc3VsdC50ZW1wbGF0ZTtcbiAgICBpZiAodGVtcGxhdGUgJiYgdGVtcGxhdGUubWV0YSAmJiB0ZW1wbGF0ZS5tZXRhLm1vZHVsZU5hbWUpIHtcbiAgICAgIHJldHVybiB0ZW1wbGF0ZS5tZXRhLm1vZHVsZU5hbWUucmVwbGFjZSgvXFwuaGJzJC8sICcnKTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIFRoZSBub2RlJ3MgbmFtZS4gU2hvdWxkIGJlIGFueXRoaW5nIHRoYXQgdGhlIHVzZXJcbiAgICogY2FuIHVzZSB0byBpZGVudGl0eSB3aGF0IG5vZGUgd2UgYXJlIHRhbGtpbmcgYWJvdXQuXG4gICAqXG4gICAqIFVzdWFsbHkgZWl0aGVyIHRoZSB2aWV3IGluc3RhbmNlIG5hbWUsIG9yIHRoZSB0ZW1wbGF0ZSBuYW1lLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cbiAgX25vZGVEZXNjcmlwdGlvbihyZW5kZXJOb2RlOiBSZW5kZXJOb2RlKSB7XG4gICAgbGV0IG5hbWU7XG5cbiAgICBsZXQgdmlld0NsYXNzID0gdGhpcy5fdmlld0luc3RhbmNlRm9yTm9kZShyZW5kZXJOb2RlKTtcblxuICAgIGlmICh2aWV3Q2xhc3MpIHtcbiAgICAgIC8vLiBIYXMgYSB2aWV3IGluc3RhbmNlIC0gdGFrZSB0aGUgdmlldydzIG5hbWVcbiAgICAgIG5hbWUgPSB2aWV3Q2xhc3MuZ2V0KCdfZGVidWdDb250YWluZXJLZXknKTtcbiAgICAgIGlmIChuYW1lKSB7XG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLy4qKHZpZXd8Y29tcG9uZW50KTovLCAnJykucmVwbGFjZSgvOiQvLCAnJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFZpcnR1YWwgLSBubyB2aWV3IGluc3RhbmNlXG4gICAgICBsZXQgdGVtcGxhdGVOYW1lID0gdGhpcy5fbm9kZVRlbXBsYXRlTmFtZShyZW5kZXJOb2RlKTtcbiAgICAgIGlmICh0ZW1wbGF0ZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRlbXBsYXRlTmFtZS5yZXBsYWNlKC9eLip0ZW1wbGF0ZXNcXC8vLCAnJykucmVwbGFjZSgvXFwvL2csICcuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgYXBwbGljYXRpb24gdmlldyB3YXMgbm90IGRlZmluZWQsIGl0IHVzZXMgYSBgdG9wbGV2ZWxgIHZpZXdcbiAgICBpZiAobmFtZSA9PT0gJ3RvcGxldmVsJykge1xuICAgICAgbmFtZSA9ICdhcHBsaWNhdGlvbic7XG4gICAgfVxuICAgIHJldHVybiBuYW1lO1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZXR1cm4gYSBub2RlJ3MgdmlldyBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge0VtYmVyLlZpZXd8RW1iZXIuQ29tcG9uZW50fSBUaGUgdmlldyBvciBjb21wb25lbnQgaW5zdGFuY2VcbiAgICovXG4gIF92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGU6IFJlbmRlck5vZGUpIHtcbiAgICByZXR1cm4gcmVuZGVyTm9kZS5lbWJlclZpZXc7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJldHVybnMgd2hldGhlciB0aGUgbm9kZSBpcyBhbiBFbWJlciBDb21wb25lbnQgb3Igbm90LlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICovXG4gIF9ub2RlSXNFbWJlckNvbXBvbmVudChyZW5kZXJOb2RlOiBSZW5kZXJOb2RlKSB7XG4gICAgbGV0IHZpZXdJbnN0YW5jZSA9IHRoaXMuX3ZpZXdJbnN0YW5jZUZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgcmV0dXJuICEhKHZpZXdJbnN0YW5jZSAmJiB2aWV3SW5zdGFuY2UgaW5zdGFuY2VvZiBDb21wb25lbnQpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBIaWdobGlnaHQgYSByZW5kZXIgbm9kZSBvbiB0aGUgc2NyZWVuLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHBhcmFtICB7Qm9vbGVhbn0gaXNQcmV2aWV3ICh3aGV0aGVyIHRvIHBpbiB0aGUgbGF5ZXIgb3Igbm90KVxuICAgKi9cbiAgX2hpZ2hsaWdodE5vZGUocmVuZGVyTm9kZTogUmVuZGVyTm9kZSwgaXNQcmV2aWV3OiBib29sZWFuKSB7XG4gICAgbGV0IG1vZGVsTmFtZTtcbiAgICAvLyBUb2RvOiBzaG91bGQgYmUgaW4gRW1iZXIgY29yZVxuICAgIGxldCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgcmFuZ2Uuc2V0U3RhcnRCZWZvcmUocmVuZGVyTm9kZS5maXJzdE5vZGUpO1xuICAgIHJhbmdlLnNldEVuZEFmdGVyKHJlbmRlck5vZGUubGFzdE5vZGUpO1xuICAgIGxldCByZWN0ID0gcmFuZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICBsZXQgb3B0aW9uczogSGlnaGxpZ2h0T3B0aW9ucyA9IHsgaXNQcmV2aWV3IH07XG5cbiAgICBsZXQgY29udHJvbGxlciA9IHRoaXMuX2NvbnRyb2xsZXJGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgIGlmIChjb250cm9sbGVyKSB7XG4gICAgICBvcHRpb25zLmNvbnRyb2xsZXIgPSB7XG4gICAgICAgIG5hbWU6IGdldENvbnRyb2xsZXJOYW1lKGNvbnRyb2xsZXIpLFxuICAgICAgICBvYmplY3Q6IGNvbnRyb2xsZXIsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGxldCB0ZW1wbGF0ZU5hbWUgPSB0aGlzLl9ub2RlVGVtcGxhdGVOYW1lKHJlbmRlck5vZGUpO1xuICAgIGlmICh0ZW1wbGF0ZU5hbWUpIHtcbiAgICAgIG9wdGlvbnMudGVtcGxhdGUgPSB7XG4gICAgICAgIG5hbWU6IHRlbXBsYXRlTmFtZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IG1vZGVsO1xuICAgIGlmIChjb250cm9sbGVyKSB7XG4gICAgICBtb2RlbCA9IGNvbnRyb2xsZXIuZ2V0KCdtb2RlbCcpO1xuICAgIH1cbiAgICBpZiAobW9kZWwpIHtcbiAgICAgIG1vZGVsTmFtZSA9IHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5pbnNwZWN0KG1vZGVsKTtcbiAgICAgIG9wdGlvbnMubW9kZWwgPSB7XG4gICAgICAgIG5hbWU6IG1vZGVsTmFtZSxcbiAgICAgICAgb2JqZWN0OiBtb2RlbCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IHZpZXcgPSB0aGlzLl92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGUpO1xuXG4gICAgaWYgKHZpZXcpIHtcbiAgICAgIG9wdGlvbnMudmlldyA9IHtcbiAgICAgICAgbmFtZTogZ2V0Vmlld05hbWUodmlldyksXG4gICAgICAgIG9iamVjdDogdmlldyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhpcy5faGlnaGxpZ2h0UmFuZ2UocmVjdCwgb3B0aW9ucyk7XG4gIH0sXG59KSB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCk7XG5cbiAgICB0aGlzLnZpZXdMaXN0ZW5lcigpO1xuICAgIHRoaXMucmV0YWluZWRPYmplY3RzID0gW107XG4gICAgdGhpcy5vcHRpb25zID0ge2NvbXBvbmVudHM6IFtdfTtcbiAgICBsYXllckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGxheWVyRGl2LnNldEF0dHJpYnV0ZSgnZGF0YS1sYWJlbCcsICdsYXllci1kaXYnKTtcbiAgICBsYXllckRpdi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobGF5ZXJEaXYpO1xuXG4gICAgcHJldmlld0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHByZXZpZXdEaXYuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICBwcmV2aWV3RGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgcHJldmlld0Rpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtbGFiZWwnLCAncHJldmlldy1kaXYnKTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHByZXZpZXdEaXYpO1xuXG4gICAgLy8gU3RvcmUgbGFzdCBjbGlja2VkIGVsZW1lbnQgZm9yIGNvbnRleHQgbWVudVxuICAgIHRoaXMubGFzdENsaWNrZWRIYW5kbGVyID0gKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAyKSB7XG4gICAgICAgIHRoaXMubGFzdENsaWNrZWRFbGVtZW50ID0gZXZlbnQudGFyZ2V0O1xuICAgICAgfVxuICAgIH07XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMubGFzdENsaWNrZWRIYW5kbGVyKTtcblxuICAgIHRoaXMucmVzaXplSGFuZGxlciA9ICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmdsaW1tZXJUcmVlKSB7XG4gICAgICAgIHRoaXMuaGlkZUxheWVyKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoaGlnaGxpZ2h0ZWRFbGVtZW50KSB7XG4gICAgICAgICAgdGhpcy5oaWdobGlnaHRWaWV3KGhpZ2hsaWdodGVkRWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLnJlc2l6ZUhhbmRsZXIpO1xuXG4gICAgaWYgKHRoaXMuaXNHbGltbWVyVHdvKCkpIHtcbiAgICAgIHRoaXMuZ2xpbW1lclRyZWUgPSBuZXcgR2xpbW1lclRyZWUoe1xuICAgICAgICBvd25lcjogdGhpcy5nZXRPd25lcigpLFxuICAgICAgICByZXRhaW5PYmplY3Q6IHRoaXMucmV0YWluT2JqZWN0LmJpbmQodGhpcyksXG4gICAgICAgIGhpZ2hsaWdodFJhbmdlOiB0aGlzLl9oaWdobGlnaHRSYW5nZS5iaW5kKHRoaXMpLFxuICAgICAgICBvcHRpb25zOiB0aGlzLmdldCgnb3B0aW9ucycpLFxuICAgICAgICBvYmplY3RJbnNwZWN0b3I6IHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKSxcbiAgICAgICAgZHVyYXRpb25zOiB0aGlzLl9kdXJhdGlvbnMsXG4gICAgICAgIHZpZXdSZWdpc3RyeTogdGhpcy5nZXQoJ3ZpZXdSZWdpc3RyeScpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUhUTUwoc3RyaW5nOiBzdHJpbmcpIHtcbiAgbGV0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBkaXYuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3RyaW5nKSk7XG4gIHJldHVybiBkaXYuaW5uZXJIVE1MO1xufVxuIl19