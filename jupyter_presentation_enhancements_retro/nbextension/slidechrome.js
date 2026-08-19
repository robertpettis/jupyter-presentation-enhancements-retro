/**
 * presentation_enhancements_retro — hide editing chrome during a slideshow.
 *
 * Notebook-editing affordances that are useful while authoring are clutter (or
 * worse, visible to the audience) once RISE takes over. This module owns the
 * toggles that suppress them.
 *
 * The mechanism is pure CSS, deliberately. RISE *moves* the live `.cell`
 * elements into `.reveal .slides` and hands them back when the slideshow ends,
 * so a rule scoped under `.reveal` applies exactly for the duration of the
 * slideshow and reverts on exit on its own. There is no enter/leave hook to
 * get wrong and no saved state to restore. All this module does is put a class
 * on <body> so each rule can be switched off.
 *
 * Some targets belong to sibling extensions (`cee-*` is
 * jupyter-cell-enhancements-retro). That is a deliberate cross-extension
 * dependency within this family: if a selector here stops matching after an
 * upgrade to that extension, the toggle silently does nothing — it cannot
 * break anything, but the chrome will reappear on slides.
 */
define(['./util'], function (util) {
  'use strict';

  /*
   * Each target is one menu checkbox. `bodyClass` gates a rule in main.css;
   * the selector it gates is documented alongside it there.
   */
  var TARGETS = [
    {
      key: 'hideCellTitles',
      label: 'Hide Cell Titles During Slideshow',
      bodyClass: 'pre-hide-cell-titles',
      fallback: true,
      owner: 'jupyter-cell-enhancements-retro (.cee-title-header)'
    }
  ];

  function isOn(target) {
    return util.getSetting(target.key, target.fallback) !== false;
  }

  function toggle(target) {
    util.setSetting(target.key, !isOn(target));
    apply();
  }

  /** Sync every target's body class with its stored preference. */
  function apply() {
    TARGETS.forEach(function (target) {
      document.body.classList.toggle(target.bodyClass, isOn(target));
    });
  }

  /**
   * Menu descriptors for main.js, so adding a target here is the only edit
   * needed to get a new checkbox in the Slides+ menu.
   */
  function menuItems() {
    return TARGETS.map(function (target) {
      return {
        label: target.label,
        isOn: function () { return isOn(target); },
        toggle: function () { toggle(target); }
      };
    });
  }

  /**
   * Selectors for chrome that must also be stripped out of cloned content —
   * the speaker-notes window receives raw innerHTML, where CSS cannot reach.
   */
  function clonedChromeSelectors() {
    return '.cee-title-header';
  }

  function load() {
    apply();
  }

  return {
    load: load,
    apply: apply,
    menuItems: menuItems,
    clonedChromeSelectors: clonedChromeSelectors
  };
});
