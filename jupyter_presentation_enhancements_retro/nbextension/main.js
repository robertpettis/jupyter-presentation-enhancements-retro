/**
 * presentation_enhancements_retro — RISE presentation enhancements for classic
 * Notebook 6.
 *
 * Entry point: loads the stylesheet, activates each feature module once the
 * notebook is fully loaded, and contributes a "Slides+" menu plus toolbar
 * buttons so every command is reachable without a command palette.
 *
 * Features so far:
 *   notes — speaker notes stored in cell metadata rather than in visible cells.
 *           Lives in speaker.js, NOT notes.js: reveal's notes plugin locates
 *           its popup by grabbing the first `script[src*="notes.js"]` in the
 *           document, and ours would load first and hijack it. See the header
 *           of speaker.js.
 */
define([
  'require',
  'jquery',
  'base/js/namespace',
  'base/js/events',
  './util',
  './speaker',
  './slidechrome'
], function (require, $, Jupyter, events, util, notes, slideChrome) {
  'use strict';

  function loadCss() {
    var link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = require.toUrl('./main.css');
    document.head.appendChild(link);
  }

  /* ---- Toolbar ----------------------------------------------------------- */

  function addToolbarButtons() {
    var editAction = Jupyter.actions.register(
      {
        icon: 'fa-sticky-note-o',
        help: 'Edit speaker notes for this cell (metadata, not a cell)',
        help_index: 'zz',
        handler: notes.editSelected
      },
      'edit-speaker-notes',
      'presentation-enhancements'
    );
    var toggleAction = Jupyter.actions.register(
      {
        icon: 'fa-columns',
        help: 'Show/hide the speaker-notes pane',
        help_index: 'zz',
        handler: notes.togglePane
      },
      'toggle-notes-pane',
      'presentation-enhancements'
    );
    Jupyter.toolbar.add_buttons_group([editAction, toggleAction]);
  }

  /* ---- Menu --------------------------------------------------------------- */

  function menuItem(label, onClick) {
    var link = $('<a/>', { href: '#' }).text(label);
    link.on('click', function (event) {
      event.preventDefault();
      onClick();
    });
    return $('<li/>').append(link);
  }

  /** A menu item with a leading check that reflects `isOn()` when shown. */
  function checkItem(label, isOn, onClick) {
    var check = $('<i/>', { 'class': 'fa fa-check pre-menu-check' });
    var link = $('<a/>', { href: '#' }).append(check).append(
      $('<span/>').text(' ' + label)
    );
    link.on('click', function (event) {
      event.preventDefault();
      onClick();
    });
    var item = $('<li/>').append(link);
    item.data('pre-sync', function () {
      check.css('visibility', isOn() ? 'visible' : 'hidden');
    });
    return item;
  }

  function addMenu() {
    var menu = $('<ul/>', { 'class': 'dropdown-menu' });

    menu.append(checkItem('Show Speaker-Notes Pane', notes.paneEnabled, notes.togglePane));
    menu.append(menuItem('Notes Pane Width…', notes.promptForWidth));
    menu.append($('<li/>', { 'class': 'divider' }));
    menu.append(menuItem('Edit Notes for Selected Cell', notes.editSelected));
    menu.append(menuItem('Clear Notes for Selected Cell', notes.clearSelected));
    menu.append($('<li/>', { 'class': 'divider' }));
    menu.append(menuItem('Run All Code Notes', notes.runAllNotes));
    menu.append(
      checkItem('Auto-Run Code Notes During Slideshow',
        notes.autoRunEnabled, notes.toggleAutoRun)
    );
    menu.append($('<li/>', { 'class': 'divider' }));
    slideChrome.menuItems().forEach(function (item) {
      menu.append(checkItem(item.label, item.isOn, item.toggle));
    });
    menu.append($('<li/>', { 'class': 'divider' }));
    menu.append(menuItem('Import: Notes Cells → Metadata…', notes.importNotesCells));
    menu.append(menuItem('Export: Metadata → Notes Cells…', notes.exportNotesCells));

    var dropdown = $('<li/>', { 'class': 'dropdown' })
      .append(
        $('<a/>', {
          href: '#',
          'class': 'dropdown-toggle',
          'data-toggle': 'dropdown'
        }).text('Slides+')
      )
      .append(menu);

    // Refresh every checkmark each time the menu opens.
    dropdown.on('click', function () {
      menu.find('li').each(function () {
        var sync = $(this).data('pre-sync');
        if (sync) {
          sync();
        }
      });
    });

    $('#menubar .nav.navbar-nav').first().append(dropdown);
  }

  /* ---- DOM observer -------------------------------------------------------
   * Classic Notebook has no cell-model signals, so a debounced observer on the
   * notebook container catches what the explicit events miss: markdown
   * re-renders, moved cells, undo, and RISE handing the cells back when a
   * slideshow ends.
   */

  var refreshTimer = 0;
  var refreshing = false;

  function refreshEverything() {
    refreshing = true;
    try {
      notes.refreshAll();
    } finally {
      window.setTimeout(function () {
        refreshing = false;
      }, 0);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(function () {
      refreshTimer = 0;
      refreshEverything();
    }, 200);
  }

  function watchNotebook() {
    var container = document.getElementById('notebook');
    if (!container || !window.MutationObserver) {
      return;
    }
    var OURS = '.pre-notes-pane, .pre-notes-add, .pre-notes-aside';
    var observer = new MutationObserver(function (mutations) {
      if (refreshing || util.inSlideshow()) {
        return;
      }
      var relevant = mutations.some(function (m) {
        var target = m.target;
        if (target.nodeType !== Node.ELEMENT_NODE) {
          target = target.parentElement;
        }
        return target && !(target.closest && target.closest(OURS));
      });
      if (relevant) {
        scheduleRefresh();
      }
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  /* ---- Activation ---------------------------------------------------------- */

  function init() {
    loadCss();
    slideChrome.load();
    notes.load();
    addToolbarButtons();
    addMenu();
    watchNotebook();
    console.log('[presentation_enhancements_retro] loaded');
  }

  function load_ipython_extension() {
    if (Jupyter.notebook && Jupyter.notebook._fully_loaded) {
      init();
    } else {
      events.on('notebook_loaded.Notebook', init);
    }
  }

  return { load_ipython_extension: load_ipython_extension };
});
