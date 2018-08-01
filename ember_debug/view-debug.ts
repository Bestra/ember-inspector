/* eslint no-cond-assign:0 */
import PortMixin from 'ember-debug/mixins/port-mixin';
import GlimmerTree, {
  Options as GlimmerTreeOptions,
} from 'ember-debug/libs/glimmer-tree';
import {
  modelName as getModelName,
  shortModelName as getShortModelName,
  controllerName as getControllerName,
  shortControllerName as getShortControllerName,
  viewName as getViewName,
  shortViewName as getShortViewName,
} from 'ember-debug/utils/name-functions';
import {
  InspectedNodeValue,
  Message,
  InspectMessage,
} from 'ember-debug/message-types';

const Ember = window.Ember;

const {
  guidFor,
  computed,
  run,
  Object: EmberObject,
  typeOf,
  Component,
  Controller,
  ViewUtils,
  A,
} = Ember;
const { later } = run;
const { readOnly } = computed;
const { getViewBoundingClientRect } = ViewUtils;

const keys = Object.keys || Ember.keys;

let layerDiv: HTMLDivElement;
let previewDiv: HTMLDivElement;
let highlightedElement: any;
const noOp = () => {};

type RenderNode = any;

interface RenderTreeNode {
  value: any;
  children: any[];
}

