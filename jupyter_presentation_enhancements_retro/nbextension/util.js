/**
 * presentation_enhancements_retro — shared helpers.
 *
 * Classic Notebook has no Settings Registry, so user preferences live in
 * localStorage (per browser, not per notebook) exactly as the sibling
 * cell-enhancements extension does. Anything that belongs *to the deck*
 * goes in notebook/cell metadata instead, so it travels with the .ipynb.
 */
define([
  'base/js/namespace',
  'base/js/events',
  './math'
], function (Jupyter, events, math) {
  'use strict';

  var STORE_PREFIX = 'presentation_enhancements_retro:';

  /* ---- Preferences (localStorage) ---------------------------------------- */

  function getSetting(key, fallback) {
    try {
      var raw = window.localStorage.getItem(STORE_PREFIX + key);
      if (raw === null) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function setSetting(key, value) {
    try {
      window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch (err) {
      /* private browsing / quota — preferences just won't persist */
    }
    events.trigger('setting_changed.PresentationEnhancements', {
      key: key,
      value: value
    });
  }

  /* ---- Misc --------------------------------------------------------------- */

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      var self = this;
      var args = arguments;
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(function () {
        timer = 0;
        fn.apply(self, args);
      }, wait);
    };
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(text)));
    return div.innerHTML;
  }

  /**
   * Render markdown to an HTML string.
   *
   * Classic Notebook bundles marked for its own markdown cells; we reuse it so
   * notes render the same way the notebook renders everything else. `marked`
   * is loaded lazily and cached — if it is unavailable for any reason we fall
   * back to escaped text with hard line breaks, which is ugly but never throws
   * mid-presentation.
   */
  var _marked = null;
  var _markedTried = false;

  function loadMarked(callback) {
    if (_markedTried) {
      callback(_marked);
      return;
    }
    require(['components/marked/lib/marked'], function (marked) {
      _markedTried = true;
      _marked = marked || null;
      callback(_marked);
    }, function () {
      _markedTried = true;
      _marked = null;
      callback(null);
    });
  }

  /*
   * Per-call options. `highlight: null` is the important one: nbclassic
   * installs a *three-argument* (async) highlighter on the shared marked
   * instance, but a synchronous marked() call invokes it with two arguments,
   * so its `callback(null, el.innerHTML)` throws "callback is not a function"
   * on every fenced code block with a language. marked itself tolerates the
   * resulting undefined (`out != null` guard in Renderer.code), so the output
   * is fine either way — but the console noise would land mid-presentation.
   * Notes don't need syntax highlighting; turn it off and stay quiet.
   */
  var MARKED_OPTIONS = {
    gfm: true,
    tables: true,
    highlight: null
  };

  /**
   * Render markdown to HTML.
   *
   * Returns { html, hasMath }. LaTeX is lifted out before marked sees it and
   * put back afterwards — otherwise underscores and asterisks inside `$...$`
   * are read as markdown emphasis and the maths is corrupted before anything
   * can typeset it. `hasMath` lets the caller skip the typesetting pass
   * entirely when there is nothing to typeset; it comes from what was
   * actually extracted, so prose containing a bare `$40` does not trigger it.
   */
  function renderMarkdown(text) {
    if (!text) {
      return { html: '', hasMath: false };
    }
    var parts = math.protect(text);
    var source = parts[0];
    var extracted = parts[1] || [];
    return {
      html: math.restore(renderMarkdownRaw(source), extracted),
      hasMath: extracted.length > 0
    };
  }

  function renderMarkdownRaw(text) {
    if (!text) {
      return '';
    }
    if (_marked) {
      try {
        // nbclassic ships marked 4.x, whose AMD build resolves to a namespace
        // object rather than a callable — nbclassic's own base/js/markdown.js
        // calls `marked.marked(...)`. Older builds hand back the callable
        // directly. Try every shape so this survives a marked upgrade.
        if (typeof _marked === 'function') {
          return _marked(text, MARKED_OPTIONS);
        }
        if (typeof _marked.marked === 'function') {
          return _marked.marked(text, MARKED_OPTIONS);
        }
        if (typeof _marked.parse === 'function') {
          return _marked.parse(text, MARKED_OPTIONS);
        }
      } catch (err) {
        console.warn('[presentation_enhancements_retro] markdown render failed', err);
      }
    }
    return '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
  }

  /* ---- Slideshow state ----------------------------------------------------- */

  /** True while RISE has taken over the page. */
  function inSlideshow() {
    return document.body.classList.contains('rise-enabled');
  }

  /**
   * The slideshow slide_type of a cell, normalised the same way RISE
   * normalises it (main.js `get_slide_type`): both undefined and '-' mean
   * "continues the current slide".
   */
  function slideType(cell) {
    var meta = (cell && cell.metadata && cell.metadata.slideshow) || {};
    var type = meta.slide_type;
    return type === undefined || type === '-' ? '' : type;
  }

  function markDirty() {
    if (Jupyter.notebook) {
      Jupyter.notebook.set_dirty(true);
    }
  }

  return {
    getSetting: getSetting,
    setSetting: setSetting,
    debounce: debounce,
    escapeHtml: escapeHtml,
    loadMarked: loadMarked,
    renderMarkdown: renderMarkdown,
    inSlideshow: inSlideshow,
    slideType: slideType,
    markDirty: markDirty
  };
});
