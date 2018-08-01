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
import {
  modelName as getModelName,
  shortModelName as getShortModelName,
  shortControllerName as getShortControllerName,
  shortViewName as getShortViewName,
} from 'ember-debug/utils/name-functions';
import ControllerType from '@ember/controller';
import ComponentType from '@ember/component';
import RouterType from '@ember/routing/router';
import { InspectedNodeValue } from 'ember-debug/message-types';

const {
  Object: EmberObject,
  typeOf,
  isNone,
  Controller,
  ViewUtils,
  get,
  A,
} = Ember;
const { getRootViews, getChildViews, getViewBoundingClientRect } = ViewUtils;

interface OutletState {
  render: { controller: any; template: any; name: any };
  outlets: any;
}

type DebugComponent = ComponentType & {
  layoutName: string | null;
  _debugContainerKey: string | null;
  _targetObject: any | null;
};
interface OutletTreeNode {
  value: Outlet;
  controller: any;
  children: OutletTreeNode[];
}
interface Outlet {
  controller: any;
  template: any;
  name: any;
  isComponent: boolean;
  // Outlets (except root) don't have elements
  tagName: string;
  model: any | null;
  elementId: any | null;
}

interface ComponentSpec {
  template: any;
  name: any;
  objectId: any;
  viewClass: any;
  duration: any;
  model: any | null;
  completeViewClass: any;
  isComponent: true;
  tagName: string;
}

interface OutletSpec {
  value: Outlet,
  controller: ControllerType,
}

export interface Options {
components: ComponentTree[]
}

