# jupyter-presentation-enhancements-retro

> **⚠️ This is a purpose-built, personal tool for one specific environment.**
>
> It adds RISE presentation enhancements to a **legacy classic Jupyter
> Notebook 6.x environment** (`notebook 6.5.x` + `RISE 5.7`, the "rise6" conda
> environment) and is maintained on a best-effort basis for that environment
> only. It will not load in JupyterLab or Notebook 7.

## What it does

A grab-bag of enhancements for presenting from classic Notebook with RISE.
Everything is reachable from a **Slides+** menu in the menu bar.

### Speaker notes in cell metadata

RISE's native speaker notes are ordinary cells tagged `slide_type: notes`. That
means the notes are ordinary *content* — open the `.ipynb` in JupyterLab,
Notebook 7, GitHub or nbviewer and your entire speaker script is on display to
anyone reading it.

This extension stores notes in cell metadata instead, under the
`presentation_notes` key, and re-materialises them as `<aside class="notes">`
only while RISE is actually running:

- **Edit them in a pane docked to the right of each cell.** Hover any cell to
  get a faint *notes* affordance; click it to open the pane. Cells that already
  have notes show their pane whenever the pane is enabled. Toggle the whole
  column from *Slides+ ▸ Show Speaker-Notes Pane*, and set its width from
  *Notes Pane Width…*. Both preferences persist in `localStorage`.
- **The presenter view is unchanged.** Press `t` in the slideshow and the notes
  are there, rendered from markdown, exactly as notes cells would have been.
- **Nothing else renders them.** No other tool knows the metadata key, so the
  notes stay out of the notebook view, out of `nbconvert --to html`, and off
  GitHub and nbviewer.
- **Notes are markdown**, rendered with the same `marked` build classic
  Notebook uses for its own markdown cells. Note that the reveal speaker window
  does not load MathJax, so LaTeX in notes will not typeset there.

**One caveat, stated plainly:** this hides notes from every *renderer*, but the
text is still in the `.ipynb` file. Anyone who opens the raw JSON can read it.
This is about not showing your script to the room, not about secrecy.

### Note types, including code that actually runs

Each note has a type, chosen from a dropdown in the pane header that mirrors
the notebook's own cell-type selector:

| Type | In the speaker window |
|---|---|
| **Markdown** (default) | rendered markdown |
| **Raw** | verbatim, unprocessed |
| **Code** | the source, followed by its output — **executed in the notebook's kernel** |

A code note runs for real. Press ▶ in the pane while authoring, or
*Slides+ ▸ Run All Code Notes* before you present. During a slideshow,
*Auto-Run Code Notes During Slideshow* (on by default) runs a slide's code
notes the first time you reach that slide, then pushes the results into the
speaker window.

Output is rendered through classic Notebook's own `OutputArea`, so text,
HTML, tables and matplotlib plots all come through — plots arrive as `data:`
URIs and survive the copy into the popup. Syntax colouring does not: the popup
gets raw `innerHTML` and none of our stylesheets, so code is plain monospace.

### LaTeX in notes

Maths in a markdown note renders properly in the speaker window. Two things
had to be handled:

- **Markdown was corrupting the LaTeX.** Run `$P(Y_1|X_i)$` through marked and
  the underscores become emphasis. Notes now go through the same
  `remove_math` / `replace_math` pipeline nbclassic uses for its own markdown
  cells, so maths is lifted out before marked and put back after.
- **The popup has no MathJax.** It receives raw `innerHTML` and loads none of
  our scripts or stylesheets, so the markup has to arrive self-contained.
  Notes are therefore typeset with MathJax's **SVG** output and
  `useFontCache: false`. That second setting is the crux: SVG output normally
  emits `<use xlink:href="#MJMATHI-78">` pointing at a glyph `<defs>` block in
  the *notebook* document, and every one of those references would dangle
  once copied into the popup — the maths would render blank. Disabling the
  cache inlines each glyph as a `<path>`.

The renderer switch is global (MathJax is a singleton), so it is put back
immediately afterwards and the notebook's own maths is unaffected. MathJax
cannot measure inside `display: none`, so each hidden aside is briefly given
layout at `left: -10000px` while it is typeset — never visible on the
audience screen. If MathJax is missing or anything throws, the note keeps its
raw `$...$`, which is at least readable.

**Three things to know before you rely on this:**

- It is the **same kernel as your slides**. A code note can mutate state your
  demo depends on. Notes run at most **once per slideshow session** — flipping
  back and forth does not re-execute — but the first run is real.
- Notes execute with `store_history: false`, so they never consume `In[N]`
  numbers or land in kernel history.
- Output is **not saved** to the notebook. It is cached in memory for the
  session only — stale saved output would be worse than none, and it would
  bloat the `.ipynb`. A code note you have not run shows *not run*.

If you would rather nothing execute while you are on stage, turn off
*Auto-Run Code Notes During Slideshow* and use *Run All Code Notes* beforehand.

#### Migrating an existing deck

*Slides+ ▸ Import: Notes Cells → Metadata…* moves each markdown notes cell into
the metadata of the cell it follows and deletes the now-empty cell. It shows
you the counts and asks first, and nothing touches disk until you save.

