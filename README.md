# side-notes

A Claude Code mod. Every few steps, a side check reads the conversation and looks for one thing
you probably missed and that matters: a decision Claude made without saying so, a hidden
tradeoff, a result that may be wrong, or a concept you keep running into. Most of the time it
finds nothing and you see nothing. When it does find something, a short note shows above the
prompt. The main agent is never interrupted.

It is built for the desktop app and for the phone through Remote Control. It works where the
built-in note feature does not, e.g. the desktop app.

## Example

A sketch of the band above the prompt (not a screenshot):

```
✦ Worth checking · The new build is only on this Mac, so a teammate will not see it yet
[ Learn more ] [ Knew it ] [ Chat about it ] [ Copy ] [ Dismiss ]
```

Learn more opens a short explanation in plain words.

The band does not show on the phone. When you drive the session from the Claude app through
Remote Control, Claude tells you the note itself, at the top of its reply:

> ✦ Worth checking · The new build is only on this Mac, so a teammate will not see it yet
> _1 learn more · 2 knew it · 3 dismiss_

The note is a block quote, so it stands apart from the rest of the reply.

Reply with just the number. Reply `undo` (or `desfazer`) to take the answer back. Claude writes
these labels in the language you write in, like the note: in Portuguese, for example,
`✦ Vale conferir · ...` and `1 saber mais · 2 já sabia · 3 dispensar`.

After `1`, the explanation ends with the same four choices the band shows under an explanation:

> _1 chat about it · 2 copy · 3 got it · 4 dismiss_

Reply with just the number again. On the phone, Copy makes Claude send the note in a code block,
because the mod cannot reach the phone's clipboard.
`/side-notes <number>` sent from the phone ends with the same line, and a reply of just the number
answers that note.

