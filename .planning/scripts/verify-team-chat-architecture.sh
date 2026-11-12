#!/usr/bin/env bash
# 37.1 architecture gate — every entry in ARCHITECTURE-TEAM-CHAT.md §5 that must be gone.
# Run from the repo root: bash .planning/scripts/verify-team-chat-architecture.sh
set -uo pipefail

fail=0
check_gone() {
  local n
  n=$(grep -rn "$1" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v '\[removed 37.1\]' | wc -l | tr -d ' ')
  if [ "$n" != "0" ]; then
    echo "FAIL: $1 still has $n hit(s)"
    grep -rn "$1" src/ --include='*.ts' --include='*.tsx' | grep -v '\[removed 37.1\]' | sed 's/^/    /'
    fail=1
  else
    echo "ok: $1"
  fi
}

check_gone 'LIVE_PHASES'
check_gone 'BUSY_PHASES'
check_gone 'runLeadTurnSerialized'
check_gone 'pendingSteerMessageIds'
check_gone 'injectedSteerIdsByAttempt'
check_gone 'batchOwnsTeamTurn'
check_gone 'deliver_steer'
check_gone 'deliverSteer'
check_gone 'runLeadSteerTurn'
check_gone 'leadSteerTools'
check_gone 'loadPendingSteers'
check_gone 'drainLeaderSteerQueue'
check_gone 'drainSteerInbox'
check_gone 'steerStates'
check_gone 'setPhase'

# Deliberate keepers (see §5 "Ngoại lệ có chủ đích") — these MUST still exist.
check_present() {
  local n
  n=$(grep -rn "$1" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "0" ]; then
    echo "FAIL: $1 is missing but must stay"
    fail=1
  else
    echo "ok (kept): $1"
  fi
}
check_present 'AGENT_MENTION'
check_present 'derivePhase'

exit $fail
