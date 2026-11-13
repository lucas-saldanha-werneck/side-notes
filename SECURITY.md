# Security policy

## Reporting a vulnerability

Please report security problems privately: open the **Security** tab of this repository and choose
**Report a vulnerability** (GitHub private vulnerability reporting). Please do not open a public issue
for a security problem. You will get an answer in the same thread.

## Supported versions

Only the latest release is supported. Fixes land in a new release; older versions are not patched.

## What this plugin accesses

- **Model requests:** every few main-agent steps (default 6; by default only in the desktop app or a session driven from Remote Control) the side check sends the whole conversation to your own Claude session's model as one extra request (the `$.model.fork` call of the mod API). Nothing goes to any other service, and the check's prompt tells the model never to copy secrets or personal data into a note.
- **What it adds to the main session:** on the phone it adds the note to your next prompt or to the next tool result of a running turn, and "Chat about it" submits a prompt on your behalf. It reads your prompt text only to spot a reply of a number or "undo". "Copy" writes the note to the clipboard.
- **Files and network:** the mod reads no files and opens no connections of its own.
- **What it stores:** in the mod store that Claude Code provides: the last 40 notes (with session id and folder path), the topics shown or known, a check log and settings, shared across folders, plus a few per-folder keys (a pending chat, a waiting note, the last answer). `/side-notes debug on` also stores the first 40 characters of each prompt. `/side-notes off` stops the checks.
- **Note text:** the note and its explanation are sent back to the main agent fenced and marked as untrusted; the one-line note shown on the phone is copied in as is.
