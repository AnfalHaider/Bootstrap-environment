---
description: Open this project's flow editor (team, extra checks, kinds of work, helpers), then apply the owner's change
---

Open the flow editor for the project in the current folder, and see the change through.

1. Start the editor in the background (it keeps running until stopped):
   `node .bootstrap/bin/bootstrap.mjs flow --port 4317`
   If `.bootstrap/bin` does not exist, the project is not bootstrapped yet: say so and offer to run the bootstrap-environment skill instead.
2. Read the link it prints (`http://127.0.0.1:4317/?t=…`). Open it for the owner: in the app's built-in browser pane when there is one, otherwise run it again with `--open` so it opens in their browser. Tell them: change what they want, then press **Save**.
3. When they say they saved (or the editor shows "Saved"), read `git diff .bootstrap/flow.json` and tell them the change in plain words, one line each (for example "Design becomes optional", "`src/billing/**` now needs Security"). Ask: "Apply this change?"
4. On their yes, as the Chief of Staff:
   `node .bootstrap/bin/bootstrap.mjs flow apply --words "<their exact words>" --question "<the question you asked>"`
   then commit `.bootstrap/flow.json`, `docs/flow.md` and the new `docs/flow-changes/` record together and push. The push check accepts a flow-only change that carries this record.
5. Stop the editor.

If this session is not the Chief of Staff, do steps 1–3 and then hand the change to the Chief of Staff; only it records the owner's yes.
