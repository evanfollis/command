---
source: runtime/.handoff/command-phase-d-cowork-panels-2026-04-23T18-35Z.md
authored: 2026-04-23T18:35Z
authorized_by: principal 2026-04-23T~18:30Z
status: parked
preserved: 2026-04-25T~02:00Z (migrated from handoff to project docs)
---

# Phase D — Cowork-style workspace UX

## Parking rules

**Do not start Phase D until:**

1. Phase C1–C3 are shipped, reviewed, and deployed to command.synaplex.ai.
2. The principal has used Phase C for at least 3 days of real executive work.
3. You have at least 20 friction events (or explicit principal pain reports) against Phase C's shape to inform what actually needs Phase D.

**Reason:** the principal's Cowork vision is directionally right (doc-centric workspace + context panels + scratchpad) but the exact shape will be wrong without real Phase C usage informing it. Building Phase D in parallel with or ahead of Phase C risks shipping panels that don't match how attaches actually get used. Wait for real pain, then design the panels.

This document captures the design *as articulated 2026-04-23* so it isn't lost. It is not an implementation directive until the parking conditions above are met.

## Design target (as articulated 2026-04-23)

The Cowork pattern that fits synaplex methodology work:

- **Left nav** — session/surface selection
  - Durable attaches (`general`, `general-codex`, project sessions as operator-attested)
  - Scratch (ephemeral threads — labeled as "Scratch" per Phase C design; same thing, durability-honest label)
  - Docs (navigator, not auto-inject — opens in center pane for editing)
  - Artifacts (existing inbox; live)
- **Center pane** — context-aware
  - *Conversation mode* (default on attach or thread click): streaming chat with the attached session; per-attach agent picker visible; "share this conversation with [general-codex ▼]" affordance for adversarial review
  - *Doc mode* (click a doc in left nav): rendered markdown via the existing `/artifacts/<source>/<path>` pipeline + **Edit** button → splits center into editor pane + pinned mini-chat at the bottom referencing the current doc path; save via POST back to the same allowlisted source
  - Mode switcher at top; state preserved when flipping
- **Right pane** — metadata about the current attach / selected doc
  - **Loaded context** — parsed from the session's CLAUDE.md always-load declaration + any live M4 injections; lists each file with status (fresh | stale | missing); click to view what the agent is seeing; toggle "hide from agent" for cases where the principal wants to reduce context weight. **Transparency into the agent's prompt, not re-injection of files the agent already has.**
  - **Tasks** — current session's TaskCreate list (when the session exposes it; initially a read-only pane, later editable)
  - **Friction feed** — last 10 events from `runtime/friction/events.jsonl` (ADR-0029 Layer 5) filtered to the current session's layer/source
  - **Handoff inbox** — count of pending handoffs addressed to the current attach name
  - **Git status** — current cwd's repo state (branch, ahead/behind origin, dirty file count); click for the diff
  - **Active adversarial reviews** — any in-flight `adversarial-review.sh` runs + artifacts

## Non-goals

- **Re-injecting docs that M4 always-load already provides.** If a file is in the attached session's context-always-load block, it is already in the prompt. Surfacing it in a left nav for navigation is fine; pushing its contents into the prompt from UI action is duplication and burns tokens.
- **Single-doc working-surface model.** Cowork assumes one shared doc; methodology work often has no single doc (triage mode). Doc mode is one of two center-pane modes, not the default.
- **File-picker-to-attach-per-turn.** Cowork's "drag files to attach" model doesn't fit agents that auto-load workspace context. Use the right-pane loaded-context viewer instead.
- **Editing docs that live in Tier-C (project repo) scope from command directly.** Command is the executive/operator surface; project code edits remain project-session work. Doc mode edits are scoped to workspace-level docs (ADRs, handoffs, research notes, syntheses) and project CURRENT_STATE.md read-only preview only.
- **Multi-user / team UI chrome.** Solo-dev.

## Additional affordances worth shipping (not in Cowork but fit us)

- **Agent-switch for an in-flight conversation.** "This Claude conversation is getting defensive — let me paste the last 20 turns into `general-codex` and ask for adversarial criticism." UI: in an active conversation header, a `[Share with ▼]` menu lists other available attaches; clicking sends the turn history + a priming prompt to the target attach, which opens in a new tab with the primed state.
- **Loaded-context inspector** as live feature: parse the session-start hook's output, show the current prompt size in tokens, and flag when loaded context exceeds a configurable budget (e.g. 30% of context window). First-class visibility into context consumption.
- **Per-session model / reasoning pill** in conversation header: `Opus 4.7 · thinking=high · cache=auto` — clickable to change (Phase C3 already scopes the settings UI; D surfaces it as a live pill).
- **Handoff "claim" button** on the right-pane handoff inbox: single-click marks a handoff as "being worked on" (writes to `runtime/.handoff/.claimed` or similar), prevents double-dispatch.

## Acceptance criteria (when Phase D eventually runs)

- Principal can open command.synaplex.ai, land on an attach, and see:
  - Center: live streaming conversation with the supervised tmux
  - Right: what the agent has loaded + tasks + friction + handoffs + git
  - Left: nav to other attaches, scratch threads, docs, artifacts
- Principal can click a doc from left nav → center switches to doc mode → edit the doc with an inline chat ref'd to its path → save.
- Principal can share an in-flight conversation with `general-codex` for adversarial review in one click.
- No regression in C1/C2/C3 functionality.
- Context panel is transparent about what's in the prompt; doesn't duplicate M4 always-load behavior.
- Adversarial review on the diff before deploy.

## Escalation conditions (during Phase C usage that precedes Phase D)

- Cowork-shape panels turn out to be wrong-shaped for actual methodology work. Drop this design and re-scope. Example: the principal discovers triage mode dominates over doc mode; the right-pane-first design is wrong and a left-pane-first design (projects as primary surface) is right.
- Phase C's streaming attach reveals fundamental concurrency issues that necessitate revisiting Phase B (1a/1b/1c). If ephemeral threads need to be eliminated rather than kept, Phase D's "Scratch" nav column goes away.
- Token consumption from always-load + conversation + context panels exceeds Anthropic rate limits or becomes cost-significant. Re-scope toward aggressive context unload.

## References

- Phase C dispatch (historical): `runtime/.handoff/command-phase-c-send-path-rewrite-2026-04-23T18-20Z.md`
- Context-usage-ui handoff: `runtime/.handoff/command-context-usage-ui-2026-04-23T20-40Z.md`
- UX bar memory: `/root/.claude/projects/-opt-workspace/memory/feedback_command_ux_bar.md`
- ADR-0029 Layer 5 (friction feed): `supervisor/decisions/0029-synaplex-loop-five-layer-pipeline.md`
- M4 session-start context load: ADR-0021 + `/root/.claude/hooks/session-start-context-load.sh`

## Expected first action when parking conditions are met

Read this document. Read the last 30 days of friction events for the attach UI. Read the principal's last week of interactions on command.synaplex.ai. Draft a refined Phase D scope that honors the design here **only where it still matches observed reality** — the right response to "the design was wrong in practice" is a revised design, not forcing the original through.
