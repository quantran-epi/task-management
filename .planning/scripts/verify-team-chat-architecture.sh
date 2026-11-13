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

# Phase 38 D-01/D-02: the budget is warning-only. No gate, no park, no pause may return.
# G-1: the deletion was verified by audit grep only; this is its permanent regression guard.
echo "--- phase 38 budget gate removal"
check_gone 'createBudgetGate'
check_gone 'shouldNotifyPause'
check_gone 'bucketOf'
check_gone 'normalizeUsageTotal'
check_gone 'parkForBudget'

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

# R3: no dead module. Every file in the office service must have a production caller.
# This gate exists because `teamConsumer.ts` shipped with 10 passing tests and zero callers —
# unit tests call the module directly, so they cannot prove the app uses it.
echo "--- dead module check"
for f in src/services/ai/office/*.ts; do
  base=$(basename "$f" .ts)
  case "$base" in
    teamRunCoordinator|teamEventLog|teamPrompts|teamTools|teamRunManager|teamRunRegistry|scheduler|budgetGate|liveUseRegistry|deleteRefusalMessage|teamTranscriptRepo) ;;
  esac
  # Count import sites outside the file itself.
  n=$(grep -rn "from '.*$base'" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v "$f" | wc -l | tr -d ' ')
  if [ "$n" = "0" ]; then
    echo "FAIL: $f has no production importer"
    fail=1
  fi
done

exit $fail
