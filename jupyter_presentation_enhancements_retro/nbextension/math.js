/**
 * presentation_enhancements_retro — LaTeX in speaker notes.
 *
 * There are two distinct problems, and both have to be solved.
 *
 * 1. Markdown eats LaTeX. Run `$P(Y_1|X_i)$` through marked and the
 *    underscores become emphasis, so the maths is corrupted before anything
 *    tries to typeset it. nbclassic hits this too and solves it by pulling
 *    maths out before markdown and putting it back after — `remove_math` /
 *    `replace_math` in base/js/mathjaxutils. We reuse exactly that, so notes
 *    survive markdown the same way markdown cells do.
 *
 * 2. The speaker window has no MathJax. It is a separate popup that receives
 *    raw innerHTML and loads none of our scripts or stylesheets, so whatever
 *    we send has to already be self-contained. That rules out MathJax's
 *    default HTML-CSS output, which is spans that depend on MathJax's
 *    stylesheet.
 *
 *    So we typeset with the **SVG** output jax and `useFontCache: false`.
 *    The cache is the crux: with it on (the default) SVG output is
 *    `<use xlink:href="#MJMATHI-78">` pointing at a glyph `<defs>` block
 *    living elsewhere in the *notebook* document — every reference would
 *    dangle once copied into the popup, and the maths would render blank.
 *    Turning it off inlines each glyph as `<path>`, giving self-contained
 *    SVG that renders anywhere with no CSS, no fonts and no scripts.
 *
 * The renderer switch is global to MathJax (it is a singleton), so we put it
 * back afterwards and leave the notebook's own maths rendering as it was.
 *
 * Everything here degrades quietly: if MathJax is missing or anything throws,
 * the note keeps its raw `$...$`, which is at least readable.
 */
define(['base/js/mathjaxutils'], function (mathjaxutils) {
  'use strict';

  var initialised = false;

  function available() {
    return !!(window.MathJax && window.MathJax.Hub);
  }

  function init() {
    if (initialised) {
      return;
    }
    initialised = true;
    try {
      mathjaxutils.init();
    } catch (err) {
      console.warn('[presentation_enhancements_retro] MathJax init failed', err);
    }
  }

  /**
   * Pull maths out of markdown source so marked cannot mangle it.
   * Returns [textWithPlaceholders, mathArray] — feed the first to marked and
   * pass both to `restore`.
   */
  function protect(text) {
    try {
      return mathjaxutils.remove_math(text);
    } catch (err) {
      return [text, []];
    }
  }

  function restore(html, math) {
    if (!math || !math.length) {
      return html;
    }
    try {
      return mathjaxutils.replace_math(html, math);
    } catch (err) {
      return html;
    }
  }

  /**
   * Typeset the given elements to self-contained SVG, then call `done`.
   *
   * MathJax cannot measure inside `display: none`, and the injected asides are
   * hidden by `.reveal aside.notes { display: none }` — typesetting them where
   * they sit would yield zero-sized maths. So each element is briefly given
   * layout far off-screen (left: -10000px), typeset, and put back. It is never
   * visible on the audience screen at any point.
   */
  function typeset(elements, done) {
    var finish = done || function () {};
    if (!available() || !elements || !elements.length) {
      finish();
      return;
    }

    var MathJax = window.MathJax;

    var saved = elements.map(function (el) {
      var prev = el.getAttribute('style');
      el.style.cssText =
        'display:block;position:absolute;left:-10000px;top:0;width:900px;';
      return { el: el, prev: prev };
    });

    function restoreStyles() {
      saved.forEach(function (entry) {
        if (entry.prev === null) {
          entry.el.removeAttribute('style');
        } else {
          entry.el.setAttribute('style', entry.prev);
        }
      });
    }

    var previousRenderer = 'HTML-CSS';
    var switched = false;

    try {
      MathJax.Hub.Queue(function () {
        try {
          var settings = MathJax.Hub.config && MathJax.Hub.config.menuSettings;
          previousRenderer = (settings && settings.renderer) || 'HTML-CSS';
          // Must be set before the SVG jax loads, or the glyph cache wins.
          MathJax.Hub.Config({ SVG: { useFontCache: false } });
          MathJax.Hub.setRenderer('SVG');
          switched = true;
        } catch (err) {
          console.warn('[presentation_enhancements_retro] SVG renderer unavailable', err);
        }
      });

      elements.forEach(function (el) {
        MathJax.Hub.Queue(['Typeset', MathJax.Hub, el]);
      });

      MathJax.Hub.Queue(function () {
        try {
          if (switched) {
            MathJax.Hub.setRenderer(previousRenderer);
          }
        } catch (err) {
          console.warn('[presentation_enhancements_retro] renderer restore failed', err);
        }
        restoreStyles();
        finish();
      });
    } catch (err) {
      console.warn('[presentation_enhancements_retro] typeset failed', err);
      restoreStyles();
      finish();
    }
  }

  return {
    init: init,
    available: available,
    protect: protect,
    restore: restore,
    typeset: typeset
  };
});
