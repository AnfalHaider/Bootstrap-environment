---
description: Upgrade this project's bootstrap kit to the installed plugin's version, with the owner's yes
---

Upgrade the kit in the project in the current folder. This session should be the Chief of Staff.

1. Refresh the kit's own files from the installed plugin (it keeps the project's policy, flow, edited role briefs and records):
   `node "${CLAUDE_PLUGIN_ROOT}/bin/bootstrap.mjs" upgrade`
   If it says the project is not bootstrapped, offer the bootstrap-environment skill instead. If it says nothing changed, stop there.
2. Tell the owner, in plain words, what the upgrade changes: the version line it printed, plus the matching entries in `${CLAUDE_PLUGIN_ROOT}/CHANGELOG.md`. Ask: "Apply the kit upgrade?"
3. On their yes:
   `node .bootstrap/bin/bootstrap.mjs kit apply --words "<their exact words>" --question "<the question you asked>"`
   then commit the kit files with the new `docs/kit-changes/` record, on its own (no project code in the same commit), and push. The push check accepts a kit-only change whose every file matches this record.
4. Tell the other sessions to restart their brief: `bootstrap brief <role>` now reflects the new kit.
