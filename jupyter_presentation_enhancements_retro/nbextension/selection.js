/**
 * presentation_enhancements_retro — click away to drop the selection outline.
 *
 * Classic Notebook always keeps exactly one cell selected. There is no "select
 * nothing" state: `Notebook.get_selected_index` reads the `selected` flag off
 * the Cell objects, and every command-mode action assumes it finds one. So the
 * grey box and blue left bar that nbclassic paints on `div.cell.selected` sit
 * on whichever cell you last touched with no way to dismiss them — including
 * in the middle of a slide, in front of the audience.
 *
 * This module makes a click that lands off any cell *hide* that painting. It
 * never touches the notebook's own selection: nothing calls `Cell.unselect`,
 * no `selected` flag is flipped, no class the notebook manages is removed. All
 * that changes is a class on <body> gating a couple of rules in main.css, so
 * arrow keys, Shift-Enter, cut/paste and everything else behave exactly as
 * before — you just cannot see which cell they will act on until you bring the
 * outline back.
 *
 * The outline comes back on the next click into a cell, and (outside a
 * slideshow) on any key press or programmatic selection change, so you are
 * never left navigating blind. Inside a slideshow keys are slide navigation,
 * not cell navigation, so they deliberately do not bring it back.
 *
 * See also the "Hide Selected-Cell Outline During Slideshow" target in
 * slidechrome.js, which suppresses the same painting for the whole slideshow
 * without needing the click.
 */
define(['base/js/events', './util'], function (events, util) {
  'use strict';

  var BODY_CLASS = 'pre-no-selection';

  /*
   * A click on this chrome is not a click "off the cell" — it is the menus,
   * the toolbar, a dialog, or reveal's own on-slide controls. Leave the
   * outline exactly as it is; only clicks into the notebook/slide body itself
   * should change it.
   */
  var CHROME = [
    '#header',
    '#menubar',
    '#maintoolbar',
    '.modal',
    '.dropdown-menu',
    '.reveal .controls',
    '.reveal .progress',
    '.reveal .slide-number',
    '.reveal .speaker-controls'
  ].join(', ');

  function hide() {
    document.body.classList.add(BODY_CLASS);
  }

  function show() {
    document.body.classList.remove(BODY_CLASS);
  }

  /** The nearest Element for an event target (text nodes fire on some paths). */
  function elementOf(target) {
    if (!target) {
      return null;
    }
    if (target.nodeType !== Node.ELEMENT_NODE) {
      target = target.parentElement;
    }
    return target && target.closest ? target : null;
  }

  /*
   * Capture phase: some cell click handlers stop propagation, and we want to
   * see the click either way. Order does not matter — all we do is read the
   * target, so it is safe to run before the notebook selects the cell.
   */
  function onPointerDown(event) {
    var target = elementOf(event.target);
    if (!target) {
      return;
    }
    if (target.closest('.cell')) {
      show();
      return;
    }
    if (target.closest(CHROME)) {
      return;
    }
    hide();
  }

  function onKeyDown() {
    if (!util.inSlideshow()) {
      show();
    }
  }

  function onSelect() {
    if (!util.inSlideshow()) {
      show();
    }
  }

  function load() {
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    events.on('select.Cell', onSelect);
  }

  return {
    load: load,
    hide: hide,
    show: show
  };
});
