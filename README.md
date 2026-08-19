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
