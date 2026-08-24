# Graveyard

Cut work that might come back. Nothing in here is served, imported, or built.
Netlify publishes `app/`, so a file here cannot reach a user by accident.

Git history already holds every deletion. This directory exists because a
deletion is only findable in history if you remember it happened and can name
the commit. A file here is findable by reading the folder.

## What belongs here

A block of markup, CSS, copy, or a whole page that was removed for taste or
timing rather than because it was wrong, and that the founder might ask for
back. Not dead code, not bugs, not superseded infrastructure. Those get
deleted properly.

## The shape of an entry

One file per removed thing, named `YYYY-MM-DD-<slug>.md`, holding:

1. **What it was** and where it lived (file plus the section it sat in).
2. **Why it came out**, in the founder's own words where there are any.
3. **The exact markup and CSS**, verbatim, so restoring is paste rather than
   reconstruct.
4. **How to put it back**: the anchor to paste against, plus anything the
   surrounding layout has since changed that would need undoing.

Restoring is a decision, not a revert. Read the entry's restore notes before
pasting: the page usually moved on after the cut, and the old block often needs
the newer layout adjusted around it.

## Index

- [2026-08-24 — landing format chooser](2026-08-24-landing-format-chooser.md) —
  the "Choose a format of debate" label, explainer and 10 format chips above
  the walkthrough video on `/landing`.
