---
status: testing
phase: 32-external-research-via-claude-code-headless
source: [32-VERIFICATION.md]
started: 2026-11-08T07:25:00Z
updated: 2026-11-08T07:25:00Z
---

## Current Test

number: 1
name: Live remote research run on a Tauri build
expected: |
  Lines stream into the card; cancel stops the card; `ps` on the remote shows no
  surviving `claude`; a full run persists a RESEARCH artifact whose detail modal
  lists findings tagged [EXTERNAL:WEB] / [EXTERNAL:REPO:<code>] with sources, and
  the next Solution turn's composed system prompt contains
  <external_research_evidence rank="subordinate_to_internal">
awaiting: user response

## Tests

### 1. Live remote research run on a Tauri build
expected: Lines stream into the card; cancel stops the card; `ps` on the remote shows no surviving `claude`; a full run persists a RESEARCH artifact whose detail modal lists findings tagged [EXTERNAL:WEB] / [EXTERNAL:REPO:<code>] with sources, and the next Solution turn's composed system prompt contains <external_research_evidence rank="subordinate_to_internal">
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
