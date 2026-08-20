/**
 * presentation_enhancements_retro — running code notes in the kernel.
 *
 * A code note is executed in the notebook's own kernel and its output is
 * captured as an HTML string, which is what the speaker window can consume
 * (the popup receives raw innerHTML and has no kernel of its own).
 *
 * Rendering goes through classic Notebook's own OutputArea, so a note's output
 * looks like any other cell's output: text, HTML, tables, and matplotlib PNGs
 * (which arrive as data: URIs and therefore survive the copy into the popup
 * intact). MathJax does not — the popup loads no MathJax — so LaTeX in an
 * output will show as source.
 *
 * Execution uses `store_history: false` so notes never consume In[N] numbers
 * or pollute the kernel's history. It is still the *same kernel* as the
 * notebook, though: a code note can absolutely mutate state your slides
 * depend on. That is inherent to the feature, not something this module can
 * defend against.
 */
define([
  'jquery',
  'base/js/namespace',
  'base/js/events',
  'notebook/js/outputarea'
], function ($, Jupyter, events, outputarea) {
  'use strict';

  function kernelReady() {
    var kernel = Jupyter.notebook && Jupyter.notebook.kernel;
    return !!(kernel && kernel.is_connected && kernel.is_connected());
  }

  function errorHtml(message) {
    return '<div class="pre-note-error">' + message + '</div>';
  }

  /**
   * Execute `code`, collecting its output into a detached OutputArea.
   *
   * `done(html, ok)` fires once, on the shell execute_reply. Outputs and the
   * reply share one multiplexed websocket and the kernel emits every output
   * before replying, so by the time the reply lands the OutputArea is
   * complete — no separate idle-status handshake needed.
   */
  function run(code, done) {
    if (!code || !code.trim()) {
      done('', true);
      return;
    }
    if (!kernelReady()) {
      done(errorHtml('No kernel — start or reconnect the kernel to run this note.'), false);
      return;
    }

    var host = $('<div class="pre-note-outputarea"></div>');
    var area = new outputarea.OutputArea({
      selector: host,
      prompt_area: false,
      events: events,
      keyboard_manager: Jupyter.keyboard_manager
    });

    var ok = true;
    var finished = false;

    function finish() {
      if (finished) {
        return;
      }
      finished = true;
      // Let any DOM work queued by handle_output settle before serialising.
      window.setTimeout(function () {
        done(host[0].innerHTML, ok);
      }, 0);
    }

    try {
      Jupyter.notebook.kernel.execute(
        code,
        {
          iopub: {
            output: function (msg) {
              if (msg.msg_type === 'error') {
                ok = false;
              }
              area.handle_output(msg);
            },
            clear_output: function (msg) {
              area.handle_clear_output(msg);
            }
          },
          shell: {
            reply: function (msg) {
              if (msg && msg.content && msg.content.status === 'error') {
                ok = false;
              }
              finish();
            }
          }
        },
        { silent: false, store_history: false, stop_on_error: false }
      );
    } catch (err) {
      console.warn('[presentation_enhancements_retro] note execution failed', err);
      done(errorHtml('Execution failed: ' + (err && err.message ? err.message : err)), false);
    }
  }

  /**
   * Force reveal's notes plugin to re-send the current slide to the speaker
   * window.
   *
   * The plugin's `post()` is a closure we cannot call, but it is registered
   * via Reveal.addEventListener, which attaches to the `.reveal` element — so
   * dispatching the event there runs it. `post()` ignores its event argument
   * entirely and re-reads Reveal.getCurrentSlide(), so any of its trigger
   * events works.
   *
   * `overviewhidden` is chosen deliberately: of the seven events post() binds,
   * it is the only one nothing else in this RISE install listens for. RISE
   * loads just the `notes` plugin — no notes-server, no multiplex — and
   * neither RISE's main.js nor the chalkboard binds it, so this reaches
   * post() and nothing else. (`fragmentshown`, the obvious alternative, would
   * also poke RISE and the chalkboard.)
   */
  function refreshSpeakerWindow() {
    var revealEl = document.querySelector('.reveal');
    if (!revealEl || typeof window.CustomEvent !== 'function') {
      return;
    }
    try {
      revealEl.dispatchEvent(new CustomEvent('overviewhidden', {
        bubbles: false,
        cancelable: false,
        detail: {}
      }));
    } catch (err) {
      console.warn('[presentation_enhancements_retro] speaker refresh failed', err);
    }
  }

  return {
    run: run,
    kernelReady: kernelReady,
    refreshSpeakerWindow: refreshSpeakerWindow
  };
});
