import { guidFor } from '@ember/object/internals';
import { run, later } from '@ember/runloop';
import { computed, get } from '@ember/object';
import EmberObject from '@ember/object';
import Evented from '@ember/object/evented';
import { readOnly } from '@ember/object/computed';
import { typeOf, isNone } from '@ember/utils';
import Component from '@ember/component';
import Controller from '@ember/controller';
import Mixin from '@ember/object/mixin';
import { makeArray } from '@ember/array';
import { keys } from '@ember/polyfills';
import { resolve, Promise } from 'rsvp';
import { Ember } from 'ember';

declare interface ViewUtils {
  getViewBoundingClientRect: any;
  getRootViews: any;
  getChildViews: any;
}

declare interface EmberBundle {
  guidFor: typeof guidFor;
  run: { later: typeof later } & typeof run;
  Object: typeof EmberObject;
  computed: typeof computed & { readOnly: typeof readOnly };
  // Object: EmberObject,
  typeOf: typeof typeOf;
  Component: typeof Component;
  Controller: typeof Controller;
  ViewUtils: ViewUtils;
  A: typeof makeArray;
  keys: typeof keys;
  Mixin: typeof Mixin;
  Evented: typeof Evented;
  RSVP: {
    Promise: typeof Promise;
    resolve: typeof resolve;
  };
  get: typeof get;
  isNone: typeof isNone;
}
// const {
// guidFor,
// computed,
// run,
// Object: EmberObject,
// typeOf,
// Component,
// Controller,
// ViewUtils,
// A
// } = Ember;
// const { later } = run;
// const { readOnly } = computed;
// const { getViewBoundingClientRect } = ViewUtils;

// const keys = Object.keys || Ember.keys;

declare global {
  interface Window {
    Ember: EmberBundle;
  }
}

declare global {
  function requireModule(moduleName: string): any;
}
