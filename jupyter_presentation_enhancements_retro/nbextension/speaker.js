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
  './slidechrome',
  './exec',
  './math'
], function ($, Jupyter, dialog, util, slideChrome, exec, math) {
  'use strict';

  var META_KEY = 'presentation_notes';
  var TYPE_KEY = 'presentation_notes_type';
  var DEFAULT_WIDTH = 320;

  /* Mirrors classic Notebook's own cell-type dropdown, minus the deprecated
   * "Heading" entry (which is only an alias for markdown with a leading #). */
  var TYPES = [
    { value: 'code', label: 'Code' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'raw', label: 'Raw NBConvert' }
  ];

  /* Output HTML from the last run of each note, for this browser session only.
   * Deliberately NOT persisted to metadata: stale saved output is worse than
   * no output, and it would bloat the .ipynb. Keyed by the cell object, so
   * entries vanish with the cells they belong to. */
  var outputs = new WeakMap();

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

  /** Note type, defaulting to markdown when unset so 0.1.x notes still work. */
  function getType(cell) {
    var value = cell && cell.metadata && cell.metadata[TYPE_KEY];
    return value === 'code' || value === 'raw' ? value : 'markdown';
  }

  function setType(cell, type) {
    if (!cell || !cell.metadata) {
      return;
    }
    if (type === 'code' || type === 'raw') {
      cell.metadata[TYPE_KEY] = type;
    } else {
      // markdown is the default; don't write the key for it.
      delete cell.metadata[TYPE_KEY];
    }
    util.markDirty();
  }

  /* ---- Running code notes --------------------------------------------------- */

  /**
   * Run one cell's code note, caching the output HTML for the session.
   * `done(ok)` is optional. Non-code notes complete immediately as a no-op.
   */
  function runNote(cell, done) {
    if (getType(cell) !== 'code' || !hasNotes(cell)) {
      if (done) { done(true); }
      return;
    }
    outputs.set(cell, { html: '', ok: true, running: true });
    paintPaneOutput(cell);
    exec.run(getNotes(cell), function (html, ok) {
      outputs.set(cell, { html: html, ok: ok, running: false });
      paintPaneOutput(cell);
      if (done) { done(ok); }
    });
  }

  /** Every cell carrying a code note, in notebook order. */
  function codeNoteCells() {
    if (!Jupyter.notebook) {
      return [];
    }
    return Jupyter.notebook.get_cells().filter(function (cell) {
      return getType(cell) === 'code' &&
        hasNotes(cell) &&
        util.slideType(cell) !== 'skip';
    });
  }

  /** Run every code note in the notebook, then report. */
  function runAllNotes() {
    var targets = codeNoteCells();
    if (!targets.length) {
      dialog.modal({
        title: 'Run code notes',
        body: 'No cells carry a code note.',
        buttons: { OK: {} }
      });
      return;
    }
    var remaining = targets.length;
    var failed = 0;
    targets.forEach(function (cell) {
      runNote(cell, function (ok) {
        if (!ok) { failed += 1; }
        remaining -= 1;
        if (remaining === 0) {
          console.log('[presentation_enhancements_retro] ran ' + targets.length +
            ' code note(s), ' + failed + ' with errors');
        }
      });
    });
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
      title.textContent = 'Notes';
      head.appendChild(title);

      var picker = document.createElement('select');
      picker.className = 'pre-notes-type';
      picker.title = 'How this note is treated — same choices as a real cell';
      TYPES.forEach(function (type) {
        var option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.label;
        picker.appendChild(option);
      });
      picker.addEventListener('change', function () {
        setType(cell, picker.value);
        // A type change invalidates any output from the previous type.
        outputs.delete(cell);
        refreshAll();
      });
      head.appendChild(picker);

      var runBtn = document.createElement('button');
      runBtn.className = 'pre-notes-run';
      runBtn.type = 'button';
      runBtn.title = 'Run this note in the kernel';
      runBtn.textContent = '▶';
      runBtn.addEventListener('click', function (event) {
        event.preventDefault();
        runNote(cell);
      });
      head.appendChild(runBtn);

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

      var out = document.createElement('div');
      out.className = 'pre-notes-out';
      pane.appendChild(out);

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

    var type = getType(cell);
    var picker = pane.querySelector('.pre-notes-type');
    if (picker && picker.value !== type) {
      picker.value = type;
    }
    // Code is the only type there is anything to run.
    pane.classList.toggle('pre-notes-is-code', type === 'code');
    if (field) {
      field.classList.toggle('pre-notes-mono', type !== 'markdown');
    }
    paintPaneOutput(cell);
  }

  /** Reflect the cached run state of a code note into its pane. */
  function paintPaneOutput(cell) {
    var el = cell.element && cell.element[0];
    var out = el && el.querySelector(':scope > .pre-notes-pane .pre-notes-out');
    if (!out) {
      return;
    }
    var state = outputs.get(cell);
    if (getType(cell) !== 'code' || !state) {
      out.innerHTML = '';
      out.classList.remove('pre-notes-out-error');
      return;
    }
    if (state.running) {
      out.innerHTML = '<div class="pre-notes-running">running…</div>';
      out.classList.remove('pre-notes-out-error');
      return;
    }
    out.innerHTML = state.html;
    out.classList.toggle('pre-notes-out-error', !state.ok);
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

  /* Set by renderNote() while injectAll() is building, so we only pay for a
   * MathJax pass when a note actually contains maths. */
  var sectionNeedsTypeset = false;

  /**
   * One note as HTML for the speaker window.
   *
   * The popup receives raw innerHTML and loads none of our stylesheets, so
   * anything that must look a particular way is styled inline here rather
   * than in main.css.
   */
  function renderNote(cell) {
    var text = getNotes(cell);
    if (!text.trim()) {
      return '';
    }
    var type = getType(cell);

    if (type === 'markdown') {
      var rendered = util.renderMarkdown(text);
      if (rendered.hasMath) {
        sectionNeedsTypeset = true;
      }
      return '<div class="pre-note-item">' + rendered.html + '</div>';
    }

    if (type === 'raw') {
      return '<div class="pre-note-item"><pre style="white-space:pre-wrap;">' +
        util.escapeHtml(text) + '</pre></div>';
    }

    // Code: the source, then whatever the last run produced.
    var parts = ['<div class="pre-note-item">'];
    parts.push(
      '<pre style="white-space:pre-wrap;margin:0 0 0.4em 0;' +
      'border-left:3px solid #7b7bb5;padding-left:0.6em;"><code>' +
      util.escapeHtml(text) + '</code></pre>'
    );
    var state = outputs.get(cell);
    if (state && state.running) {
      parts.push('<div style="opacity:0.6;font-style:italic;">running…</div>');
    } else if (state && state.html) {
      parts.push(
        '<div style="border-left:3px solid ' +
        (state.ok ? '#2e7d32' : '#a00000') + ';padding-left:0.6em;">' +
        state.html + '</div>'
      );
    } else if (!state) {
      parts.push('<div style="opacity:0.5;font-style:italic;">not run</div>');
    }
    parts.push('</div>');
    return parts.join('');
  }

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

    sectionNeedsTypeset = false;
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

      var slideKind = util.slideType(cell);
      if (slideKind === 'skip') {
        return;
      }

      var html = '';
      if (slideKind === 'notes') {
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
        html = renderNote(cell);
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

    var created = [];
    order.forEach(function (section) {
      var aside = document.createElement('aside');
      // 'notes' is what the reveal plugin looks for; the second class is ours
      // so cleanup can find it again.
      aside.className = 'notes ' + INJECTED_CLASS;
      aside.innerHTML = bySection.get(section).join('\n');
      // Prepend: the plugin takes the *first* aside.notes it finds, so ours
      // must precede any legacy asides we have already absorbed.
      section.insertBefore(aside, section.firstChild);
      created.push(aside);
    });

    // Typesetting is async, so the asides briefly hold raw $...$ — which is
    // exactly what the speaker window would have grabbed on slidechanged.
    // Push a refresh once MathJax is done, the same way a finished code note
    // does.
    if (sectionNeedsTypeset && created.length) {
      math.typeset(created, function () {
        exec.refreshSpeakerWindow();
      });
    }
  }

  function autoRunEnabled() {
    return util.getSetting('autoRunCodeNotes', true) !== false;
  }

  function toggleAutoRun() {
    util.setSetting('autoRunCodeNotes', !autoRunEnabled());
  }

  /**
   * Run any not-yet-run code notes belonging to the slide now on screen, then
   * rebuild the asides and push the result to the speaker window.
   *
   * Notes run at most once per slideshow session (the `outputs` cache is the
   * record of that), so flipping back and forth through a deck does not
   * re-execute anything — which matters when a note has side effects on the
   * kernel your slides share.
   */
  function runNotesOnCurrentSlide() {
    if (!autoRunEnabled() || !window.Reveal ||
        typeof window.Reveal.getCurrentSlide !== 'function') {
      return;
    }
    var section = window.Reveal.getCurrentSlide();
    if (!section) {
      return;
    }

    var pending = codeNoteCells().filter(function (cell) {
      if (outputs.has(cell)) {
        return false;
      }
      var el = cell.element && cell.element[0];
      return el && el.closest('section') === section;
    });
    if (!pending.length) {
      return;
    }

    var remaining = pending.length;
    pending.forEach(function (cell) {
      runNote(cell, function () {
        remaining -= 1;
        if (remaining === 0) {
          // Rebuild the asides with the fresh output, then make reveal's
          // notes plugin re-send the current slide to the popup — otherwise
          // the speaker window keeps showing the pre-execution snapshot it
          // grabbed on slidechanged.
          injectAll();
          exec.refreshSpeakerWindow();
        }
      });
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
            window.Reveal.addEventListener('slidechanged', runNotesOnCurrentSlide);
          }
          runNotesOnCurrentSlide();
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
    // Warm the markdown renderer and MathJax so the first slideshow doesn't
    // race either of them.
    util.loadMarked(function () {});
    math.init();
    installSlideshowHook();
    refreshAll();
  }

  return {
    load: load,
    refreshAll: refreshAll,
    paneEnabled: paneEnabled,
    togglePane: togglePane,
    promptForWidth: promptForWidth,
    autoRunEnabled: autoRunEnabled,
    toggleAutoRun: toggleAutoRun,
    runAllNotes: runAllNotes,
    editSelected: editSelected,
    clearSelected: clearSelected,
    importNotesCells: importNotesCells,
    exportNotesCells: exportNotesCells,
    getNotes: getNotes,
    setNotes: setNotes,
    hasNotes: hasNotes
  };
});
