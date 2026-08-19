/**
 * presentation_enhancements_retro — speaker notes stored in cell metadata.
 *
 * DO NOT RENAME THIS FILE TO notes.js (or anything ending in "notes.js").
 * -----------------------------------------------------------------------
 * Reveal's own notes plugin finds its popup window's HTML by sniffing the
 * document for a script tag:
 *
 *     document.querySelector('script[src*="notes.js"]').src
 *         .replace(/notes\.js(\?.*)?$/, '') + 'notes.html'
 *
 * `querySelector` returns the *first* match in document order. RequireJS
 * loads this nbextension at page load, long before RISE loads reveal's
 * plugins, so a file named notes.js here wins that lookup — reveal then
 * resolves notes.html against *our* directory and the speaker window 404s.
 * (RISE also ships a notes.js.patched using `src$=`, ends-with, which a
 * name ending in notes.js would still match.) Hence: speaker.js.
 *
 * Why this exists
 * ---------------
 * RISE's native speaker notes are ordinary cells tagged `slide_type: notes`.
 * That means the notes are ordinary *content*: open the .ipynb in JupyterLab,
 * Notebook 7, GitHub or nbviewer and your entire speaker script is on display.
 *
 * This module moves notes into cell metadata (`presentation_notes`), which no
 * other renderer displays, and re-materialises them as `<aside class="notes">`
 * only when RISE is actually running. Editing happens in a pane docked to the
 * right of each cell, toggled from the Slides+ menu.
 *
 * How the slideshow half works
 * ----------------------------
 * Reveal 3.9.2's notes plugin (`post()` in plugin/notes/notes.js) reads the
 * *first* `aside.notes` descendant of the current section — `querySelector`,
 * singular. RISE wraps each notes cell in its own aside, so a slide carrying
 * more than one notes cell silently shows only the first. We sidestep that
 * entirely: one merged aside per section, prepended so it is unambiguously the
 * one the plugin finds. Legacy notes cells are cloned into it in document
 * order, so mixed notebooks keep working and gain the missing notes back.
 *
 * `.reveal aside.notes { display: none }` (reveal.css:1519) keeps all of this
 * off the audience screen.
 */
