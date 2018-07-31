/* eslint no-cond-assign:0 */
import PortMixin from 'ember-debug/mixins/port-mixin';
import GlimmerTree from 'ember-debug/libs/glimmer-tree';
import { modelName as getModelName, shortModelName as getShortModelName, controllerName as getControllerName, shortControllerName as getShortControllerName, viewName as getViewName, shortViewName as getShortViewName } from 'ember-debug/utils/name-functions';
const Ember = window.Ember;
const { guidFor, computed, run, Object: EmberObject, typeOf, Component, Controller, ViewUtils, A } = Ember;
const { later } = run;
const { readOnly } = computed;
const { getViewBoundingClientRect } = ViewUtils;
const keys = Object.keys || Ember.keys;
let layerDiv, previewDiv, highlightedElement;
export default EmberObject.extend(PortMixin, {
    namespace: null,
    adapter: readOnly('namespace.adapter'),
    port: readOnly('namespace.port'),
    objectInspector: readOnly('namespace.objectInspector'),
    retainedObjects: [],
    _durations: {},
    options: {},
    portNamespace: 'view',
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
                this.inspectElement(element);
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
        }
    },
    init() {
        this._super(...arguments);
        this.viewListener();
        this.retainedObjects = [];
        this.options = {};
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
                viewRegistry: this.get('viewRegistry')
            });
        }
    },
    inspectComponentForNode(domNode) {
        let viewElem = this.findNearestView(domNode);
        if (!viewElem) {
            this.get('adapter').log('No Ember component found.');
            return;
        }
        this.sendMessage('inspectComponent', {
            viewId: viewElem.id
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
        this.retainedObjects.forEach(item => {
            this.get('objectInspector').releaseObject(guidFor(item));
        });
        this.retainedObjects = [];
    },
    eventNamespace: computed(function () {
        return `view_debug_${guidFor(this)}`;
    }),
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
        return (this.hasOwnController(view) || this.hasOwnContext(view)) &&
            (!view.get('isVirtual') || this.hasOwnController(view) || this.hasOwnContext(view));
    },
    hasOwnController(view) {
        return view.get('controller') !== view.get('_parentView.controller') &&
            ((view instanceof Component) || !(view.get('_parentView.controller') instanceof Component));
    },
    hasOwnContext(view) {
        // Context switching is deprecated, we will need to find a better way for {{#each}} helpers.
        return view.get('context') !== view.get('_parentView.context') &&
            // make sure not a view inside a component, like `{{yield}}` for example.
            !(view.get('_parentView.context') instanceof Component);
    },
    highlightView(element, isPreview) {
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
                object: view
            }
        };
        if (controller) {
            options.controller = {
                name: getControllerName(controller),
                object: controller
            };
        }
        if (templateName) {
            options.template = {
                name: templateName
            };
        }
        if (model) {
            modelName = this.get('objectInspector').inspect(model);
            options.model = {
                name: modelName,
                object: model
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
            height: `${rect.height}px`
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
            output = '<span class=\'close\' data-label=\'layer-close\'>&times;</span>';
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
            p.style.float = 'left';
            p.style.margin = 0;
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
                span.style.float = 'right';
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
        if (model && model.object && ((model.object instanceof EmberObject) || typeOf(model.object) === 'array')) {
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
        childNodes.forEach(childNode => {
            if (this._shouldShowNode(childNode, renderNode)) {
                let grandChildren = [];
                children.push({ value: this._inspectNode(childNode), children: grandChildren });
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
            return keys(renderNode.morphMap).map(key => renderNode.morphMap[key]).filter(node => !!node);
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
        if (!this._nodeTemplateName(renderNode) && !this._nodeHasViewInstance(renderNode)) {
            return false;
        }
        return this._nodeHasOwnController(renderNode, parentNode) &&
            (this.options.components || !(this._nodeIsEmberComponent(renderNode))) &&
            (this._nodeHasViewInstance(renderNode) || this._nodeHasOwnController(renderNode, parentNode));
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
        return this._controllerForNode(renderNode) !== this._controllerForNode(parentNode);
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
            if ((!controller || !(controller instanceof Controller)) && scope.getSelf) {
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
            isVirtual: !viewClass
        };
        let controller = this._controllerForNode(renderNode);
        if (controller && !(this._nodeIsEmberComponent(renderNode))) {
            value.controller = {
                name: getShortControllerName(controller),
                completeName: getControllerName(controller),
                objectId: this.retainObject(controller)
            };
            let model = this._modelForNode(renderNode);
            if (model) {
                if (EmberObject.detectInstance(model) || typeOf(model) === 'array') {
                    value.model = {
                        name: getShortModelName(model),
                        completeName: getModelName(model),
                        objectId: this.retainObject(model),
                        type: 'type-ember-object'
                    };
                }
                else {
                    value.model = {
                        name: this.get('objectInspector').inspect(model),
                        type: `type-${typeOf(model)}`
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
        return !!(viewInstance && (viewInstance instanceof Component));
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
                object: controller
            };
        }
        let templateName = this._nodeTemplateName(renderNode);
        if (templateName) {
            options.template = {
                name: templateName
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
                object: model
            };
        }
        let view = this._viewInstanceForNode(renderNode);
        if (view) {
            options.view = {
                name: getViewName(view),
                object: view
            };
        }
        this._highlightRange(rect, options);
    }
});
function escapeHTML(string) {
    let div = document.createElement('div');
    div.appendChild(document.createTextNode(string));
    return div.innerHTML;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlldy1kZWJ1Zy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZXctZGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsNkJBQTZCO0FBQzdCLE9BQU8sU0FBUyxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sV0FBVyxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFDTCxTQUFTLElBQUksWUFBWSxFQUN6QixjQUFjLElBQUksaUJBQWlCLEVBQ25DLGNBQWMsSUFBSSxpQkFBaUIsRUFDbkMsbUJBQW1CLElBQUksc0JBQXNCLEVBQzdDLFFBQVEsSUFBSSxXQUFXLEVBQ3ZCLGFBQWEsSUFBSSxnQkFBZ0IsRUFDbEMsTUFBTSxrQ0FBa0MsQ0FBQztBQUUxQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO0FBRTNCLE1BQU0sRUFDSixPQUFPLEVBQ1AsUUFBUSxFQUNSLEdBQUcsRUFDSCxNQUFNLEVBQUUsV0FBVyxFQUNuQixNQUFNLEVBQ04sU0FBUyxFQUNULFVBQVUsRUFDVixTQUFTLEVBQ1QsQ0FBQyxFQUNGLEdBQUcsS0FBSyxDQUFDO0FBQ1YsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQztBQUN0QixNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsUUFBUSxDQUFDO0FBQzlCLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxHQUFHLFNBQVMsQ0FBQztBQUVoRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFFdkMsSUFBSSxRQUFRLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixDQUFDO0FBRTdDLGVBQWUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUU7SUFFM0MsU0FBUyxFQUFFLElBQUk7SUFFZixPQUFPLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixDQUFDO0lBQ3RDLElBQUksRUFBRSxRQUFRLENBQUMsZ0JBQWdCLENBQUM7SUFDaEMsZUFBZSxF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QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50IG5vLWNvbmQtYXNzaWduOjAgKi9cbmltcG9ydCBQb3J0TWl4aW4gZnJvbSAnZW1iZXItZGVidWcvbWl4aW5zL3BvcnQtbWl4aW4nO1xuaW1wb3J0IEdsaW1tZXJUcmVlIGZyb20gJ2VtYmVyLWRlYnVnL2xpYnMvZ2xpbW1lci10cmVlJztcbmltcG9ydCB7XG4gIG1vZGVsTmFtZSBhcyBnZXRNb2RlbE5hbWUsXG4gIHNob3J0TW9kZWxOYW1lIGFzIGdldFNob3J0TW9kZWxOYW1lLFxuICBjb250cm9sbGVyTmFtZSBhcyBnZXRDb250cm9sbGVyTmFtZSxcbiAgc2hvcnRDb250cm9sbGVyTmFtZSBhcyBnZXRTaG9ydENvbnRyb2xsZXJOYW1lLFxuICB2aWV3TmFtZSBhcyBnZXRWaWV3TmFtZSxcbiAgc2hvcnRWaWV3TmFtZSBhcyBnZXRTaG9ydFZpZXdOYW1lXG59IGZyb20gJ2VtYmVyLWRlYnVnL3V0aWxzL25hbWUtZnVuY3Rpb25zJztcblxuY29uc3QgRW1iZXIgPSB3aW5kb3cuRW1iZXI7XG5cbmNvbnN0IHtcbiAgZ3VpZEZvcixcbiAgY29tcHV0ZWQsXG4gIHJ1bixcbiAgT2JqZWN0OiBFbWJlck9iamVjdCxcbiAgdHlwZU9mLFxuICBDb21wb25lbnQsXG4gIENvbnRyb2xsZXIsXG4gIFZpZXdVdGlscyxcbiAgQVxufSA9IEVtYmVyO1xuY29uc3QgeyBsYXRlciB9ID0gcnVuO1xuY29uc3QgeyByZWFkT25seSB9ID0gY29tcHV0ZWQ7XG5jb25zdCB7IGdldFZpZXdCb3VuZGluZ0NsaWVudFJlY3QgfSA9IFZpZXdVdGlscztcblxuY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzIHx8IEVtYmVyLmtleXM7XG5cbmxldCBsYXllckRpdiwgcHJldmlld0RpdiwgaGlnaGxpZ2h0ZWRFbGVtZW50O1xuXG5leHBvcnQgZGVmYXVsdCBFbWJlck9iamVjdC5leHRlbmQoUG9ydE1peGluLCB7XG5cbiAgbmFtZXNwYWNlOiBudWxsLFxuXG4gIGFkYXB0ZXI6IHJlYWRPbmx5KCduYW1lc3BhY2UuYWRhcHRlcicpLFxuICBwb3J0OiByZWFkT25seSgnbmFtZXNwYWNlLnBvcnQnKSxcbiAgb2JqZWN0SW5zcGVjdG9yOiByZWFkT25seSgnbmFtZXNwYWNlLm9iamVjdEluc3BlY3RvcicpLFxuXG4gIHJldGFpbmVkT2JqZWN0czogW10sXG5cbiAgX2R1cmF0aW9uczoge30sXG5cbiAgb3B0aW9uczoge30sXG5cbiAgcG9ydE5hbWVzcGFjZTogJ3ZpZXcnLFxuXG4gIG1lc3NhZ2VzOiB7XG4gICAgZ2V0VHJlZSgpIHtcbiAgICAgIHRoaXMuc2VuZFRyZWUoKTtcbiAgICB9LFxuICAgIGhpZGVMYXllcigpIHtcbiAgICAgIHRoaXMuaGlkZUxheWVyKCk7XG4gICAgfSxcbiAgICBwcmV2aWV3TGF5ZXIobWVzc2FnZSkge1xuICAgICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgICAgLy8gPj0gRW1iZXIgMi45XG4gICAgICAgIHRoaXMuZ2xpbW1lclRyZWUuaGlnaGxpZ2h0TGF5ZXIobWVzc2FnZS5vYmplY3RJZCB8fCBtZXNzYWdlLmVsZW1lbnRJZCwgdHJ1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyAxLjEzID49IEVtYmVyIDw9IDIuOFxuICAgICAgICBpZiAobWVzc2FnZS5yZW5kZXJOb2RlSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRoaXMuX2hpZ2hsaWdodE5vZGUodGhpcy5nZXQoJ19sYXN0Tm9kZXMnKS5vYmplY3RBdChtZXNzYWdlLnJlbmRlck5vZGVJZCksIHRydWUpO1xuICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2Uub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmhpZ2hsaWdodFZpZXcodGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLnNlbnRPYmplY3RzW21lc3NhZ2Uub2JqZWN0SWRdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgaGlkZVByZXZpZXcoKSB7XG4gICAgICB0aGlzLmhpZGVQcmV2aWV3KCk7XG4gICAgfSxcbiAgICBpbnNwZWN0Vmlld3MobWVzc2FnZSkge1xuICAgICAgaWYgKG1lc3NhZ2UuaW5zcGVjdCkge1xuICAgICAgICB0aGlzLnN0YXJ0SW5zcGVjdGluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdG9wSW5zcGVjdGluZygpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBzY3JvbGxUb0VsZW1lbnQoeyBlbGVtZW50SWQgfSkge1xuICAgICAgbGV0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgIyR7ZWxlbWVudElkfWApO1xuICAgICAgaWYgKGVsKSB7XG4gICAgICAgIGVsLnNjcm9sbEludG9WaWV3KCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGluc3BlY3RFbGVtZW50KHsgb2JqZWN0SWQsIGVsZW1lbnRJZCB9KSB7XG4gICAgICBpZiAob2JqZWN0SWQpIHtcbiAgICAgICAgdGhpcy5pbnNwZWN0Vmlld0VsZW1lbnQob2JqZWN0SWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChlbGVtZW50SWQpO1xuICAgICAgICB0aGlzLmluc3BlY3RFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0sXG4gICAgc2V0T3B0aW9ucyh7IG9wdGlvbnMgfSkge1xuICAgICAgdGhpcy5zZXQoJ29wdGlvbnMnLCBvcHRpb25zKTtcbiAgICAgIGlmICh0aGlzLmdsaW1tZXJUcmVlKSB7XG4gICAgICAgIHRoaXMuZ2xpbW1lclRyZWUudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuc2VuZFRyZWUoKTtcbiAgICB9LFxuICAgIHNlbmRNb2RlbFRvQ29uc29sZShtZXNzYWdlKSB7XG4gICAgICBsZXQgbW9kZWw7XG4gICAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgICBtb2RlbCA9IHRoaXMuZ2xpbW1lclRyZWUubW9kZWxGb3JWaWV3Tm9kZVZhbHVlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHJlbmRlck5vZGUgPSB0aGlzLmdldCgnX2xhc3ROb2RlcycpLm9iamVjdEF0KG1lc3NhZ2UucmVuZGVyTm9kZUlkKTtcbiAgICAgICAgbW9kZWwgPSB0aGlzLl9tb2RlbEZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgICB9XG4gICAgICBpZiAobW9kZWwpIHtcbiAgICAgICAgdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLnNlbmRWYWx1ZVRvQ29uc29sZShtb2RlbCk7XG4gICAgICB9XG4gICAgfSxcbiAgICBjb250ZXh0TWVudSgpIHtcbiAgICAgIHRoaXMuaW5zcGVjdENvbXBvbmVudEZvck5vZGUodGhpcy5sYXN0Q2xpY2tlZEVsZW1lbnQpO1xuICAgIH1cbiAgfSxcblxuICBpbml0KCkge1xuICAgIHRoaXMuX3N1cGVyKC4uLmFyZ3VtZW50cyk7XG5cbiAgICB0aGlzLnZpZXdMaXN0ZW5lcigpO1xuICAgIHRoaXMucmV0YWluZWRPYmplY3RzID0gW107XG4gICAgdGhpcy5vcHRpb25zID0ge307XG4gICAgbGF5ZXJEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBsYXllckRpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtbGFiZWwnLCAnbGF5ZXItZGl2Jyk7XG4gICAgbGF5ZXJEaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxheWVyRGl2KTtcblxuICAgIHByZXZpZXdEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwcmV2aWV3RGl2LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG4gICAgcHJldmlld0Rpdi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIHByZXZpZXdEaXYuc2V0QXR0cmlidXRlKCdkYXRhLWxhYmVsJywgJ3ByZXZpZXctZGl2Jyk7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwcmV2aWV3RGl2KTtcblxuICAgIC8vIFN0b3JlIGxhc3QgY2xpY2tlZCBlbGVtZW50IGZvciBjb250ZXh0IG1lbnVcbiAgICB0aGlzLmxhc3RDbGlja2VkSGFuZGxlciA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LmJ1dHRvbiA9PT0gMikge1xuICAgICAgICB0aGlzLmxhc3RDbGlja2VkRWxlbWVudCA9IGV2ZW50LnRhcmdldDtcbiAgICAgIH1cbiAgICB9O1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLmxhc3RDbGlja2VkSGFuZGxlcik7XG5cbiAgICB0aGlzLnJlc2l6ZUhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgICB0aGlzLmhpZGVMYXllcigpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGhpZ2hsaWdodGVkRWxlbWVudCkge1xuICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0VmlldyhoaWdobGlnaHRlZEVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5yZXNpemVIYW5kbGVyKTtcblxuICAgIGlmICh0aGlzLmlzR2xpbW1lclR3bygpKSB7XG4gICAgICB0aGlzLmdsaW1tZXJUcmVlID0gbmV3IEdsaW1tZXJUcmVlKHtcbiAgICAgICAgb3duZXI6IHRoaXMuZ2V0T3duZXIoKSxcbiAgICAgICAgcmV0YWluT2JqZWN0OiB0aGlzLnJldGFpbk9iamVjdC5iaW5kKHRoaXMpLFxuICAgICAgICBoaWdobGlnaHRSYW5nZTogdGhpcy5faGlnaGxpZ2h0UmFuZ2UuYmluZCh0aGlzKSxcbiAgICAgICAgb3B0aW9uczogdGhpcy5nZXQoJ29wdGlvbnMnKSxcbiAgICAgICAgb2JqZWN0SW5zcGVjdG9yOiB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJyksXG4gICAgICAgIGR1cmF0aW9uczogdGhpcy5fZHVyYXRpb25zLFxuICAgICAgICB2aWV3UmVnaXN0cnk6IHRoaXMuZ2V0KCd2aWV3UmVnaXN0cnknKVxuICAgICAgfSk7XG4gICAgfVxuICB9LFxuXG4gIGluc3BlY3RDb21wb25lbnRGb3JOb2RlKGRvbU5vZGUpIHtcbiAgICBsZXQgdmlld0VsZW0gPSB0aGlzLmZpbmROZWFyZXN0Vmlldyhkb21Ob2RlKTtcbiAgICBpZiAoIXZpZXdFbGVtKSB7XG4gICAgICB0aGlzLmdldCgnYWRhcHRlcicpLmxvZygnTm8gRW1iZXIgY29tcG9uZW50IGZvdW5kLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ2luc3BlY3RDb21wb25lbnQnLCB7XG4gICAgICB2aWV3SWQ6IHZpZXdFbGVtLmlkXG4gICAgfSk7XG4gIH0sXG5cbiAgdXBkYXRlRHVyYXRpb25zKGR1cmF0aW9ucykge1xuICAgIGZvciAobGV0IGd1aWQgaW4gZHVyYXRpb25zKSB7XG4gICAgICBpZiAoIWR1cmF0aW9ucy5oYXNPd25Qcm9wZXJ0eShndWlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2R1cmF0aW9uc1tndWlkXSA9IGR1cmF0aW9uc1tndWlkXTtcbiAgICB9XG4gICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgIHRoaXMuZ2xpbW1lclRyZWUudXBkYXRlRHVyYXRpb25zKHRoaXMuX2R1cmF0aW9ucyk7XG4gICAgfVxuICAgIHRoaXMuc2VuZFRyZWUoKTtcbiAgfSxcblxuICByZXRhaW5PYmplY3Qob2JqZWN0KSB7XG4gICAgdGhpcy5yZXRhaW5lZE9iamVjdHMucHVzaChvYmplY3QpO1xuICAgIHJldHVybiB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykucmV0YWluT2JqZWN0KG9iamVjdCk7XG4gIH0sXG5cbiAgcmVsZWFzZUN1cnJlbnRPYmplY3RzKCkge1xuICAgIHRoaXMucmV0YWluZWRPYmplY3RzLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykucmVsZWFzZU9iamVjdChndWlkRm9yKGl0ZW0pKTtcbiAgICB9KTtcbiAgICB0aGlzLnJldGFpbmVkT2JqZWN0cyA9IFtdO1xuICB9LFxuXG4gIGV2ZW50TmFtZXNwYWNlOiBjb21wdXRlZChmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gYHZpZXdfZGVidWdfJHtndWlkRm9yKHRoaXMpfWA7XG4gIH0pLFxuXG4gIHdpbGxEZXN0cm95KCkge1xuICAgIHRoaXMuX3N1cGVyKCk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMucmVzaXplSGFuZGxlcik7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMubGFzdENsaWNrZWRIYW5kbGVyKTtcbiAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGxheWVyRGl2KTtcbiAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHByZXZpZXdEaXYpO1xuICAgIHRoaXMuZ2V0KCdfbGFzdE5vZGVzJykuY2xlYXIoKTtcbiAgICB0aGlzLnJlbGVhc2VDdXJyZW50T2JqZWN0cygpO1xuICAgIHRoaXMuc3RvcEluc3BlY3RpbmcoKTtcbiAgfSxcblxuICBpbnNwZWN0Vmlld0VsZW1lbnQob2JqZWN0SWQpIHtcbiAgICBsZXQgdmlldyA9IHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5zZW50T2JqZWN0c1tvYmplY3RJZF07XG4gICAgaWYgKHZpZXcgJiYgdmlldy5nZXQoJ2VsZW1lbnQnKSkge1xuICAgICAgdGhpcy5pbnNwZWN0RWxlbWVudCh2aWV3LmdldCgnZWxlbWVudCcpKTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIE9wZW5zIHRoZSBcIkVsZW1lbnRzXCIgdGFiIGFuZCBzZWxlY3RzIHRoZSBnaXZlbiBlbGVtZW50LiBEb2Vzbid0IHdvcmsgaW4gYWxsXG4gICAqIGJyb3dzZXJzL2FkZG9ucyAob25seSBpbiB0aGUgQ2hyb21lIGFuZCBGRiBkZXZ0b29scyBhZGRvbnMgYXQgdGhlIHRpbWUgb2Ygd3JpdGluZykuXG4gICAqXG4gICAqIEBtZXRob2QgaW5zcGVjdEVsZW1lbnRcbiAgICogQHBhcmFtICB7RWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBpbnNwZWN0XG4gICAqL1xuICBpbnNwZWN0RWxlbWVudChlbGVtZW50KSB7XG4gICAgdGhpcy5nZXQoJ2FkYXB0ZXInKS5pbnNwZWN0RWxlbWVudChlbGVtZW50KTtcbiAgfSxcblxuICBzZW5kVHJlZSgpIHtcbiAgICBydW4uc2NoZWR1bGVPbmNlKCdhZnRlclJlbmRlcicsIHRoaXMsIHRoaXMuc2NoZWR1bGVkU2VuZFRyZWUpO1xuICB9LFxuXG4gIHN0YXJ0SW5zcGVjdGluZygpIHtcbiAgICBsZXQgdmlld0VsZW0gPSBudWxsO1xuICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ3N0YXJ0SW5zcGVjdGluZycsIHt9KTtcblxuICAgIC8vIHdlIGRvbid0IHdhbnQgdGhlIHByZXZpZXcgZGl2IHRvIGludGVyY2VwdCB0aGUgbW91c2Vtb3ZlIGV2ZW50XG4gICAgcHJldmlld0Rpdi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXG4gICAgbGV0IHBpblZpZXcgPSAoKSA9PiB7XG4gICAgICBpZiAodmlld0VsZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgICAgICB0aGlzLmdsaW1tZXJUcmVlLmhpZ2hsaWdodExheWVyKHZpZXdFbGVtLmlkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmhpZ2hsaWdodFZpZXcodmlld0VsZW0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHZpZXcgPSB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuc2VudE9iamVjdHNbdmlld0VsZW0uaWRdO1xuICAgICAgICBpZiAodmlldyBpbnN0YW5jZW9mIENvbXBvbmVudCkge1xuICAgICAgICAgIHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5zZW5kT2JqZWN0KHZpZXcpO1xuICAgICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UoJ2luc3BlY3RDb21wb25lbnQnLCB7IHZpZXdJZDogdmlld0VsZW0uaWQgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMuc3RvcEluc3BlY3RpbmcoKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuXG4gICAgdGhpcy5tb3VzZW1vdmVIYW5kbGVyID0gKGUpID0+IHtcbiAgICAgIHZpZXdFbGVtID0gdGhpcy5maW5kTmVhcmVzdFZpZXcoZS50YXJnZXQpO1xuXG4gICAgICBpZiAodmlld0VsZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZ2xpbW1lclRyZWUpIHtcbiAgICAgICAgICB0aGlzLmdsaW1tZXJUcmVlLmhpZ2hsaWdodExheWVyKHZpZXdFbGVtLmlkLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmhpZ2hsaWdodFZpZXcodmlld0VsZW0sIHRydWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICB0aGlzLm1vdXNlZG93bkhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAvLyBwcmV2ZW50IGFwcC1kZWZpbmVkIGNsaWNrcyBmcm9tIGJlaW5nIGZpcmVkXG4gICAgICBwcmV2aWV3RGl2LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJztcbiAgICAgIHByZXZpZXdEaXYuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsICgpID0+IHBpblZpZXcoKSwgeyBvbmNlOiB0cnVlIH0pO1xuICAgIH07XG4gICAgdGhpcy5tb3VzZXVwSGFuZGxlciA9ICgpID0+IHBpblZpZXcoKTtcbiAgICBkb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2Vtb3ZlSGFuZGxlcik7XG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm1vdXNlZG93bkhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMubW91c2V1cEhhbmRsZXIpO1xuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuY3Vyc29yID0gJy13ZWJraXQtem9vbS1pbic7XG4gIH0sXG5cbiAgZmluZE5lYXJlc3RWaWV3KGVsZW0pIHtcbiAgICBpZiAoIWVsZW0pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAoZWxlbS5jbGFzc0xpc3QuY29udGFpbnMoJ2VtYmVyLXZpZXcnKSkge1xuICAgICAgcmV0dXJuIGVsZW07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmZpbmROZWFyZXN0VmlldyhlbGVtLmNsb3Nlc3QoJy5lbWJlci12aWV3JykpO1xuICB9LFxuXG4gIHN0b3BJbnNwZWN0aW5nKCkge1xuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3VzZW1vdmVIYW5kbGVyKTtcbiAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMubW91c2Vkb3duSGFuZGxlcik7XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5tb3VzZXVwSGFuZGxlcik7XG4gICAgZG9jdW1lbnQuYm9keS5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICB0aGlzLmhpZGVQcmV2aWV3KCk7XG4gICAgdGhpcy5zZW5kTWVzc2FnZSgnc3RvcEluc3BlY3RpbmcnLCB7fSk7XG4gIH0sXG5cbiAgc2NoZWR1bGVkU2VuZFRyZWUoKSB7XG4gICAgLy8gU2VuZCBvdXQgb2YgYmFuZFxuICAgIGxhdGVyKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzRGVzdHJveWluZykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLnJlbGVhc2VDdXJyZW50T2JqZWN0cygpO1xuICAgICAgbGV0IHRyZWUgPSB0aGlzLnZpZXdUcmVlKCk7XG4gICAgICBpZiAodHJlZSkge1xuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlKCd2aWV3VHJlZScsIHsgdHJlZSB9KTtcbiAgICAgIH1cbiAgICB9LCA1MCk7XG4gIH0sXG5cbiAgdmlld0xpc3RlbmVyKCkge1xuICAgIHRoaXMudmlld1RyZWVDaGFuZ2VkID0gKCkgPT4ge1xuICAgICAgdGhpcy5zZW5kVHJlZSgpO1xuICAgICAgdGhpcy5oaWRlTGF5ZXIoKTtcbiAgICB9O1xuICB9LFxuXG4gIHZpZXdUcmVlKCkge1xuICAgIGxldCB0cmVlO1xuICAgIGxldCBlbWJlckFwcCA9IHRoaXMuZ2V0KCduYW1lc3BhY2Uub3duZXInKTtcbiAgICBpZiAoIWVtYmVyQXBwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGxldCBhcHBsaWNhdGlvblZpZXcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGAke2VtYmVyQXBwLnJvb3RFbGVtZW50fSA+IC5lbWJlci12aWV3YCk7XG4gICAgbGV0IGFwcGxpY2F0aW9uVmlld0lkID0gYXBwbGljYXRpb25WaWV3ID8gYXBwbGljYXRpb25WaWV3LmlkIDogdW5kZWZpbmVkO1xuICAgIGxldCByb290VmlldyA9IHRoaXMuZ2V0KCd2aWV3UmVnaXN0cnknKVthcHBsaWNhdGlvblZpZXdJZF07XG4gICAgLy8gSW4gY2FzZSBvZiBBcHAucmVzZXQgdmlldyBpcyBkZXN0cm95ZWRcbiAgICBpZiAodGhpcy5nbGltbWVyVHJlZSkge1xuICAgICAgLy8gR2xpbW1lciAyXG4gICAgICB0cmVlID0gdGhpcy5nbGltbWVyVHJlZS5idWlsZCgpO1xuICAgIH0gZWxzZSBpZiAocm9vdFZpZXcpIHtcbiAgICAgIGxldCBjaGlsZHJlbiA9IFtdO1xuICAgICAgdGhpcy5nZXQoJ19sYXN0Tm9kZXMnKS5jbGVhcigpO1xuICAgICAgbGV0IHJlbmRlck5vZGUgPSByb290Vmlldy5fcmVuZGVyTm9kZTtcbiAgICAgIHRyZWUgPSB7IHZhbHVlOiB0aGlzLl9pbnNwZWN0Tm9kZShyZW5kZXJOb2RlKSwgY2hpbGRyZW4gfTtcbiAgICAgIHRoaXMuX2FwcGVuZE5vZGVDaGlsZHJlbihyZW5kZXJOb2RlLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIHJldHVybiB0cmVlO1xuICB9LFxuXG4gIGdldE93bmVyKCkge1xuICAgIHJldHVybiB0aGlzLmdldCgnbmFtZXNwYWNlLm93bmVyJyk7XG4gIH0sXG5cbiAgaXNHbGltbWVyVHdvKCkge1xuICAgIHJldHVybiB0aGlzLmdldCgnbmFtZXNwYWNlLm93bmVyJykuaGFzUmVnaXN0cmF0aW9uKCdzZXJ2aWNlOi1nbGltbWVyLWVudmlyb25tZW50Jyk7XG4gIH0sXG5cbiAgbW9kZWxGb3JWaWV3KHZpZXcpIHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gdmlldy5nZXQoJ2NvbnRyb2xsZXInKTtcbiAgICBsZXQgbW9kZWwgPSBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICBpZiAodmlldy5nZXQoJ2NvbnRleHQnKSAhPT0gY29udHJvbGxlcikge1xuICAgICAgbW9kZWwgPSB2aWV3LmdldCgnY29udGV4dCcpO1xuICAgIH1cbiAgICByZXR1cm4gbW9kZWw7XG4gIH0sXG5cbiAgc2hvdWxkU2hvd1ZpZXcodmlldykge1xuICAgIGlmICh2aWV3IGluc3RhbmNlb2YgQ29tcG9uZW50KSB7XG4gICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmNvbXBvbmVudHM7XG4gICAgfVxuICAgIHJldHVybiAodGhpcy5oYXNPd25Db250cm9sbGVyKHZpZXcpIHx8IHRoaXMuaGFzT3duQ29udGV4dCh2aWV3KSkgJiZcbiAgICAgICghdmlldy5nZXQoJ2lzVmlydHVhbCcpIHx8IHRoaXMuaGFzT3duQ29udHJvbGxlcih2aWV3KSB8fCB0aGlzLmhhc093bkNvbnRleHQodmlldykpO1xuICB9LFxuXG4gIGhhc093bkNvbnRyb2xsZXIodmlldykge1xuICAgIHJldHVybiB2aWV3LmdldCgnY29udHJvbGxlcicpICE9PSB2aWV3LmdldCgnX3BhcmVudFZpZXcuY29udHJvbGxlcicpICYmXG4gICAgICAoKHZpZXcgaW5zdGFuY2VvZiBDb21wb25lbnQpIHx8ICEodmlldy5nZXQoJ19wYXJlbnRWaWV3LmNvbnRyb2xsZXInKSBpbnN0YW5jZW9mIENvbXBvbmVudCkpO1xuICB9LFxuXG4gIGhhc093bkNvbnRleHQodmlldykge1xuICAgIC8vIENvbnRleHQgc3dpdGNoaW5nIGlzIGRlcHJlY2F0ZWQsIHdlIHdpbGwgbmVlZCB0byBmaW5kIGEgYmV0dGVyIHdheSBmb3Ige3sjZWFjaH19IGhlbHBlcnMuXG4gICAgcmV0dXJuIHZpZXcuZ2V0KCdjb250ZXh0JykgIT09IHZpZXcuZ2V0KCdfcGFyZW50Vmlldy5jb250ZXh0JykgJiZcbiAgICAgIC8vIG1ha2Ugc3VyZSBub3QgYSB2aWV3IGluc2lkZSBhIGNvbXBvbmVudCwgbGlrZSBge3t5aWVsZH19YCBmb3IgZXhhbXBsZS5cbiAgICAgICEodmlldy5nZXQoJ19wYXJlbnRWaWV3LmNvbnRleHQnKSBpbnN0YW5jZW9mIENvbXBvbmVudCk7XG4gIH0sXG5cbiAgaGlnaGxpZ2h0VmlldyhlbGVtZW50LCBpc1ByZXZpZXcpIHtcbiAgICBsZXQgdmlldywgcmVjdDtcblxuICAgIGlmICghaXNQcmV2aWV3KSB7XG4gICAgICBoaWdobGlnaHRlZEVsZW1lbnQgPSBlbGVtZW50O1xuICAgIH1cblxuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGVsZW1lbnQgJiYgZWxlbWVudC5fcmVuZGVyTm9kZSB0byBkZXRlY3QgdG9wIHZpZXcgKGFwcGxpY2F0aW9uKVxuICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ29tcG9uZW50IHx8IChlbGVtZW50ICYmIGVsZW1lbnQuX3JlbmRlck5vZGUpKSB7XG4gICAgICB2aWV3ID0gZWxlbWVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmlldyA9IHRoaXMuZ2V0KCd2aWV3UmVnaXN0cnknKVtlbGVtZW50LmlkXTtcbiAgICB9XG5cbiAgICByZWN0ID0gZ2V0Vmlld0JvdW5kaW5nQ2xpZW50UmVjdCh2aWV3KTtcblxuICAgIGxldCB0ZW1wbGF0ZU5hbWUgPSB2aWV3LmdldCgndGVtcGxhdGVOYW1lJykgfHwgdmlldy5nZXQoJ19kZWJ1Z1RlbXBsYXRlTmFtZScpO1xuICAgIGxldCBjb250cm9sbGVyID0gdmlldy5nZXQoJ2NvbnRyb2xsZXInKTtcbiAgICBsZXQgbW9kZWwgPSBjb250cm9sbGVyICYmIGNvbnRyb2xsZXIuZ2V0KCdtb2RlbCcpO1xuICAgIGxldCBtb2RlbE5hbWU7XG5cbiAgICBsZXQgb3B0aW9ucyA9IHtcbiAgICAgIGlzUHJldmlldyxcbiAgICAgIHZpZXc6IHtcbiAgICAgICAgbmFtZTogZ2V0U2hvcnRWaWV3TmFtZSh2aWV3KSxcbiAgICAgICAgb2JqZWN0OiB2aWV3XG4gICAgICB9XG4gICAgfTtcblxuICAgIGlmIChjb250cm9sbGVyKSB7XG4gICAgICBvcHRpb25zLmNvbnRyb2xsZXIgPSB7XG4gICAgICAgIG5hbWU6IGdldENvbnRyb2xsZXJOYW1lKGNvbnRyb2xsZXIpLFxuICAgICAgICBvYmplY3Q6IGNvbnRyb2xsZXJcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKHRlbXBsYXRlTmFtZSkge1xuICAgICAgb3B0aW9ucy50ZW1wbGF0ZSA9IHtcbiAgICAgICAgbmFtZTogdGVtcGxhdGVOYW1lXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmIChtb2RlbCkge1xuICAgICAgbW9kZWxOYW1lID0gdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLmluc3BlY3QobW9kZWwpO1xuICAgICAgb3B0aW9ucy5tb2RlbCA9IHtcbiAgICAgICAgbmFtZTogbW9kZWxOYW1lLFxuICAgICAgICBvYmplY3Q6IG1vZGVsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHRoaXMuX2hpZ2hsaWdodFJhbmdlKHJlY3QsIG9wdGlvbnMpO1xuICB9LFxuXG4gIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIGEgc2VyaW91cyByZWZhY3Rvci9jbGVhbnVwXG4gIF9oaWdobGlnaHRSYW5nZShyZWN0LCBvcHRpb25zKSB7XG4gICAgbGV0IGRpdjtcbiAgICBsZXQgaXNQcmV2aWV3ID0gb3B0aW9ucy5pc1ByZXZpZXc7XG5cbiAgICAvLyB0YWtlIGludG8gYWNjb3VudCB0aGUgc2Nyb2xsaW5nIHBvc2l0aW9uIGFzIG1lbnRpb25lZCBpbiBkb2NzXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL2VsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0XG4gICAgbGV0IHN0eWxlcyA9IHtcbiAgICAgIGRpc3BsYXk6ICdibG9jaycsXG4gICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC43KScsXG4gICAgICBib3JkZXI6ICcycHggc29saWQgcmdiKDEwMiwgMTAyLCAxMDIpJyxcbiAgICAgIHBhZGRpbmc6ICcwJyxcbiAgICAgIHJpZ2h0OiAnYXV0bycsXG4gICAgICBkaXJlY3Rpb246ICdsdHInLFxuICAgICAgYm94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG4gICAgICBjb2xvcjogJ3JnYig1MSwgNTEsIDI1NSknLFxuICAgICAgZm9udEZhbWlseTogJ01lbmxvLCBzYW5zLXNlcmlmJyxcbiAgICAgIG1pbkhlaWdodDogJzYzcHgnLFxuICAgICAgekluZGV4OiAxMDAwMCxcbiAgICAgIHRvcDogYCR7cmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWX1weGAsXG4gICAgICBsZWZ0OiBgJHtyZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWH1weGAsXG4gICAgICB3aWR0aDogYCR7cmVjdC53aWR0aH1weGAsXG4gICAgICBoZWlnaHQ6IGAke3JlY3QuaGVpZ2h0fXB4YFxuICAgIH07XG5cbiAgICBpZiAoaXNQcmV2aWV3KSB7XG4gICAgICBkaXYgPSBwcmV2aWV3RGl2O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmhpZGVMYXllcigpO1xuICAgICAgZGl2ID0gbGF5ZXJEaXY7XG4gICAgICB0aGlzLmhpZGVQcmV2aWV3KCk7XG4gICAgfVxuICAgIGZvciAobGV0IHByb3AgaW4gc3R5bGVzKSB7XG4gICAgICBkaXYuc3R5bGVbcHJvcF0gPSBzdHlsZXNbcHJvcF07XG4gICAgfVxuICAgIGxldCBvdXRwdXQgPSAnJztcblxuICAgIGlmICghaXNQcmV2aWV3KSB7XG4gICAgICBvdXRwdXQgPSAnPHNwYW4gY2xhc3M9XFwnY2xvc2VcXCcgZGF0YS1sYWJlbD1cXCdsYXllci1jbG9zZVxcJz4mdGltZXM7PC9zcGFuPic7XG4gICAgfVxuXG4gICAgbGV0IHRlbXBsYXRlID0gb3B0aW9ucy50ZW1wbGF0ZTtcblxuICAgIGlmICh0ZW1wbGF0ZSkge1xuICAgICAgb3V0cHV0ICs9IGA8cCBjbGFzcz0ndGVtcGxhdGUnPjxzcGFuPnRlbXBsYXRlPC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci10ZW1wbGF0ZSc+JHtlc2NhcGVIVE1MKHRlbXBsYXRlLm5hbWUpfTwvc3Bhbj48L3A+YDtcbiAgICB9XG4gICAgbGV0IHZpZXcgPSBvcHRpb25zLnZpZXc7XG4gICAgbGV0IGNvbnRyb2xsZXIgPSBvcHRpb25zLmNvbnRyb2xsZXI7XG4gICAgaWYgKCF2aWV3IHx8ICEodmlldy5vYmplY3QgaW5zdGFuY2VvZiBDb21wb25lbnQpKSB7XG4gICAgICBpZiAoY29udHJvbGxlcikge1xuICAgICAgICBvdXRwdXQgKz0gYDxwIGNsYXNzPSdjb250cm9sbGVyJz48c3Bhbj5jb250cm9sbGVyPC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci1jb250cm9sbGVyJz4ke2VzY2FwZUhUTUwoY29udHJvbGxlci5uYW1lKX08L3NwYW4+PC9wPmA7XG4gICAgICB9XG4gICAgICBpZiAodmlldykge1xuICAgICAgICBvdXRwdXQgKz0gYDxwIGNsYXNzPSd2aWV3Jz48c3Bhbj52aWV3PC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci12aWV3Jz4ke2VzY2FwZUhUTUwodmlldy5uYW1lKX08L3NwYW4+PC9wPmA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dCArPSBgPHAgY2xhc3M9J2NvbXBvbmVudCc+PHNwYW4+Y29tcG9uZW50PC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci1jb21wb25lbnQnPiR7ZXNjYXBlSFRNTCh2aWV3Lm5hbWUpfTwvc3Bhbj48L3A+YDtcbiAgICB9XG5cbiAgICBsZXQgbW9kZWwgPSBvcHRpb25zLm1vZGVsO1xuICAgIGlmIChtb2RlbCkge1xuICAgICAgb3V0cHV0ICs9IGA8cCBjbGFzcz0nbW9kZWwnPjxzcGFuPm1vZGVsPC9zcGFuPj08c3BhbiBkYXRhLWxhYmVsPSdsYXllci1tb2RlbCc+JHtlc2NhcGVIVE1MKG1vZGVsLm5hbWUpfTwvc3Bhbj48L3A+YDtcbiAgICB9XG4gICAgZGl2LmlubmVySFRNTCA9IG91dHB1dDtcblxuICAgIGZvciAobGV0IHAgb2YgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ3AnKSkge1xuICAgICAgcC5zdHlsZS5mbG9hdCA9ICdsZWZ0JztcbiAgICAgIHAuc3R5bGUubWFyZ2luID0gMDtcbiAgICAgIHAuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC45KSc7XG4gICAgICBwLnN0eWxlLnBhZGRpbmcgPSAnNXB4JztcbiAgICAgIHAuc3R5bGUuY29sb3IgPSAncmdiKDAsIDAsIDE1MyknO1xuICAgIH1cbiAgICBmb3IgKGxldCBwIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdwLm1vZGVsJykpIHtcbiAgICAgIHAuc3R5bGUuY2xlYXIgPSAnbGVmdCc7XG4gICAgfVxuICAgIGZvciAobGV0IHAgb2YgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ3Agc3BhbjpmaXJzdC1jaGlsZCcpKSB7XG4gICAgICBwLnN0eWxlLmNvbG9yID0gJ3JnYigxNTMsIDE1MywgMCknO1xuICAgIH1cbiAgICBmb3IgKGxldCBwIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdwIHNwYW46bGFzdC1jaGlsZCcpKSB7XG4gICAgICBwLnN0eWxlLmNvbG9yID0gJ3JnYigxNTMsIDAsIDE1MyknO1xuICAgIH1cblxuICAgIGlmICghaXNQcmV2aWV3KSB7XG4gICAgICBsZXQgY2FuY2VsRXZlbnQgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIH07XG4gICAgICBmb3IgKGxldCBzcGFuIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdzcGFuLmNsb3NlJykpIHtcbiAgICAgICAgc3Bhbi5zdHlsZS5mbG9hdCA9ICdyaWdodCc7XG4gICAgICAgIHNwYW4uc3R5bGUubWFyZ2luID0gJzVweCc7XG4gICAgICAgIHNwYW4uc3R5bGUuYmFja2dyb3VuZCA9ICcjNjY2JztcbiAgICAgICAgc3Bhbi5zdHlsZS5jb2xvciA9ICcjZWVlJztcbiAgICAgICAgc3Bhbi5zdHlsZS5mb250RmFtaWx5ID0gJ2hlbHZldGljYSwgc2Fucy1zZXJpZic7XG4gICAgICAgIHNwYW4uc3R5bGUuZm9udFNpemUgPSAnMTRweCc7XG4gICAgICAgIHNwYW4uc3R5bGUud2lkdGggPSAnMTZweCc7XG4gICAgICAgIHNwYW4uc3R5bGUuaGVpZ2h0ID0gJzE2cHgnO1xuICAgICAgICBzcGFuLnN0eWxlLmxpbmVIZWlnaHQgPSAnMTRweCc7XG4gICAgICAgIHNwYW4uc3R5bGUuYm9yZGVyUmFkaXVzID0gJzE2cHgnO1xuICAgICAgICBzcGFuLnN0eWxlLnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICBzcGFuLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgc3Bhbi5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgIHNwYW4uc3R5bGUuZm9udFdlaWdodCA9ICdub3JtYWwnO1xuICAgICAgICBzcGFuLnN0eWxlLnRleHRTaGFkb3cgPSAnbm9uZSc7XG4gICAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgIGNhbmNlbEV2ZW50KGUpO1xuICAgICAgICAgIHRoaXMuaGlkZUxheWVyKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBzcGFuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBjYW5jZWxFdmVudCk7XG4gICAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgY2FuY2VsRXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuX2FkZENsaWNrTGlzdGVuZXJzKGRpdiwgdmlldywgJ2NvbXBvbmVudCcpO1xuICAgIHRoaXMuX2FkZENsaWNrTGlzdGVuZXJzKGRpdiwgY29udHJvbGxlciwgJ2NvbnRyb2xsZXInKTtcbiAgICB0aGlzLl9hZGRDbGlja0xpc3RlbmVycyhkaXYsIHZpZXcsICd2aWV3Jyk7XG5cbiAgICBmb3IgKGxldCBzcGFuIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdwLnRlbXBsYXRlIHNwYW46bGFzdC1jaGlsZCcpKSB7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICh2aWV3KSB7XG4gICAgICAgICAgdGhpcy5pbnNwZWN0Vmlld0VsZW1lbnQoZ3VpZEZvcih2aWV3Lm9iamVjdCkpO1xuICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnMuZWxlbWVudCkge1xuICAgICAgICAgIHRoaXMuaW5zcGVjdEVsZW1lbnQob3B0aW9ucy5lbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBpZiAobW9kZWwgJiYgbW9kZWwub2JqZWN0ICYmICgobW9kZWwub2JqZWN0IGluc3RhbmNlb2YgRW1iZXJPYmplY3QpIHx8IHR5cGVPZihtb2RlbC5vYmplY3QpID09PSAnYXJyYXknKSkge1xuICAgICAgZm9yIChsZXQgc3BhbiBvZiBkaXYucXVlcnlTZWxlY3RvckFsbCgncC5tb2RlbCBzcGFuOmxhc3QtY2hpbGQnKSkge1xuICAgICAgICBzcGFuLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgc3Bhbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuc2VuZE9iamVjdChtb2RlbC5vYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgaGlkZUxheWVyKCkge1xuICAgIGxheWVyRGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaGlnaGxpZ2h0ZWRFbGVtZW50ID0gbnVsbDtcbiAgfSxcblxuICBoaWRlUHJldmlldygpIHtcbiAgICBwcmV2aWV3RGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gIH0sXG5cbiAgX2FkZENsaWNrTGlzdGVuZXJzKGRpdiwgaXRlbSwgc2VsZWN0b3IpIHtcbiAgICBmb3IgKGxldCBzcGFuIG9mIGRpdi5xdWVyeVNlbGVjdG9yQWxsKGBwLiR7c2VsZWN0b3J9IHNwYW46bGFzdC1jaGlsZGApKSB7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgIHNwYW4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIHRoaXMuZ2V0KCdvYmplY3RJbnNwZWN0b3InKS5zZW5kT2JqZWN0KGl0ZW0ub2JqZWN0KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogTGlzdCBvZiByZW5kZXIgbm9kZXMgZnJvbSB0aGUgbGFzdFxuICAgKiBzZW50IHZpZXcgdHJlZS5cbiAgICpcbiAgICogQHByb3BlcnR5IGxhc3ROb2Rlc1xuICAgKiBAdHlwZSB7QXJyYXl9XG4gICAqL1xuICBfbGFzdE5vZGVzOiBjb21wdXRlZChmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gQShbXSk7XG4gIH0pLFxuXG4gIHZpZXdSZWdpc3RyeTogY29tcHV0ZWQoJ25hbWVzcGFjZS5vd25lcicsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldE93bmVyKCkubG9va3VwKCctdmlldy1yZWdpc3RyeTptYWluJyk7XG4gIH0pLFxuXG4gIC8qKlxuICAgKiBXYWxrIHRoZSByZW5kZXIgbm9kZSBoaWVyYXJjaHkgYW5kIGJ1aWxkIHRoZSB0cmVlLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHBhcmFtICB7QXJyYXl9IGNoaWxkcmVuXG4gICAqL1xuICBfYXBwZW5kTm9kZUNoaWxkcmVuKHJlbmRlck5vZGUsIGNoaWxkcmVuKSB7XG4gICAgbGV0IGNoaWxkTm9kZXMgPSB0aGlzLl9jaGlsZHJlbkZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgaWYgKCFjaGlsZE5vZGVzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNoaWxkTm9kZXMuZm9yRWFjaChjaGlsZE5vZGUgPT4ge1xuICAgICAgaWYgKHRoaXMuX3Nob3VsZFNob3dOb2RlKGNoaWxkTm9kZSwgcmVuZGVyTm9kZSkpIHtcbiAgICAgICAgbGV0IGdyYW5kQ2hpbGRyZW4gPSBbXTtcbiAgICAgICAgY2hpbGRyZW4ucHVzaCh7IHZhbHVlOiB0aGlzLl9pbnNwZWN0Tm9kZShjaGlsZE5vZGUpLCBjaGlsZHJlbjogZ3JhbmRDaGlsZHJlbiB9KTtcbiAgICAgICAgdGhpcy5fYXBwZW5kTm9kZUNoaWxkcmVuKGNoaWxkTm9kZSwgZ3JhbmRDaGlsZHJlbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9hcHBlbmROb2RlQ2hpbGRyZW4oY2hpbGROb2RlLCBjaGlsZHJlbik7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEdhdGhlciB0aGUgY2hpbGRyZW4gYXNzaWduZWQgdG8gdGhlIHJlbmRlciBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7QXJyYXl9IGNoaWxkcmVuXG4gICAqL1xuICBfY2hpbGRyZW5Gb3JOb2RlKHJlbmRlck5vZGUpIHtcbiAgICBpZiAocmVuZGVyTm9kZS5tb3JwaE1hcCkge1xuICAgICAgcmV0dXJuIGtleXMocmVuZGVyTm9kZS5tb3JwaE1hcCkubWFwKGtleSA9PiByZW5kZXJOb2RlLm1vcnBoTWFwW2tleV0pLmZpbHRlcihub2RlID0+ICEhbm9kZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZW5kZXJOb2RlLmNoaWxkTm9kZXM7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBXaGV0aGVyIGEgcmVuZGVyIG5vZGUgaXMgZWxsaWdpYmxlIHRvIGJlIGluY2x1ZGVkXG4gICAqIGluIHRoZSB0cmVlLlxuICAgKiBEZXBlbmRzIG9uIHdoZXRoZXIgdGhlIG5vZGUgaXMgYWN0dWFsbHkgYSB2aWV3IG5vZGVcbiAgICogKGFzIG9wcG9zZWQgdG8gYW4gYXR0cmlidXRlIG5vZGUgZm9yIGV4YW1wbGUpLFxuICAgKiBhbmQgYWxzbyBjaGVja3MgdGhlIGZpbHRlcmluZyBvcHRpb25zLiBGb3IgZXhhbXBsZSxcbiAgICogc2hvd2luZyBFbWJlciBjb21wb25lbnQgbm9kZXMgY2FuIGJlIHRvZ2dsZWQuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHBhcmVudE5vZGVcbiAgICogQHJldHVybiB7Qm9vbGVhbn0gYHRydWVgIGZvciBzaG93IGFuZCBgZmFsc2VgIHRvIHNraXAgdGhlIG5vZGVcbiAgICovXG4gIF9zaG91bGRTaG93Tm9kZShyZW5kZXJOb2RlLCBwYXJlbnROb2RlKSB7XG5cbiAgICAvLyBGaWx0ZXIgb3V0IG5vbi0odmlldy9jb21wb25lbnRzKVxuICAgIGlmICghdGhpcy5fbm9kZUlzVmlldyhyZW5kZXJOb2RlKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBIYXMgZWl0aGVyIGEgdGVtcGxhdGUgb3IgYSB2aWV3L2NvbXBvbmVudCBpbnN0YW5jZVxuICAgIGlmICghdGhpcy5fbm9kZVRlbXBsYXRlTmFtZShyZW5kZXJOb2RlKSAmJiAhdGhpcy5fbm9kZUhhc1ZpZXdJbnN0YW5jZShyZW5kZXJOb2RlKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fbm9kZUhhc093bkNvbnRyb2xsZXIocmVuZGVyTm9kZSwgcGFyZW50Tm9kZSkgJiZcbiAgICAgICh0aGlzLm9wdGlvbnMuY29tcG9uZW50cyB8fCAhKHRoaXMuX25vZGVJc0VtYmVyQ29tcG9uZW50KHJlbmRlck5vZGUpKSkgJiZcbiAgICAgICh0aGlzLl9ub2RlSGFzVmlld0luc3RhbmNlKHJlbmRlck5vZGUpIHx8IHRoaXMuX25vZGVIYXNPd25Db250cm9sbGVyKHJlbmRlck5vZGUsIHBhcmVudE5vZGUpKTtcbiAgfSxcblxuICAvKipcbiAgICogVGhlIG5vZGUncyBtb2RlbC4gSWYgdGhlIHZpZXcgaGFzIGEgY29udHJvbGxlcixcbiAgICogaXQgd2lsbCBiZSB0aGUgY29udHJvbGxlcidzIGBtb2RlbGAgcHJvcGVydHkuc1xuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7T2JqZWN0fSB0aGUgbW9kZWxcbiAgICovXG4gIF9tb2RlbEZvck5vZGUocmVuZGVyTm9kZSkge1xuICAgIGxldCBjb250cm9sbGVyID0gdGhpcy5fY29udHJvbGxlckZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgaWYgKGNvbnRyb2xsZXIpIHtcbiAgICAgIHJldHVybiBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIE5vdCBhbGwgbm9kZXMgYXJlIGFjdHVhbGx5IHZpZXdzL2NvbXBvbmVudHMuXG4gICAqIE5vZGVzIGNhbiBiZSBhdHRyaWJ1dGVzIGZvciBleGFtcGxlLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICovXG4gIF9ub2RlSXNWaWV3KHJlbmRlck5vZGUpIHtcbiAgICBpZiAocmVuZGVyTm9kZS5nZXRTdGF0ZSkge1xuICAgICAgcmV0dXJuICEhcmVuZGVyTm9kZS5nZXRTdGF0ZSgpLm1hbmFnZXI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAhIXJlbmRlck5vZGUuc3RhdGUubWFuYWdlcjtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgbm9kZSBoYXMgaXRzIG93biBjb250cm9sbGVyIChhcyBvcHBvc2VkIHRvIHNoYXJpbmdcbiAgICogaXRzIHBhcmVudCdzIGNvbnRyb2xsZXIpLlxuICAgKiBVc2VmdWwgdG8gaWRlbnRpZnkgcm91dGUgdmlld3MgZnJvbSBvdGhlciB2aWV3cy5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEBwYXJhbSAge09iamVjdH0gcGFyZW50Tm9kZVxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKi9cbiAgX25vZGVIYXNPd25Db250cm9sbGVyKHJlbmRlck5vZGUsIHBhcmVudE5vZGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29udHJvbGxlckZvck5vZGUocmVuZGVyTm9kZSkgIT09IHRoaXMuX2NvbnRyb2xsZXJGb3JOb2RlKHBhcmVudE5vZGUpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiB0aGUgbm9kZSBoYXMgYSB2aWV3IGluc3RhbmNlLlxuICAgKiBWaXJ0dWFsIG5vZGVzIGRvbid0IGhhdmUgYSB2aWV3L2NvbXBvbmVudCBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuICBfbm9kZUhhc1ZpZXdJbnN0YW5jZShyZW5kZXJOb2RlKSB7XG4gICAgcmV0dXJuICEhdGhpcy5fdmlld0luc3RhbmNlRm9yTm9kZShyZW5kZXJOb2RlKTtcbiAgfSxcblxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBub2RlcycgY29udHJvbGxlci5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge0VtYmVyLkNvbnRyb2xsZXJ9XG4gICAqL1xuICBfY29udHJvbGxlckZvck5vZGUocmVuZGVyTm9kZSkge1xuICAgIC8vIElmIGl0J3MgYSBjb21wb25lbnQgdGhlbiByZXR1cm4gdGhlIGNvbXBvbmVudCBpbnN0YW5jZSBpdHNlbGZcbiAgICBpZiAodGhpcy5fbm9kZUlzRW1iZXJDb21wb25lbnQocmVuZGVyTm9kZSkpIHtcbiAgICAgIHJldHVybiB0aGlzLl92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgIH1cbiAgICBpZiAocmVuZGVyTm9kZS5sYXN0UmVzdWx0KSB7XG4gICAgICBsZXQgc2NvcGUgPSByZW5kZXJOb2RlLmxhc3RSZXN1bHQuc2NvcGU7XG4gICAgICBsZXQgY29udHJvbGxlcjtcbiAgICAgIGlmIChzY29wZS5nZXRMb2NhbCkge1xuICAgICAgICBjb250cm9sbGVyID0gc2NvcGUuZ2V0TG9jYWwoJ2NvbnRyb2xsZXInKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRyb2xsZXIgPSBzY29wZS5sb2NhbHMuY29udHJvbGxlci52YWx1ZSgpO1xuICAgICAgfVxuICAgICAgaWYgKCghY29udHJvbGxlciB8fCAhKGNvbnRyb2xsZXIgaW5zdGFuY2VvZiBDb250cm9sbGVyKSkgJiYgc2NvcGUuZ2V0U2VsZikge1xuICAgICAgICAvLyBFbWJlciA+PSAyLjIgKyBubyBlbWJlci1sZWdhY3ktY29udHJvbGxlcnMgYWRkb25cbiAgICAgICAgY29udHJvbGxlciA9IHNjb3BlLmdldFNlbGYoKS52YWx1ZSgpO1xuICAgICAgICBpZiAoIShjb250cm9sbGVyIGluc3RhbmNlb2YgQ29udHJvbGxlcikpIHtcbiAgICAgICAgICBjb250cm9sbGVyID0gY29udHJvbGxlci5fY29udHJvbGxlciB8fCBjb250cm9sbGVyLmNvbnRyb2xsZXI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjb250cm9sbGVyO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogSW5zcGVjdCBhIG5vZGUuIFRoaXMgd2lsbCByZXR1cm4gYW4gb2JqZWN0IHdpdGggYWxsXG4gICAqIHRoZSByZXF1aXJlZCBwcm9wZXJ0aWVzIHRvIGJlIGFkZGVkIHRvIHRoZSB2aWV3IHRyZWVcbiAgICogdG8gYmUgc2VudC5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge09iamVjdH0gdGhlIG9iamVjdCBjb250YWluaW5nIHRoZSByZXF1aXJlZCB2YWx1ZXNcbiAgICovXG4gIF9pbnNwZWN0Tm9kZShyZW5kZXJOb2RlKSB7XG4gICAgbGV0IG5hbWUsIHZpZXdDbGFzc05hbWUsIGNvbXBsZXRlVmlld0NsYXNzTmFtZSwgdGFnTmFtZSwgdmlld0lkLCB0aW1lVG9SZW5kZXI7XG5cbiAgICBsZXQgdmlld0NsYXNzID0gdGhpcy5fdmlld0luc3RhbmNlRm9yTm9kZShyZW5kZXJOb2RlKTtcblxuICAgIGlmICh2aWV3Q2xhc3MpIHtcbiAgICAgIHZpZXdDbGFzc05hbWUgPSBnZXRTaG9ydFZpZXdOYW1lKHZpZXdDbGFzcyk7XG4gICAgICBjb21wbGV0ZVZpZXdDbGFzc05hbWUgPSBnZXRWaWV3TmFtZSh2aWV3Q2xhc3MpO1xuICAgICAgdGFnTmFtZSA9IHZpZXdDbGFzcy5nZXQoJ3RhZ05hbWUnKSB8fCAnZGl2JztcbiAgICAgIHZpZXdJZCA9IHRoaXMucmV0YWluT2JqZWN0KHZpZXdDbGFzcyk7XG4gICAgICB0aW1lVG9SZW5kZXIgPSB0aGlzLl9kdXJhdGlvbnNbdmlld0lkXTtcbiAgICB9XG5cbiAgICBuYW1lID0gdGhpcy5fbm9kZURlc2NyaXB0aW9uKHJlbmRlck5vZGUpO1xuXG4gICAgbGV0IHZhbHVlID0ge1xuICAgICAgdGVtcGxhdGU6IHRoaXMuX25vZGVUZW1wbGF0ZU5hbWUocmVuZGVyTm9kZSkgfHwgJyhpbmxpbmUpJyxcbiAgICAgIG5hbWUsXG4gICAgICBvYmplY3RJZDogdmlld0lkLFxuICAgICAgdmlld0NsYXNzOiB2aWV3Q2xhc3NOYW1lLFxuICAgICAgZHVyYXRpb246IHRpbWVUb1JlbmRlcixcbiAgICAgIGNvbXBsZXRlVmlld0NsYXNzOiBjb21wbGV0ZVZpZXdDbGFzc05hbWUsXG4gICAgICBpc0NvbXBvbmVudDogdGhpcy5fbm9kZUlzRW1iZXJDb21wb25lbnQocmVuZGVyTm9kZSksXG4gICAgICB0YWdOYW1lLFxuICAgICAgaXNWaXJ0dWFsOiAhdmlld0NsYXNzXG4gICAgfTtcblxuICAgIGxldCBjb250cm9sbGVyID0gdGhpcy5fY29udHJvbGxlckZvck5vZGUocmVuZGVyTm9kZSk7XG4gICAgaWYgKGNvbnRyb2xsZXIgJiYgISh0aGlzLl9ub2RlSXNFbWJlckNvbXBvbmVudChyZW5kZXJOb2RlKSkpIHtcbiAgICAgIHZhbHVlLmNvbnRyb2xsZXIgPSB7XG4gICAgICAgIG5hbWU6IGdldFNob3J0Q29udHJvbGxlck5hbWUoY29udHJvbGxlciksXG4gICAgICAgIGNvbXBsZXRlTmFtZTogZ2V0Q29udHJvbGxlck5hbWUoY29udHJvbGxlciksXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnJldGFpbk9iamVjdChjb250cm9sbGVyKVxuICAgICAgfTtcblxuICAgICAgbGV0IG1vZGVsID0gdGhpcy5fbW9kZWxGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgIGlmIChFbWJlck9iamVjdC5kZXRlY3RJbnN0YW5jZShtb2RlbCkgfHwgdHlwZU9mKG1vZGVsKSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgIHZhbHVlLm1vZGVsID0ge1xuICAgICAgICAgICAgbmFtZTogZ2V0U2hvcnRNb2RlbE5hbWUobW9kZWwpLFxuICAgICAgICAgICAgY29tcGxldGVOYW1lOiBnZXRNb2RlbE5hbWUobW9kZWwpLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMucmV0YWluT2JqZWN0KG1vZGVsKSxcbiAgICAgICAgICAgIHR5cGU6ICd0eXBlLWVtYmVyLW9iamVjdCdcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlLm1vZGVsID0ge1xuICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ29iamVjdEluc3BlY3RvcicpLmluc3BlY3QobW9kZWwpLFxuICAgICAgICAgICAgdHlwZTogYHR5cGUtJHt0eXBlT2YobW9kZWwpfWBcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFsdWUucmVuZGVyTm9kZUlkID0gdGhpcy5nZXQoJ19sYXN0Tm9kZXMnKS5wdXNoKHJlbmRlck5vZGUpIC0gMTtcblxuICAgIHJldHVybiB2YWx1ZTtcbiAgfSxcblxuICAvKipcbiAgICogR2V0IHRoZSBub2RlJ3MgdGVtcGxhdGUgbmFtZS4gUmVsaWVzIG9uIGFuIGh0bWxiYXJzXG4gICAqIGZlYXR1cmUgdGhhdCBhZGRzIHRoZSBtb2R1bGUgbmFtZSBhcyBhIG1ldGEgcHJvcGVydHlcbiAgICogdG8gY29tcGlsZWQgdGVtcGxhdGVzLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHJldHVybiB7U3RyaW5nfSB0aGUgdGVtcGxhdGUgbmFtZVxuICAgKi9cbiAgX25vZGVUZW1wbGF0ZU5hbWUocmVuZGVyTm9kZSkge1xuICAgIGxldCB0ZW1wbGF0ZSA9IHJlbmRlck5vZGUubGFzdFJlc3VsdCAmJiByZW5kZXJOb2RlLmxhc3RSZXN1bHQudGVtcGxhdGU7XG4gICAgaWYgKHRlbXBsYXRlICYmIHRlbXBsYXRlLm1ldGEgJiYgdGVtcGxhdGUubWV0YS5tb2R1bGVOYW1lKSB7XG4gICAgICByZXR1cm4gdGVtcGxhdGUubWV0YS5tb2R1bGVOYW1lLnJlcGxhY2UoL1xcLmhicyQvLCAnJyk7XG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBUaGUgbm9kZSdzIG5hbWUuIFNob3VsZCBiZSBhbnl0aGluZyB0aGF0IHRoZSB1c2VyXG4gICAqIGNhbiB1c2UgdG8gaWRlbnRpdHkgd2hhdCBub2RlIHdlIGFyZSB0YWxraW5nIGFib3V0LlxuICAgKlxuICAgKiBVc3VhbGx5IGVpdGhlciB0aGUgdmlldyBpbnN0YW5jZSBuYW1lLCBvciB0aGUgdGVtcGxhdGUgbmFtZS5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICovXG4gIF9ub2RlRGVzY3JpcHRpb24ocmVuZGVyTm9kZSkge1xuICAgIGxldCBuYW1lO1xuXG4gICAgbGV0IHZpZXdDbGFzcyA9IHRoaXMuX3ZpZXdJbnN0YW5jZUZvck5vZGUocmVuZGVyTm9kZSk7XG5cbiAgICBpZiAodmlld0NsYXNzKSB7XG4gICAgICAvLy4gSGFzIGEgdmlldyBpbnN0YW5jZSAtIHRha2UgdGhlIHZpZXcncyBuYW1lXG4gICAgICBuYW1lID0gdmlld0NsYXNzLmdldCgnX2RlYnVnQ29udGFpbmVyS2V5Jyk7XG4gICAgICBpZiAobmFtZSkge1xuICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8uKih2aWV3fGNvbXBvbmVudCk6LywgJycpLnJlcGxhY2UoLzokLywgJycpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBWaXJ0dWFsIC0gbm8gdmlldyBpbnN0YW5jZVxuICAgICAgbGV0IHRlbXBsYXRlTmFtZSA9IHRoaXMuX25vZGVUZW1wbGF0ZU5hbWUocmVuZGVyTm9kZSk7XG4gICAgICBpZiAodGVtcGxhdGVOYW1lKSB7XG4gICAgICAgIHJldHVybiB0ZW1wbGF0ZU5hbWUucmVwbGFjZSgvXi4qdGVtcGxhdGVzXFwvLywgJycpLnJlcGxhY2UoL1xcLy9nLCAnLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIGFwcGxpY2F0aW9uIHZpZXcgd2FzIG5vdCBkZWZpbmVkLCBpdCB1c2VzIGEgYHRvcGxldmVsYCB2aWV3XG4gICAgaWYgKG5hbWUgPT09ICd0b3BsZXZlbCcpIHtcbiAgICAgIG5hbWUgPSAnYXBwbGljYXRpb24nO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZTtcbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJuIGEgbm9kZSdzIHZpZXcgaW5zdGFuY2UuXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gcmVuZGVyTm9kZVxuICAgKiBAcmV0dXJuIHtFbWJlci5WaWV3fEVtYmVyLkNvbXBvbmVudH0gVGhlIHZpZXcgb3IgY29tcG9uZW50IGluc3RhbmNlXG4gICAqL1xuICBfdmlld0luc3RhbmNlRm9yTm9kZShyZW5kZXJOb2RlKSB7XG4gICAgcmV0dXJuIHJlbmRlck5vZGUuZW1iZXJWaWV3O1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIG5vZGUgaXMgYW4gRW1iZXIgQ29tcG9uZW50IG9yIG5vdC5cbiAgICpcbiAgICogQHBhcmFtICB7T2JqZWN0fSByZW5kZXJOb2RlXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuICBfbm9kZUlzRW1iZXJDb21wb25lbnQocmVuZGVyTm9kZSkge1xuICAgIGxldCB2aWV3SW5zdGFuY2UgPSB0aGlzLl92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgIHJldHVybiAhISh2aWV3SW5zdGFuY2UgJiYgKHZpZXdJbnN0YW5jZSBpbnN0YW5jZW9mIENvbXBvbmVudCkpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBIaWdobGlnaHQgYSByZW5kZXIgbm9kZSBvbiB0aGUgc2NyZWVuLlxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IHJlbmRlck5vZGVcbiAgICogQHBhcmFtICB7Qm9vbGVhbn0gaXNQcmV2aWV3ICh3aGV0aGVyIHRvIHBpbiB0aGUgbGF5ZXIgb3Igbm90KVxuICAgKi9cbiAgX2hpZ2hsaWdodE5vZGUocmVuZGVyTm9kZSwgaXNQcmV2aWV3KSB7XG4gICAgbGV0IG1vZGVsTmFtZTtcbiAgICAvLyBUb2RvOiBzaG91bGQgYmUgaW4gRW1iZXIgY29yZVxuICAgIGxldCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgcmFuZ2Uuc2V0U3RhcnRCZWZvcmUocmVuZGVyTm9kZS5maXJzdE5vZGUpO1xuICAgIHJhbmdlLnNldEVuZEFmdGVyKHJlbmRlck5vZGUubGFzdE5vZGUpO1xuICAgIGxldCByZWN0ID0gcmFuZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICBsZXQgb3B0aW9ucyA9IHsgaXNQcmV2aWV3IH07XG5cbiAgICBsZXQgY29udHJvbGxlciA9IHRoaXMuX2NvbnRyb2xsZXJGb3JOb2RlKHJlbmRlck5vZGUpO1xuICAgIGlmIChjb250cm9sbGVyKSB7XG4gICAgICBvcHRpb25zLmNvbnRyb2xsZXIgPSB7XG4gICAgICAgIG5hbWU6IGdldENvbnRyb2xsZXJOYW1lKGNvbnRyb2xsZXIpLFxuICAgICAgICBvYmplY3Q6IGNvbnRyb2xsZXJcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IHRlbXBsYXRlTmFtZSA9IHRoaXMuX25vZGVUZW1wbGF0ZU5hbWUocmVuZGVyTm9kZSk7XG4gICAgaWYgKHRlbXBsYXRlTmFtZSkge1xuICAgICAgb3B0aW9ucy50ZW1wbGF0ZSA9IHtcbiAgICAgICAgbmFtZTogdGVtcGxhdGVOYW1lXG4gICAgICB9O1xuICAgIH1cblxuICAgIGxldCBtb2RlbDtcbiAgICBpZiAoY29udHJvbGxlcikge1xuICAgICAgbW9kZWwgPSBjb250cm9sbGVyLmdldCgnbW9kZWwnKTtcbiAgICB9XG4gICAgaWYgKG1vZGVsKSB7XG4gICAgICBtb2RlbE5hbWUgPSB0aGlzLmdldCgnb2JqZWN0SW5zcGVjdG9yJykuaW5zcGVjdChtb2RlbCk7XG4gICAgICBvcHRpb25zLm1vZGVsID0ge1xuICAgICAgICBuYW1lOiBtb2RlbE5hbWUsXG4gICAgICAgIG9iamVjdDogbW9kZWxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IHZpZXcgPSB0aGlzLl92aWV3SW5zdGFuY2VGb3JOb2RlKHJlbmRlck5vZGUpO1xuXG4gICAgaWYgKHZpZXcpIHtcbiAgICAgIG9wdGlvbnMudmlldyA9IHtcbiAgICAgICAgbmFtZTogZ2V0Vmlld05hbWUodmlldyksXG4gICAgICAgIG9iamVjdDogdmlld1xuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aGlzLl9oaWdobGlnaHRSYW5nZShyZWN0LCBvcHRpb25zKTtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIGVzY2FwZUhUTUwoc3RyaW5nKSB7XG4gIGxldCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgZGl2LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHN0cmluZykpO1xuICByZXR1cm4gZGl2LmlubmVySFRNTDtcbn1cbiJdfQ==