# AGENTS.md

## Mandatory Read Order (Every Task)

1. Read `GAMEPLAY_GUARDRAILS.md` before planning or editing.
2. Treat that file as the source of truth for gameplay behavior.
3. If a requested change conflicts with guardrails, stop and ask the user before proceeding.

## Non-Negotiable Rule

Do not remove, bypass, or silently alter core gameplay loops without explicit user approval in this thread.

## Required Workflow

1. Identify whether changes touch protected systems listed in `GAMEPLAY_GUARDRAILS.md`.
2. Preserve existing gameplay behavior unless the user explicitly requests behavior changes.
3. If behavior changes are requested, list exactly which gameplay invariants will change before editing.
4. After edits, run or update tests that cover affected gameplay invariants.
5. **Do not use the browser tool to verify changes.** The user has the game open and will verify for you.
