/**
 * 37.1 R13: which team workspace is on screen right now.
 *
 * A module-level value, not React state: the notification hook lives in the app shell and the
 * workspace lives deep in a tab, so a context would have to be threaded through every layer
 * for one string. The workspace registers itself on mount and clears on unmount.
 */
let activeTeamId: string | null = null;

export function setActiveTeamView(teamId: string | null): void {
  activeTeamId = teamId;
}

export function getActiveTeamView(): string | null {
  return activeTeamId;
}