define([
  'jquery',
  'base/js/namespace',
  'base/js/dialog',
  './util',
  './slidechrome'
], function ($, Jupyter, dialog, util, slideChrome) {
  'use strict';

  var META_KEY = 'presentation_notes';
  var DEFAULT_WIDTH = 320;

  /* ---- Metadata accessors -------------------------------------------------- */

  function getNotes(cell) {
    if (!cell || !cell.metadata) {
      return '';
    }
    var value = cell.metadata[META_KEY];
    return typeof value === 'string' ? value : '';
  }

  function setNotes(cell, text) {
    if (!cell || !cell.metadata) {
      return;
    }
    if (text && text.trim()) {
      cell.metadata[META_KEY] = text;
    } else {
      delete cell.metadata[META_KEY];
    }
    util.markDirty();
  }

  function hasNotes(cell) {
    return getNotes(cell).trim() !== '';
  }

  /* ---- Preferences --------------------------------------------------------- */

  function paneEnabled() {
    return util.getSetting('showNotesPane', true) !== false;
  }

  function togglePane() {
    util.setSetting('showNotesPane', !paneEnabled());
    refreshAll();
  }

  function paneWidth() {
    var width = parseInt(util.getSetting('notesPaneWidth', DEFAULT_WIDTH), 10);
    return isNaN(width) || width < 160 ? DEFAULT_WIDTH : width;
  }

  function promptForWidth() {
    var input = $('<input/>', {
      type: 'number',
      'class': 'form-control',
      min: 160,
      max: 900,
      step: 10,
      value: paneWidth()
    });
    dialog.modal({
      title: 'Notes pane width',
      body: $('<div/>')
        .append($('<p/>').text('Width of the speaker-notes pane, in pixels.'))
        .append(input),
      buttons: {
        Cancel: {},
        'Set width': {
          'class': 'btn-primary',
          click: function () {
            var value = parseInt(input.val(), 10);
            if (!isNaN(value)) {
              util.setSetting('notesPaneWidth', Math.min(900, Math.max(160, value)));
              refreshAll();
            }
          }
        }
      }
    });
  }

  /* ---- Editing pane -------------------------------------------------------- */

  /** Build (once) the notes pane for a cell and keep its content in sync. */
  function ensurePane(cell) {
    var el = cell.element && cell.element[0];
    if (!el) {
      return;
    }

    var pane = el.querySelector(':scope > .pre-notes-pane');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'pre-notes-pane';

      var head = document.createElement('div');
      head.className = 'pre-notes-head';

      var title = document.createElement('span');
      title.className = 'pre-notes-title';
      title.textContent = 'Speaker notes';
      head.appendChild(title);

      var del = document.createElement('button');
      del.className = 'pre-notes-del';
      del.type = 'button';
      del.title = 'Delete these notes';
      del.textContent = '×';
      del.addEventListener('click', function (event) {
        event.preventDefault();
        setNotes(cell, '');
        el.classList.remove('pre-notes-open');
        refreshAll();
      });
      head.appendChild(del);

      pane.appendChild(head);

      var textarea = document.createElement('textarea');
      textarea.className = 'pre-notes-text';
      textarea.setAttribute('placeholder',
        'Markdown. Shown only in the RISE presenter view — never in the ' +
        'notebook, an export, or on the audience screen.');
      textarea.addEventListener('input', util.debounce(function () {
        setNotes(cell, textarea.value);
      }, 400));
      // Flush immediately on blur so a note is never lost to the debounce.
      textarea.addEventListener('blur', function () {
        setNotes(cell, textarea.value);
      });
      // Classic Notebook binds single-key command-mode shortcuts globally;
      // stop them firing while the caret is in the notes textarea.
      textarea.addEventListener('keydown', function (event) {
        event.stopPropagation();
      });
      pane.appendChild(textarea);

      el.appendChild(pane);
    }

    pane.style.width = paneWidth() + 'px';

    // Never clobber what the user is currently typing.
    var field = pane.querySelector('.pre-notes-text');
    if (field && field !== document.activeElement) {
      var text = getNotes(cell);
      if (field.value !== text) {
        field.value = text;
      }
    }
  }

  function removePane(cell) {
    var el = cell.element && cell.element[0];
    if (!el) {
      return;
    }
    var pane = el.querySelector(':scope > .pre-notes-pane');
    if (pane) {
      pane.parentNode.removeChild(pane);
    }
  }

  /** The faint hover affordance on cells that have no notes yet. */
  function ensureAddButton(cell) {
    var el = cell.element && cell.element[0];
    if (!el || el.querySelector(':scope > .pre-notes-add')) {
      return;
    }
    var button = document.createElement('button');
    button.className = 'pre-notes-add';
    button.type = 'button';
    button.title = 'Add speaker notes';
    button.textContent = 'notes';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      el.classList.add('pre-notes-open');
      refreshAll();
      var field = el.querySelector('.pre-notes-text');
      if (field) {
        field.focus();
      }
    });
    el.appendChild(button);
  }

  function removeAddButton(cell) {
    var el = cell.element && cell.element[0];
    if (!el) {
      return;
    }
    var button = el.querySelector(':scope > .pre-notes-add');
    if (button) {
      button.parentNode.removeChild(button);
    }
  }

  /** Reconcile every cell's pane/affordance with the current settings. */
  function refreshAll() {
    if (!Jupyter.notebook) {
      return;
    }

    var enabled = paneEnabled();
    document.body.classList.toggle('pre-notes-on', enabled);
    document.documentElement.style.setProperty(
      '--pre-notes-width', paneWidth() + 'px');

    Jupyter.notebook.get_cells().forEach(function (cell) {
      var el = cell.element && cell.element[0];
      if (!el) {
        return;
      }

      if (!enabled) {
        removePane(cell);
        removeAddButton(cell);
        el.classList.remove('pre-notes-has', 'pre-notes-open');
        return;
      }

      // Skipped cells never reach the slideshow, and a legacy notes cell is
      // already a note — neither should be offered the affordance.
      var type = util.slideType(cell);
      var eligible = type !== 'skip' && type !== 'notes';
      var wantsPane = hasNotes(cell) || el.classList.contains('pre-notes-open');

      if (wantsPane) {
        ensurePane(cell);
        removeAddButton(cell);
        el.classList.add('pre-notes-has');
      } else {
        removePane(cell);
        el.classList.remove('pre-notes-has');
        if (eligible) {
          ensureAddButton(cell);
        } else {
          removeAddButton(cell);
        }
      }
    });
  }

  /** Open (and focus) the notes pane for the selected cell. */
  function editSelected() {
    var cell = Jupyter.notebook.get_selected_cell();
    if (!cell) {
      return;
    }
    if (!paneEnabled()) {
      util.setSetting('showNotesPane', true);
    }
    var el = cell.element && cell.element[0];
    if (el) {
      el.classList.add('pre-notes-open');
    }
    refreshAll();
    var field = el && el.querySelector('.pre-notes-text');
    if (field) {
      field.focus();
    }
  }

  function clearSelected() {
    var cell = Jupyter.notebook.get_selected_cell();
    if (!cell) {
      return;
    }
    setNotes(cell, '');
    var el = cell.element && cell.element[0];
    if (el) {
      el.classList.remove('pre-notes-open');
    }
    refreshAll();
  }

  /* ---- Slideshow injection -------------------------------------------------- */

  var INJECTED_CLASS = 'pre-notes-aside';

  function removeInjected() {
    var stale = document.querySelectorAll('aside.' + INJECTED_CLASS);
    Array.prototype.forEach.call(stale, function (node) {
      node.parentNode.removeChild(node);
    });
  }

  /**
   * Walk the notebook once, grouping each cell's note contribution under the
   * reveal <section> RISE moved that cell into, then prepend one merged
   * aside per section.
   */
  function injectAll() {
    var slides = document.querySelector('.reveal .slides');
    if (!slides || !Jupyter.notebook) {
      return;
    }

    removeInjected();

    var order = [];
    var bySection = new Map();

    Jupyter.notebook.get_cells().forEach(function (cell) {
      var el = cell.element && cell.element[0];
      if (!el) {
        return;
      }

      // Innermost <section> is the subslide RISE appended this cell to.
      var section = el.closest('section');
      if (!section || !slides.contains(section)) {
        return;
      }

      var type = util.slideType(cell);
      if (type === 'skip') {
        return;
      }

      var html = '';
      if (type === 'notes') {
        // Legacy notes cell. Clone rather than move: RISE hands these exact
        // elements back to the notebook when the slideshow exits, so the
        // original must stay where RISE put it. Cloning also preserves code
        // cells' rendered outputs, which a source-text copy would lose.
        var clone = el.cloneNode(true);
        // Strip editing chrome — ours and the siblings' — or it is copied
        // verbatim into the speaker window. CSS cannot help here: the popup
        // receives raw innerHTML and none of our stylesheets.
        Array.prototype.forEach.call(
          clone.querySelectorAll(
            '.pre-notes-pane, .pre-notes-add, ' +
            slideChrome.clonedChromeSelectors()),
          function (node) { node.parentNode.removeChild(node); }
        );
        html = '<div class="pre-note-item pre-note-legacy">' +
          clone.innerHTML + '</div>';
      } else {
        var text = getNotes(cell);
        if (text.trim()) {
          html = '<div class="pre-note-item">' +
            util.renderMarkdown(text) + '</div>';
        }
      }

      if (!html) {
        return;
      }

      if (!bySection.has(section)) {
        bySection.set(section, []);
        order.push(section);
      }
      bySection.get(section).push(html);
    });

    order.forEach(function (section) {
      var aside = document.createElement('aside');
      // 'notes' is what the reveal plugin looks for; the second class is ours
      // so cleanup can find it again.
      aside.className = 'notes ' + INJECTED_CLASS;
      aside.innerHTML = bySection.get(section).join('\n');
      // Prepend: the plugin takes the *first* aside.notes it finds, so ours
      // must precede any legacy asides we have already absorbed.
      section.insertBefore(aside, section.firstChild);
    });
  }

  /**
   * RISE fires no jQuery events, so we watch for the body class it toggles
   * and then wait for Reveal itself to appear.
   */
  function installSlideshowHook() {
    var active = false;
    var pollTimer = 0;

    function stopPolling() {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = 0;
      }
    }

    function onStart() {
      stopPolling();
      var tries = 0;
      pollTimer = window.setInterval(function () {
        tries += 1;
        if (document.querySelector('.reveal .slides section') && window.Reveal) {
          stopPolling();
          injectAll();
          // Reveal 3.x rebuilds/reflows on ready and on sync; re-running is
          // idempotent because injectAll() clears its own output first.
          if (typeof window.Reveal.addEventListener === 'function') {
            window.Reveal.addEventListener('ready', injectAll);
          }
        } else if (tries > 100) {
          stopPolling();
          console.warn('[presentation_enhancements_retro] Reveal never appeared');
        }
      }, 100);
    }

    function onEnd() {
      stopPolling();
      removeInjected();
    }

    var observer = new MutationObserver(function () {
      var on = util.inSlideshow();
      if (on && !active) {
        active = true;
        onStart();
      } else if (!on && active) {
        active = false;
        onEnd();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    if (util.inSlideshow()) {
      active = true;
      onStart();
    }
  }

  /* ---- Migration ------------------------------------------------------------ */

  /** Nearest preceding non-notes cell, else nearest following one. */
  function ownerFor(cells, index) {
    var i;
    for (i = index - 1; i >= 0; i--) {
      if (util.slideType(cells[i]) !== 'notes') {
        return i;
      }
    }
    for (i = index + 1; i < cells.length; i++) {
      if (util.slideType(cells[i]) !== 'notes') {
        return i;
      }
    }
    return -1;
  }

  /**
   * Notes cells -> metadata. Markdown notes cells convert; code notes cells
   * are left alone, because their value is usually a rendered output that
   * cannot be represented as a markdown string.
   */
  function importNotesCells() {
    var cells = Jupyter.notebook.get_cells();
    var convertible = [];
    var skippedCode = 0;
    var orphaned = 0;

    cells.forEach(function (cell, index) {
      if (util.slideType(cell) !== 'notes') {
        return;
      }
      if (cell.cell_type !== 'markdown') {
        skippedCode += 1;
        return;
      }
      var owner = ownerFor(cells, index);
      if (owner < 0) {
        orphaned += 1;
        return;
      }
      // Keep cell *objects*, not indices: the user can edit the notebook
      // while the confirmation dialog is open, and a stale index would make
      // this delete the wrong cell.
      convertible.push({ cell: cell, owner: cells[owner] });
    });

    if (!convertible.length) {
      dialog.modal({
        title: 'Import notes cells',
        body: 'No convertible notes cells found.' +
          (skippedCode ? ' (' + skippedCode + ' code notes cell(s) left alone.)' : ''),
        buttons: { OK: {} }
      });
      return;
    }

    var warning = $('<div/>');
    warning.append($('<p/>').text(
      'Move ' + convertible.length + ' markdown notes cell(s) into the ' +
      'metadata of the cell each one follows, then delete the now-empty ' +
      'notes cells.'));
    if (skippedCode) {
      warning.append($('<p/>').text(
        skippedCode + ' code notes cell(s) will be left exactly as they are — ' +
        'their notes are rendered output, which metadata cannot hold.'));
    }
    if (orphaned) {
      warning.append($('<p/>').text(
        orphaned + ' notes cell(s) have no cell to attach to and will be left ' +
        'alone.'));
    }
    warning.append($('<p/>').append($('<strong/>').text(
      'This edits the notebook. Nothing is written to disk until you save, so ' +
      'you can undo by closing without saving.')));

    dialog.modal({
      title: 'Import notes cells into metadata',
      body: warning,
      buttons: {
        Cancel: {},
        Import: {
          'class': 'btn-warning',
          click: function () {
            // Attach every note first...
            convertible.forEach(function (job) {
              var source = job.cell.get_text();
              var existing = getNotes(job.owner);
              setNotes(job.owner,
                existing ? existing + '\n\n' + source : source);
            });
            // ...then delete, resolving each index at the moment of deletion
            // so earlier deletions (or edits made while the dialog was open)
            // can't shift us onto the wrong cell.
            convertible.forEach(function (job) {
              var index = Jupyter.notebook.find_cell_index(job.cell);
              if (index !== null && index >= 0) {
                Jupyter.notebook.delete_cell(index);
              }
            });
            util.markDirty();
            refreshAll();
          }
        }
      }
    });
  }

  /**
   * Metadata -> notes cells. The escape hatch: restores standard RISE notes
   * cells so `nbconvert --to slides` (which knows nothing about our metadata)
   * can see them again.
   */
  function exportNotesCells() {
    var cells = Jupyter.notebook.get_cells();
    var targets = [];

    cells.forEach(function (cell) {
      if (hasNotes(cell)) {
        targets.push({ cell: cell, text: getNotes(cell) });
      }
    });

    if (!targets.length) {
      dialog.modal({
        title: 'Export notes to cells',
        body: 'No cells carry metadata notes.',
        buttons: { OK: {} }
      });
      return;
    }

    dialog.modal({
      title: 'Export metadata notes to notes cells',
      body: $('<div/>')
        .append($('<p/>').text(
          'Create ' + targets.length + ' markdown cell(s) tagged ' +
          'slide_type: notes, one after each cell that carries notes, and ' +
          'clear the metadata.'))
        .append($('<p/>').append($('<strong/>').text(
          'The notes become visible content again'))
          .append(document.createTextNode(
            ' — in JupyterLab, GitHub and every export. Use this only when ' +
            'you need nbconvert or another tool to see them.'))),
      buttons: {
        Cancel: {},
        Export: {
          'class': 'btn-warning',
          click: function () {
            // Resolve each owner's index at insertion time: every insert
            // shifts the cells after it, and the notebook may have changed
            // while this dialog was open.
            targets.forEach(function (job) {
              var index = Jupyter.notebook.find_cell_index(job.cell);
              if (index === null || index < 0) {
                return;
              }
              var created = Jupyter.notebook.insert_cell_below(
                'markdown', index);
              created.set_text(job.text);
              created.metadata.slideshow = { slide_type: 'notes' };
              created.render();
              setNotes(job.cell, '');
            });
            util.markDirty();
            refreshAll();
          }
        }
      }
    });
  }

  /* ---- Activation ------------------------------------------------------------ */

  function load() {
    // Warm the markdown renderer so the first slideshow doesn't race it.
    util.loadMarked(function () {});
    installSlideshowHook();
    refreshAll();
  }

  return {
    load: load,
    refreshAll: refreshAll,
    paneEnabled: paneEnabled,
    togglePane: togglePane,
    promptForWidth: promptForWidth,
    editSelected: editSelected,
    clearSelected: clearSelected,
    importNotesCells: importNotesCells,
    exportNotesCells: exportNotesCells,
    getNotes: getNotes,
    setNotes: setNotes,
    hasNotes: hasNotes
  };
});
