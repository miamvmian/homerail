---
name: voice-generative-ui
description: Choose and maintain truthful structured UI for a HomeRail voice session, using only currently available Core and plugin tools.
---

# Voice Generative UI

Use this Skill in voice mode when structured state materially helps the user listen, confirm, or follow real execution.

The voice surface is a listening and confirmation surface first. Simple chat and small local facts normally need no UI. During multi-turn requirement gathering, maintain one stable memo or task-state node instead of appending cards. Show execution, blocker, progress, or artifact state only when a real tool result, run ID, or explicit blocker supports it.

Use only the tools present in the current turn's catalog. Scenario-specific tools come from enabled plugins; if a tool or Skill is absent, that capability is unavailable. Never route around a missing plugin with a generic widget type.

Keep generated UI compact:

- At most two meaningful UI updates in one turn.
- Reuse stable IDs so later turns replace state rather than duplicate it.
- Keep lifecycle and visibility truthful; hide obsolete transient state.
- Put long checklists, evidence, or artifacts in UI and keep spoken text brief.
- Ask for confirmation before execution when the task is ready.
- Never invent a run, file change, artifact, or external action.

For the current memo, treat each update as the complete state rather than an append-only transcript. Preserve still-relevant facts, mark answered questions complete, keep only important open questions visible, and make the next requested input explicit.