interface RenderNodeSpec {
  template: string;
  name: string;
  objectId: any;
  renderNodeId: number;
  viewClass?: string;
  duration?: any;
  completeViewClass?: string;
  isComponent: boolean;
  tagName?: string;
  isVirtual: boolean;
  controller?: {
    name: string;
    completeName: string;
    objectId: string;
  };
  model?: {
    name: string;
    type: string;
    completeName?: string;
    objectId?: string;
  };
}
interface HighlightOptions {
  isPreview: boolean;
  controller?: { name: string; object: any };
  template?: { name: string };
  model?: { name: string; object: any };
  view?: { name: string; object: any };
  element?: Element
}
export default class extends EmberObject.extend(PortMixin, {
  namespace: null,

  adapter: readOnly('namespace.adapter'),
  port: readOnly('namespace.port'),
  objectInspector: readOnly('namespace.objectInspector'),

  retainedObjects: [] as any,

  _durations: {} as any,

  options: {} as GlimmerTreeOptions,

  portNamespace: 'view',
  glimmerTree: {} as GlimmerTree,

  resizeHandler: noOp as any,
  viewTreeChanged: noOp as any,
  lastClickedHandler: noOp as any,
  mousemoveHandler: noOp as any,
  mousedownHandler: noOp as any,
  mouseupHandler: noOp as any,

  lastClickedElement: null as any,

  eventNamespace: computed(function() {
    return `view_debug_${guidFor(this)}`;
  }),

  /**
   * List of render nodes from the last
   * sent view tree.
   *
   * @property lastNodes
   * @type {Array}
   */
  _lastNodes: computed(function() {
    return A<any>([]);
  }),

  viewRegistry: computed('namespace.owner', function() {
    return this.getOwner().lookup('-view-registry:main');
  }),

  messages: {
    getTree() {
      this.sendTree();
    },
    hideLayer() {
      this.hideLayer();
    },
    previewLayer(message: Message) {
      if (this.glimmerTree) {
        // >= Ember 2.9
        this.glimmerTree.highlightLayer(
          message.objectId || message.elementId,
          true
        );
      } else {
        // 1.13 >= Ember <= 2.8
        if (message.renderNodeId !== undefined) {
          this._highlightNode(
            this.get('_lastNodes').objectAt(message.renderNodeId),
            true
          );
        } else if (message.objectId) {
          this.highlightView(
            this.get('objectInspector').sentObjects[message.objectId],
            true
          );
        }
      }
    },
    hidePreview() {
      this.hidePreview();
    },
    inspectViews(message: InspectMessage) {
      if (message.inspect) {
        this.startInspecting();
      } else {
        this.stopInspecting();
      }
    },

    scrollToElement({ elementId }: Message) {
      let el = document.querySelector(`#${elementId}`);
      if (el) {
        el.scrollIntoView();
      }
    },

    inspectElement({ objectId, elementId }: Message) {
      if (objectId) {
        this.inspectViewElement(objectId);
      } else {
        let element = document.getElementById(elementId);
        if (element) {
          this.inspectElement(element);
        }
      }
    },
    setOptions({ options }: { options: GlimmerTreeOptions }) {
      this.set('options', options);
      if (this.glimmerTree) {
        this.glimmerTree.updateOptions(options);
      }
      this.sendTree();
    },
    sendModelToConsole(message: InspectedNodeValue) {
      let model;
      if (this.glimmerTree) {
        model = this.glimmerTree.modelForViewNodeValue(message);
      } else {
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

  inspectComponentForNode(domNode: Element) {
    let viewElem = this.findNearestView(domNode);
    if (!viewElem) {
      this.get('adapter').log('No Ember component found.');
      return;
    }

    this.sendMessage('inspectComponent', {
      viewId: viewElem.id,
    });
  },

  updateDurations(durations: any) {
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

  retainObject(object: any) {
    this.retainedObjects.push(object);
    return this.get('objectInspector').retainObject(object);
  },

  releaseCurrentObjects() {
    this.retainedObjects.forEach((item: any) => {
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

  inspectViewElement(objectId: any) {
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
  inspectElement(element: Element) {
    this.get('adapter').inspectElement(element);
  },

  sendTree() {
    run.scheduleOnce('afterRender', this, this.scheduledSendTree);
  },

  startInspecting() {
    let viewElem: any = null;
    this.sendMessage('startInspecting', {});

    // we don't want the preview div to intercept the mousemove event
    previewDiv.style.pointerEvents = 'none';

    let pinView = () => {
      if (viewElem) {
        if (this.glimmerTree) {
          this.glimmerTree.highlightLayer(viewElem.id);
        } else {
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

    this.mousemoveHandler = (e: MouseEvent) => {
      viewElem = this.findNearestView(<Element>e.target);

      if (viewElem) {
        if (this.glimmerTree) {
          this.glimmerTree.highlightLayer(viewElem.id, true);
        } else {
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

  findNearestView(elem: Element | null): Element | null {
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
    let applicationView = document.querySelector(
      `${emberApp.rootElement} > .ember-view`
    );
    let applicationViewId = applicationView ? applicationView.id : undefined;
    let rootView = this.get('viewRegistry')[applicationViewId];
    // In case of App.reset view is destroyed
    if (this.glimmerTree) {
      // Glimmer 2
      tree = this.glimmerTree.build();
    } else if (rootView) {
      let children: any[] = [];
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
    return this.get('namespace.owner').hasRegistration(
      'service:-glimmer-environment'
    );
  },

  modelForView(view: any) {
    const controller = view.get('controller');
    let model = controller.get('model');
    if (view.get('context') !== controller) {
      model = view.get('context');
    }
    return model;
  },

  shouldShowView(view: any) {
    if (view instanceof Component) {
      return this.options.components;
    }
    return (
      (this.hasOwnController(view) || this.hasOwnContext(view)) &&
      (!view.get('isVirtual') ||
        this.hasOwnController(view) ||
        this.hasOwnContext(view))
    );
  },

  hasOwnController(view: any) {
    return (
      view.get('controller') !== view.get('_parentView.controller') &&
      (view instanceof Component ||
        !(view.get('_parentView.controller') instanceof Component))
    );
  },

  hasOwnContext(view: any) {
    // Context switching is deprecated, we will need to find a better way for {{#each}} helpers.
    return (
      view.get('context') !== view.get('_parentView.context') &&
      // make sure not a view inside a component, like `{{yield}}` for example.
      !(view.get('_parentView.context') instanceof Component)
    );
  },

  highlightView(element: any, isPreview = false) {
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
    } else {
      view = this.get('viewRegistry')[element.id];
    }

    rect = getViewBoundingClientRect(view);

    let templateName =
      view.get('templateName') || view.get('_debugTemplateName');
    let controller = view.get('controller');
    let model = controller && controller.get('model');
    let modelName;

    let options: HighlightOptions = {
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
  _highlightRange(rect: any, options: HighlightOptions) {
    let div;
    let isPreview = options.isPreview;

    // take into account the scrolling position as mentioned in docs
    // https://developer.mozilla.org/en-US/docs/Web/API/element.getBoundingClientRect
    let styles: any = {
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
    } else {
      this.hideLayer();
      div = layerDiv;
      this.hidePreview();
    }
    for (let prop in styles) {
      (div.style as any)[prop] = styles[prop];
    }
    let output = '';

    if (!isPreview) {
      output = "<span class='close' data-label='layer-close'>&times;</span>";
    }

    let template = options.template;

    if (template) {
      output += `<p class='template'><span>template</span>=<span data-label='layer-template'>${escapeHTML(
        template.name
      )}</span></p>`;
    }
    let view = options.view;
    let controller = options.controller;
    if (!view || !(view.object instanceof Component)) {
      if (controller) {
        output += `<p class='controller'><span>controller</span>=<span data-label='layer-controller'>${escapeHTML(
          controller.name
        )}</span></p>`;
      }
      if (view) {
        output += `<p class='view'><span>view</span>=<span data-label='layer-view'>${escapeHTML(
          view.name
        )}</span></p>`;
      }
    } else {
      output += `<p class='component'><span>component</span>=<span data-label='layer-component'>${escapeHTML(
        view.name
      )}</span></p>`;
    }

    let model = options.model;
    if (model) {
      output += `<p class='model'><span>model</span>=<span data-label='layer-model'>${escapeHTML(
        model.name
      )}</span></p>`;
    }
    div.innerHTML = output;

    for (let p of div.querySelectorAll<HTMLElement>('p')) {
      p.style.cssFloat = 'left';
      p.style.margin = '0';
      p.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      p.style.padding = '5px';
      p.style.color = 'rgb(0, 0, 153)';
    }
    for (let p of div.querySelectorAll<HTMLElement>('p.model')) {
      p.style.clear = 'left';
    }
    for (let p of div.querySelectorAll<HTMLElement>('p span:first-child')) {
      p.style.color = 'rgb(153, 153, 0)';
    }
    for (let p of div.querySelectorAll<HTMLElement>('p span:last-child')) {
      p.style.color = 'rgb(153, 0, 153)';
    }

    if (!isPreview) {
      let cancelEvent = function(e: Event) {
        e.preventDefault();
        e.stopPropagation();
      };
      for (let span of div.querySelectorAll<HTMLElement>('span.close')) {
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
        span.addEventListener('click', (e: MouseEvent) => {
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

    for (let span of div.querySelectorAll<HTMLElement>('p.template span:last-child')) {
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => {
        if (view) {
          this.inspectViewElement(guidFor(view.object));
        } else if (options.element) {
          this.inspectElement(options.element);
        }
      });
    }

    if (
      model &&
      model.object &&
      (model.object instanceof EmberObject || typeOf(model.object) === 'array')
    ) {
      for (let span of div.querySelectorAll<HTMLElement>('p.model span:last-child')) {
        span.style.cursor = 'pointer';
        span.addEventListener('click', () => {
          this.get('objectInspector').sendObject(model!.object);
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

  _addClickListeners(div: HTMLElement, item: any, selector: string) {
    for (let span of div.querySelectorAll<HTMLElement>(
      `p.${selector} span:last-child`
    )) {
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
  _appendNodeChildren(renderNode: RenderTreeNode, children: RenderTreeNode[]) {
    let childNodes = this._childrenForNode(renderNode);
    if (!childNodes) {
      return;
    }
    childNodes.forEach((childNode: any) => {
      if (this._shouldShowNode(childNode, renderNode)) {
        let grandChildren: RenderTreeNode[] = [];
        children.push({
          value: this._inspectNode(childNode),
          children: grandChildren,
        });
        this._appendNodeChildren(childNode, grandChildren);
      } else {
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
  _childrenForNode(renderNode: RenderNode) {
    if (renderNode.morphMap) {
      return keys(renderNode.morphMap)
        .map(key => renderNode.morphMap[key])
        .filter(node => !!node);
    } else {
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
  _shouldShowNode(renderNode: RenderNode, parentNode: RenderNode) {
    // Filter out non-(view/components)
    if (!this._nodeIsView(renderNode)) {
      return false;
    }
    // Has either a template or a view/component instance
    if (
      !this._nodeTemplateName(renderNode) &&
      !this._nodeHasViewInstance(renderNode)
    ) {
      return false;
    }
    return (
      this._nodeHasOwnController(renderNode, parentNode) &&
      (this.options.components || !this._nodeIsEmberComponent(renderNode)) &&
      (this._nodeHasViewInstance(renderNode) ||
        this._nodeHasOwnController(renderNode, parentNode))
    );
  },

  /**
   * The node's model. If the view has a controller,
   * it will be the controller's `model` property.s
   *
   * @param  {Object} renderNode
   * @return {Object} the model
   */
  _modelForNode(renderNode: RenderNode) {
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
  _nodeIsView(renderNode: RenderNode) {
    if (renderNode.getState) {
      return !!renderNode.getState().manager;
    } else {
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
  _nodeHasOwnController(renderNode: RenderNode, parentNode: RenderNode) {
    return (
      this._controllerForNode(renderNode) !==
      this._controllerForNode(parentNode)
    );
  },

  /**
   * Check if the node has a view instance.
   * Virtual nodes don't have a view/component instance.
   *
   * @param  {Object} renderNode
   * @return {Boolean}
   */
  _nodeHasViewInstance(renderNode: RenderNode) {
    return !!this._viewInstanceForNode(renderNode);
  },

  /**
   * Returns the nodes' controller.
   *
   * @param  {Object} renderNode
   * @return {Ember.Controller}
   */
  _controllerForNode(renderNode: RenderNode) {
    // If it's a component then return the component instance itself
    if (this._nodeIsEmberComponent(renderNode)) {
      return this._viewInstanceForNode(renderNode);
    }
    if (renderNode.lastResult) {
      let scope = renderNode.lastResult.scope;
      let controller;
      if (scope.getLocal) {
        controller = scope.getLocal('controller');
      } else {
        controller = scope.locals.controller.value();
      }
      if (
        (!controller || !(controller instanceof Controller)) &&
        scope.getSelf
      ) {
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
  _inspectNode(renderNode: RenderNode): RenderNodeSpec {
    let name,
      viewClassName,
      completeViewClassName,
      tagName,
      viewId,
      timeToRender;

    let viewClass = this._viewInstanceForNode(renderNode);

    if (viewClass) {
      viewClassName = getShortViewName(viewClass);
      completeViewClassName = getViewName(viewClass);
      tagName = viewClass.get('tagName') || 'div';
      viewId = this.retainObject(viewClass);
      timeToRender = this._durations[viewId];
    }

    name = this._nodeDescription(renderNode);

    let value: RenderNodeSpec = {
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
        } else {
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
  _nodeTemplateName(renderNode: RenderNode) {
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
  _nodeDescription(renderNode: RenderNode) {
    let name;

    let viewClass = this._viewInstanceForNode(renderNode);

    if (viewClass) {
      //. Has a view instance - take the view's name
      name = viewClass.get('_debugContainerKey');
      if (name) {
        name = name.replace(/.*(view|component):/, '').replace(/:$/, '');
      }
    } else {
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
  _viewInstanceForNode(renderNode: RenderNode) {
    return renderNode.emberView;
  },

  /**
   * Returns whether the node is an Ember Component or not.
   *
   * @param  {Object} renderNode
   * @return {Boolean}
   */
  _nodeIsEmberComponent(renderNode: RenderNode) {
    let viewInstance = this._viewInstanceForNode(renderNode);
    return !!(viewInstance && viewInstance instanceof Component);
  },

  /**
   * Highlight a render node on the screen.
   *
   * @param  {Object} renderNode
   * @param  {Boolean} isPreview (whether to pin the layer or not)
   */
  _highlightNode(renderNode: RenderNode, isPreview: boolean) {
    let modelName;
    // Todo: should be in Ember core
    let range = document.createRange();
    range.setStartBefore(renderNode.firstNode);
    range.setEndAfter(renderNode.lastNode);
    let rect = range.getBoundingClientRect();

    let options: HighlightOptions = { isPreview };

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
    this.options = {components: []};
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
    this.lastClickedHandler = (event: MouseEvent) => {
      if (event.button === 2) {
        this.lastClickedElement = event.target;
      }
    };
    window.addEventListener('mousedown', this.lastClickedHandler);

    this.resizeHandler = () => {
      if (this.glimmerTree) {
        this.hideLayer();
      } else {
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

function escapeHTML(string: string) {
  let div = document.createElement('div');
  div.appendChild(document.createTextNode(string));
  return div.innerHTML;
}