Code cells tagged `slide_type: notes` are left alone — their content is usually
a rendered output (a plot, a DAG) that a markdown string cannot hold. They keep
working as normal RISE notes cells alongside the metadata ones.

*Slides+ ▸ Export: Metadata → Notes Cells…* is the reverse, for when you need
`nbconvert --to slides` (which knows nothing about the metadata key) to see the
notes again.

#### A RISE bug this fixes on the way past

Reveal 3.9.2's notes plugin reads the *first* `aside.notes` in the current
slide — `querySelector`, singular — while RISE wraps *each* notes cell in its
own `<aside>`. So on any slide carrying more than one notes cell, only the
first one has ever reached the presenter window; the rest are silently
discarded.

This extension emits **one merged aside per slide**, prepended so it is
unambiguously the one the plugin finds, with legacy notes cells cloned into it
in document order. Mixed notebooks keep working and get their missing notes
back.

## Install

Straight from git — no PyPI release, on purpose:

```bash
conda activate rise6
pip install git+https://github.com/robertpettis/jupyter-presentation-enhancements-retro.git
```

Then restart `jupyter notebook`. The nbextension registers and enables itself
at install time (via `share/jupyter/nbextensions` + `etc/jupyter/nbconfig`);
there is no separate `jupyter nbextension install/enable` step.

To uninstall:

```bash
pip uninstall jupyter-presentation-enhancements-retro
```

## Requirements

- `notebook >= 6, < 7` (classic Notebook)
- RISE 5.7.x for the slideshow half; the notes pane works without it
- A reasonably modern browser (Chrome/Edge current versions)

### Hiding editing chrome during a slideshow

*Slides+ ▸ **Hide Cell Titles During Slideshow*** (on by default) suppresses
`jupyter-cell-enhancements-retro`'s per-cell title bars once RISE takes over,
and brings them straight back when you leave the slideshow.

The mechanism is pure CSS. RISE *moves* the live `.cell` elements into
`.reveal .slides` and hands them back on exit, so a rule scoped under
`.reveal` applies for exactly the duration of the slideshow and reverts on its
own — there is no enter/leave hook to misfire and no saved state to restore.
Cell titles are also stripped from legacy notes cells cloned into the speaker
window, where CSS cannot reach because the popup only receives raw `innerHTML`.

Adding another target is one entry in `TARGETS` in `slidechrome.js` plus the
matching rule in `main.css`; the Slides+ checkbox is generated from it.

### Getting rid of the selected-cell box

Classic Notebook always keeps exactly one cell selected — there is no "select
nothing" state — and paints it with a grey border and a blue bar down its left
edge. On a slide that box just sits there, in front of the room, with nothing
you can click to make it go away.

Two things fix that:

- ***Slides+ ▸ Hide Selected-Cell Outline During Slideshow*** (on by default)
  suppresses the outline for the duration of the slideshow, the same
  self-reverting `.reveal`-scoped CSS the cell-title toggle uses. Turn it off
  if you run cells live and want to see which one you are about to run.
- **Clicking anywhere off a cell hides the outline**, in the notebook and on a
  slide alike — click the slide background, the margin, the space below the
  last cell. It comes back the moment you click into a cell, and (outside a
  slideshow) on any key press or programmatic selection change, so you are
  never left navigating blind. Inside a slideshow, keys are slide navigation
  rather than cell navigation, so they deliberately leave it hidden.

Neither one touches the notebook's own selection. Nothing calls
`Cell.unselect`, no `selected` flag is flipped, and no class the notebook
manages is removed — `Notebook.get_selected_index` reads those flags and every
command-mode action assumes it finds a cell, so faking a real deselection
would break Shift-Enter and half the keyboard. This is purely a matter of not
*painting* the selection, and it lives in `selection.js`.

## Development note: never name a file `notes.js`

The notes module lives in `speaker.js`, and must not be renamed to anything
containing — or ending in — `notes.js`.

Reveal's own notes plugin finds the HTML for its popup window by sniffing the
document for a script tag:

```js
document.querySelector('script[src*="notes.js"]').src
    .replace(/notes\.js(\?.*)?$/, '') + 'notes.html'
```

`querySelector` returns the *first* match in document order. RequireJS loads
this nbextension at page load, long before RISE loads reveal's plugins, so a
file named `notes.js` here wins that lookup — reveal then resolves
`notes.html` against *our* directory and the speaker window 404s with
`/nbextensions/presentation_enhancements_retro/notes.html`. (RISE also ships a
`notes.js.patched` variant using `src$=`, ends-with, which a name merely
*ending* in `notes.js` would still match.)

## Interoperability

- **`jupyter-cell-enhancements-retro`** — composes cleanly. The notes pane is
  positioned in a reserved gutter outside the cell box rather than as a column
  inside `.cell`, specifically so it does not fight that extension's
  side-by-side flex layout.
- **`jupyter-print-slides-retro`** — its "include speaker notes" toggle finds
  notes *cells*, so it will not see metadata notes until it is taught the new
  key. Use *Export: Metadata → Notes Cells…* before printing, or update that
  extension.
- **`nbconvert --to slides`** — same story; export first.

## License

BSD-3-Clause.