interface ComponentTree {
  controller: any;
  components: any[];
}
export default class {
  options: Options;
  durations: any;
  owner: any;
  retainObject: any;
  highlightRange: any;
  objectInspector: any;
  viewRegistry: any;
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
  constructor({
    owner,
    retainObject,
    options,
    durations,
    highlightRange,
    objectInspector,
    viewRegistry,
  }: any) {
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
  updateOptions(options: Options) {
    this.options = options;
  }

  /**
   * @method updateDurations
   * @param {Object} durations
   */
  updateDurations(durations: object) {
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
  buildOutletTree(): OutletTreeNode {
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

  makeOutletTree(outletState: OutletState): OutletTreeNode {
    let {
      render: { controller },
      outlets,
    } = outletState;
    let node = {
      value: this.inspectOutlet(outletState),
      controller,
      children: [] as any[],
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
  buildComponentTrees(outletTree: OutletTreeNode): ComponentTree[] {
    let controllers = this.controllersFromOutletTree(outletTree);

    return controllers.map(controller => {
      let components = this.componentsForController(
        this.topComponents(),
        controller
      );
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
  componentsForController(
    components: DebugComponent[],
    controller: ControllerType
  ): Array<any> {
    let arr: any[] = [];
    components.forEach(component => {
      let currentController = this.controllerForComponent(component);
      if (!currentController) {
        return;
      }

      let children = this.componentsForController(
        this.childComponents(component),
        controller
      );
      if (currentController === controller) {
        arr.push({ value: this.inspectComponent(component), children });
      } else {
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
  childComponents(component: ComponentType): Array<any> {
    return getChildViews(component);
  }

  /**
   * Get the top level components.
   *
   * @method topComponents
   * @return {Array}  Array of components
   */
  topComponents(): Array<any> {
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
  addComponentsToOutlets(
    outletTree: OutletTreeNode,
    componentTrees: ComponentTree[]
  ) {
    let { value, controller, children } = outletTree;
    let newChildren: any = children.map(child =>
      this.addComponentsToOutlets(child, componentTrees)
    );
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
  controllersFromOutletTree({
    controller,
    children,
  }: OutletTreeNode): Array<any> {
    return [controller].concat(
      ...children.map(this.controllersFromOutletTree.bind(this))
    );
  }

  /**
   * @method getRouter
   * @return {Router}
   */
  getRouter(): RouterType & { _toplevelView: any } {
    return this.owner.lookup('router:main');
  }

  /**
   * Returns the current top level view.
   *
   * @method getRoot
   * @return {OutletView}
   */
  getRoot(): any {
    return this.getRouter().get('_toplevelView');
  }

  /**
   * Returns the application (top) outlet.
   *
   * @return The application outlet state
   */
  getApplicationOutlet() {
    // Support multiple paths to outletState for various Ember versions
    const outletState =
      this.getRoot().outletState || this.getRoot().state.ref.outletState;
    return outletState.outlets.main;
  }

  /**
   * The root's DOM element. The root is the only outlet view
   * with a DOM element.
   *
   * @method elementForRoot
   * @return {Element}
   */
  elementForRoot(): Element {
    let renderer = this.owner.lookup('renderer:-dom');
    return (
      renderer._roots &&
      renderer._roots[0] &&
      renderer._roots[0].result &&
      renderer._roots[0].result.firstNode()
    );
  }

  /**
   * Returns a component's template name.
   *
   * @method templateForComponent
   * @param  {Component} component
   * @return The template name
   */
  templateForComponent(
    component: ComponentType & {
      layoutName: string | null;
      _debugContainerKey: string | null;
    }
  ): string | null {
    let template = component.get('layoutName');

    if (!template) {
      let layout = component.get('layout');
      if (!layout) {
        let componentName = component.get('_debugContainerKey');
        if (componentName) {
          let layoutName = componentName.replace(
            /component:/,
            'template:components/'
          );
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
  inspectOutlet(outlet: OutletState): Outlet {
    let name = this.nameForOutlet(outlet);
    let template = this.templateForOutlet(outlet);
    let controller = this.controllerForOutlet(outlet);
    let value: Outlet = {
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
  inspectController(controller: ControllerType): object {
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
  inspectComponent(component: DebugComponent): ComponentSpec {
    let viewClass = getShortViewName(component);
    let completeViewClass = viewClass;
    let tagName = component.get('tagName');
    let objectId = this.retainObject(component);
    let duration = this.durations[objectId];

    let name = getShortViewName(component);
    let template = this.templateForComponent(component);

    let value: ComponentSpec = {
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
  modelForComponent(
    component: ComponentType & { model?: any | null }
  ): any | null {
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
  inspectModel(model: any): object {
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
  nameFromLayout(layout: any): string | null {
    let moduleName = layout && get(layout, 'meta.moduleName');
    if (moduleName) {
      return moduleName.replace(/\.hbs$/, '');
    } else {
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
  controllerForOutlet(outletState: any): ControllerType {
    return outletState.render.controller;
  }

  /**
   * The outlet's name.
   *
   * @method nameForOutlet
   * @param  {Object} outletState
   * @return {String}
   */
  nameForOutlet(outletState: OutletState): string {
    return outletState.render.name;
  }

  /**
   * The outlet's template name. Uses the module name attached during compilation.
   *
   * @method templateForOutlet
   * @param  {Object} outletState
   * @return {String}             The template name
   */
  templateForOutlet(outletState: OutletState): string | null {
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
  controllerForComponent(
    component: ComponentType & { _targetObject: any | null }
  ): ControllerType | null {
    let controller = component.get('_targetObject');
    if (!controller) {
      return null;
    }

    if (controller instanceof Controller) {
      return controller;
    } else {
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
  highlightComponent(component: any, isPreview: boolean = false) {
    let rect = getViewBoundingClientRect(component);

    let options = {
      isPreview,
      template: null as any,
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
  highlightRoot(isPreview: boolean = false) {
    let applicationOutlet = this.getApplicationOutlet();
    let element = this.elementForRoot();

    if (!element) {
      return;
    }

    let options = {
      isPreview,
      model: null as any | null,
      controller: null as any | null,
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
  getBoundingClientRect(element: Element): ClientRect {
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
  highlightIfRoot(elementId: string, isPreview = false) {
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
  highlightLayer(elementId: string, isPreview: boolean = false) {
    let component = this.componentById(elementId);
    if (component) {
      this.highlightComponent(component, isPreview);
    } else {
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
  isRootElement(element: Element): boolean {
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
  outletArray(outletTree?: OutletTreeNode): OutletSpec[] {
    if (!outletTree) {
      outletTree = this.buildOutletTree();
    }
    let { value, controller, children } = outletTree;
    let childValues = children.map(c => this.outletArray.call(this, c));
    return [{ value, controller }].concat(
      ...childValues
    );
  }

  /**
   * Returns a component when provided by its guid.
   *
   * @method componentById
   * @param  {String} id  The component's guid.
   * @return {Component}  The component.
   */
  componentById(id: string): ComponentType {
    return this.viewRegistry[id];
  }

  /**
   * @method modelForViewNodeValue
   * @param  {Boolean} isComponent
   * @param  {Object}  inspectedNodeValue
   * @return The inspected node's model (if it has one)
   */
  modelForViewNodeValue({ isComponent, objectId, name }: InspectedNodeValue): any | null {
    if (isComponent) {
      return this.modelForComponent(this.componentById(objectId));
    } else {
      let foundOutlet = A(this.outletArray()).findBy('value.name', name);
      if (foundOutlet) {
        let { controller } = foundOutlet;
        return controller.get('model');
      } else {
        return null;
      }
    }
  }
}
