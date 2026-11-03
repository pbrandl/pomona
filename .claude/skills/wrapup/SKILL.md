---
name: wrapup
description: Save this session's state into the project's notes file (what we did, decisions, open points, NEXT) so a fresh session can continue from it.
argument-hint: "[optional extra note to record]"
disable-model-invocation: true
---

# Wrap up the session into the project notes file

1. **Find the notes file** for the folder this session started in:
   - the "Start here" file in the project map (`CLAUDE.md` im Repo)
   - otherwise a `*_PROJECT_NOTES.md` or `WORKPLAN.md` in the current folder or its parent
   - if none exists, create `<PROJECT>_PROJECT_NOTES.md` in the project folder and add it to the project map
2. **Read only its outline first** (`grep -n '^#\|NEXT'`), then the sections you change.
3. **Update it from this session's conversation:**
   - *What happened*: one dated line per work block (today's date), no step-by-step narration
   - *Decisions*: new decisions with a short reason; mark reversed ones
   - *Open*: add new open points, remove resolved ones
   - *NEXT*: replace it with the concrete next step(s), each actionable without this conversation (which file, which object/view, how to check it). Remove any stale `◀ NEXT` markers.
   - *Files*: new or moved files that a later session needs
   - add `$ARGUMENTS` if given
   - delete leftover template placeholder lines (`<...>`) in sections you filled; leave an empty section as `- none yet`
4. **Keep the file lean.** Every resume reads it. Replace outdated text instead of appending. Push details into separate docs and link them. Aim for under ~200 lines.
5. A fact that applies to every project (tool or platform behaviour, not customer-specific) goes into the matching file under `docs/`, not into the project notes.
6. Reply in at most 5 lines: the file you updated, the new NEXT step, and "safe to archive this session". Don't archive the session yourself.
