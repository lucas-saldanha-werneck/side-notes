# Changelog

All notable changes to this plugin. Versions follow `.claude-plugin/plugin.json`.

## 0.1.7 (2026-11-13)

- Phone: a note counts as told only if the answer shows it; one retry with a summary.

## 0.1.6 (2026-11-13)

- Add a README Examples section.

## 0.1.5 (2026-11-12)

- Phone: put the note line in the final message of the turn, not before tool calls.

## 0.1.4 (2026-11-12)

- Phone: a bare number after Claude's own numbered reply answers Claude, not the note; closing a note at the desk cancels its phone delivery.
- Note text is fenced as side-check text and capped.
- One store key per folder; phone state resets at session start and at `/clear`.

## 0.1.3 (2026-11-11)

- Phone: Copy also closes the note.

## 0.1.2 (2026-11-11)

- Side check: no notes from stale state or unexplained timeouts.

## 0.1.1 (2026-11-11)

- Phone: the note and its choices show as a block quote; `/side-notes <number>` and the explanation end with numbered choices, and a number answers them.
- Phone: dots show how many more messages a number still answers the note; 3 dismisses only this note; phone labels translated.
- Phone: steps counted across turns, the band closes on a phone answer, and a restored note is told on the next phone prompt instead of blocking checks.

## 0.1.0 (2026-11-09)

- First release: a side check every N steps, a note above the prompt, phone relay and undo.
