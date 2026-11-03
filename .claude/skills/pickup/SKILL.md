---
name: pickup
description: Start a fresh session from the project's notes file and continue at its NEXT step, without re-exploring the project.
argument-hint: "[optional project name, or what to focus on]"
disable-model-invocation: true
---

# Pick up the project from its notes file

1. **Find the notes file** for the folder this session started in (or for the project named in `$ARGUMENTS`):
   - the "Start here" file in the project map (`CLAUDE.md` im Repo)
   - otherwise a `*_PROJECT_NOTES.md` or `WORKPLAN.md` in the current folder or its parent
   - if none exists, say so and stop; suggest running `/wrapup` in the old session
2. **Read it.** If it's over ~300 lines, read the outline (`grep -n '^#\|NEXT'`) and then only the NEXT, Open and Decisions sections.
3. **Don't re-explore.** Open other files only when the NEXT step needs them, and then use targeted reads (grep, offset/limit). Open `_SHARED/` docs only when their topic comes up.
4. **Reply in at most 5 lines:** where things stand, and the NEXT step you're starting. If `$ARGUMENTS` names a different focus, use that instead.
5. **Start on the NEXT step.** Ask first only if it needs a decision or input from the user. Anything that writes to a customer system, sends messages or deletes still needs the user's OK, as usual.
