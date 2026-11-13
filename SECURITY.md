# Security policy

## Reporting a vulnerability

Please report security problems privately: open the **Security** tab of this repository and choose
**Report a vulnerability** (GitHub private vulnerability reporting). Please do not open a public issue
for a security problem. You will get an answer in the same thread.

## Supported versions

Only the latest release is supported. Fixes land in a new release; older versions are not patched.

## What this plugin accesses

- **Model requests:** every few steps the side check sends the whole conversation to your own Claude session's model as one extra request (the `$.model.fork` call of the mod API). Nothing goes to any other service, and the check's prompt tells the model never to copy secrets or personal data into a note.
- **Files and network:** the mod reads no files and opens no connections of its own.
- **What it stores:** notes, answers, the check log and settings, in the mod store that Claude Code provides, kept per folder. `/side-notes off` stops the checks.
- **Note text:** text written by the side check is treated as untrusted when it is sent back to the main agent.