Notes are written in the language you write in.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin marketplace add lucas-saldanha-werneck/side-notes
/plugin install side-notes@side-notes
```

From a shell, the same commands work with `claude plugin` in place of `/plugin`.

`/plugin` does not run in the desktop app. Install from a terminal with the user scope, and the mod
also loads in the desktop app's local Code sessions.

## Use

- Every 6 steps of the main agent (one step is one model request), counted across turns, a side
  request is sent with the conversation so far and no tools. A phone question is often a turn of
  one or two steps, so the count goes on from one turn to the next. It answers either "nothing" or one note.
- No new check runs while a note found in this session is on screen. A note that came back from
  an earlier session does not hold back new checks: a new note takes its place and the older one
  waits behind it.
- On the phone, any note in the band that Claude has not told yet (one that came back after a
  `/clear`, or one found while you typed at the desk) goes with your next phone prompt.
- The band buttons: **Learn more** (1) shows the explanation, **Knew it** (2) marks the topic as
  known, **Chat about it** (3) sends the note into the main session so you can talk about it,
  **Copy** (4) copies the note, **Dismiss** (0) closes it. After Learn more, **Got it** (1) marks
  it as known.
- **Undo** (5): an answer can be taken back for 5 minutes. The band shows a small row with an
  Undo button after you answer, until your next prompt. `/side-notes undo` works for the whole
  window, also after a reload or `/clear`. On the phone, reply `undo` (or `desfazer`). Undo puts
  the note back as it was, and removes the topic from the "known" list if Knew it added it. A chat that already reached the main session, or an
  explanation Claude already gave on the phone, cannot be taken back: undo says so. A chat still
  waiting for the running task to reach its next step is stopped.
- A Chat about it pressed while Claude is working enters the running task at its next tool result,
  so it does not wait for the whole task to end.
- A note you do not answer goes away after 2 of your prompts.
- **On the phone.** The mod counts a session as driven from the phone when your last prompt came
  through Remote Control. This works in a desktop app session and in a terminal session with
  Remote Control on. The checks run there even in a terminal. A note found while Claude is still
  working is added to the running turn with its next tool result, so Claude puts it at the top of
  the reply that ends that turn. A note found after the last tool call comes with your next phone
  prompt instead. A reply of only `1`, `2` or `3` answers the note for the next 5 prompts: Claude
  gets it as an answer to the note, not as a new request. `3` dismisses this note only, like the band's Dismiss: later notes keep coming
  (`/side-notes off` stops them all). Any other reply lets
  the note go. A terminal session you type into at the keyboard runs no checks, even with a
  phone attached, unless `run_in_terminal` is on.
- Topics already shown, and topics you said you knew, are remembered and not shown again.
- Everything is saved in the plugin store: the list of notes, the remembered topics, a "Chat
  about it" that a `/clear` cut off (the next session in the same folder gets it), a note waiting
  for your next phone prompt, and the last answer for undo. A note nobody answered comes back in
  the band of the session that follows a `/clear` (for 1 hour).
- `/side-notes` lists the last notes. `/side-notes <number>` opens one again in the band.
  `/side-notes log` shows the last checks and their outcome. `/side-notes off` and `on` stop and
  start the checks. `/side-notes every <n>` sets how often it checks. `/side-notes debug on` keeps
  each prompt and delivery event (origin, first 40 characters) in the store, and `/side-notes debug`
  shows them. Turn it off with `/side-notes debug off`.

## Settings

In `/config` (each one is a row there):

| Setting | Default | What it does |
| --- | --- | --- |
| Check every N steps (`check_every`) | 6 | Steps between two side checks. `/side-notes every <n>` (2 to 100) wins over it; `/side-notes every default` goes back to it. |
| Also run in the terminal (`run_in_terminal`) | off | Run the checks and show the band in terminal sessions too. |
| Undo window (`undo_minutes`) | 5 | Minutes an answer can be taken back. 0 turns undo off. |

## How it works

One hooks module (`hooks/register.tsx`). A `turn.step` hook counts the main agent's steps. On
every Nth step it calls `$.model.fork` in the background with the prompt in `hooks/prompt.ts` and
the lists of topics already shown and known. The side request answers with one JSON object,
either `{"note": null}` or:

```json
{"topic": "unpushed local build", "note": "One sentence.", "kind": "check", "detail": "A short markdown explanation."}
```

`hooks/parse.ts` reads it. A `ui.render` hook on the band above the prompt draws the note. A
`prompt.submit` hook tells which prompts come from the phone (origin `bridge`), adds the note to
the next phone prompt's context and reads the number and `undo` replies. The `tool.call`
hook adds a chat pressed during a running task, or a note found during a phone-driven turn, to the
next tool result, and `turn.complete` sends a chat that found no tool call as a prompt. The plugin store holds the
data listed under Use.

The prompt asks for a note only when it is grounded in the conversation, likely missed and
useful, and asks the side request to never copy secrets or personal data into a note.

## Uninstall

```
/plugin uninstall side-notes@side-notes
```

## Limits

- Built and tested on Claude Code 2.1.321. It needs a version with mods (hooks modules).
- Each check is one extra model request with the whole conversation, so it costs tokens. Raise
  `check_every` to check less often.
- By default it runs only where the session draws on the desktop app and not on a terminal.
- The phone flow depends on the main agent following the added context. It may phrase the lines
  its own way. In the first live test it kept the labels in English; the context now asks it to translate each label by name, which has not been tried live yet.
- What Claude Code 2.1.321 sends for a Remote Control prompt, captured live from a terminal
  session with `/rc` and a prompt sent from claude.ai/code: `prompt.submit` with
  `origin: {kind: "bridge"}` (and `session.receive` with the same origin), while
  `$.session.surfaces()` stays `["terminal"]`. A phone or web client adds no surface, so the mod
  goes by the prompt's origin only.
- Tried live from claude.ai/code in a browser (the same Remote Control path the phone app uses):
  a note told at the top of the reply, both when it waited for the next prompt and when it joined
  the running turn; `2` and `desfazer` handled. Not tried from the phone app itself.
- The phone's `undo` is read as undo only when an answer is waiting to be undone. Otherwise it
  goes to Claude as a normal message.
- The tests use the test kit's stand-ins for the engine. It has not been tried by hand yet in the
  desktop app or on the phone.

## Tests

```
claude plugin validate .
claude plugin test .
```

The same two commands run in GitHub Actions on Linux, macOS and Windows.

## License

MIT. See `LICENSE`.

Built with Claude Code
