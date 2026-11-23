/**
 * Draft text for each team's chat composer, keyed by the team's scope key.
 *
 * EditorArea remounts a workspace on tab switch; a component-local useState would lose the
 * draft. This module-level store mirrors activeTeamView.ts — no React, no Dexie.
 *
 * ponytail: session-only is enough for "switch tab and come back". If drafts must survive an
 * app restart, persist under db.settings key `team_draft:<teamId>` instead.
 */
const drafts = new Map<string, string>();

function keyOf(teamId: string): string {
  return `team:${teamId}`;
}

export function getTeamChatDraft(teamId: string): string {
  return drafts.get(keyOf(teamId)) ?? '';
}

export function setTeamChatDraft(teamId: string, text: string): void {
  const key = keyOf(teamId);
  if (text === '') {
    drafts.delete(key);
  } else {
    drafts.set(key, text);
  }
}

export function clearTeamChatDraft(teamId: string): void {
  drafts.delete(keyOf(teamId));
}
