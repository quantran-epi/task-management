#!/usr/bin/env bash
# Workbench gate runner: change-scoped by default, --full only on demand.
set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT" || exit 2

CONFIG="workbench/playwright.workbench.config.ts"
EVIDENCE="workbench/evidence/latest.json"
GATES_TMP="$SCRIPT_DIR/evidence/.gates.$$.tsv"
SCOPE_FILE="$SCRIPT_DIR/evidence/.scope.$$.json"
trap 'rm -f "$GATES_TMP" "$SCOPE_FILE"' EXIT

MODE="scoped"
SCOPE_ARG=()
if [[ "${1:-}" == "--scope" && $# -ge 2 ]]; then
  MODE="scoped"
  SCOPE_ARG=("$1" "$2")
fi
for arg in "$@"; do
  [[ "$arg" == "--full" ]] && MODE="full"
done

if ! command -v node >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  echo "BLOCKED: node/npx không có sẵn" >&2
  exit 2
fi

record_gate() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$GATES_TMP"
}

run_gate() {
  local name="$1" cmd
  shift
  cmd="$*"
  echo "[GATE] $name :: $cmd"
  "$@"
  local code=$?
  record_gate "$name" "$cmd" "$code"
  echo "[GATE] $name exit=$code"
  return "$code"
}

visible_scope() {
  node -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    console.log(`scope=${s.scope} rules=${(s.rules || []).join(",") || "none"}`);
    console.log(`changed=${(s.changed || []).join(",") || "(none)"}`);
    console.log(`unit=${(s.unitFiles || s.unit || []).join(",") || "(none)"}`);
    console.log(`e2e=${(s.e2e || []).join(",") || "(none)"}`);
  ' "$SCOPE_FILE"
}

# Drop paths that do not exist yet; record the skip so evidence stays honest.
existing_specs() {
  local out=()
  local spec
  for spec in "$@"; do
    local file="$spec"
    [[ "$file" == e2e/* ]] && file="workbench/$file"
    if [[ -f "$REPO_ROOT/$file" ]]; then
      out+=("$spec")
    else
      echo "[SKIP] spec chưa tồn tại: $file"
      record_gate "spec-missing:$file" "playwright spec" 0
    fi
  done
  printf '%s\n' "${out[@]:-}"
}

run_playwright() {
  local label="$1"
  shift
  local -a specs=()
  local spec
  while IFS= read -r spec; do
    [[ -n "$spec" ]] && specs+=("$spec")
  done < <(existing_specs "$@")
  if [[ ! -f "$REPO_ROOT/$CONFIG" ]]; then
    echo "[SKIP] $label (config chưa tồn tại)"
    record_gate "$label" "playwright (config missing)" 0
    return 0
  fi
  if [[ ${#specs[@]} -eq 0 ]]; then
    echo "[SKIP] $label (không có spec)"
    record_gate "$label" "playwright (no specs)" 0
    return 0
  fi
  run_gate "$label" npx playwright test --config "$CONFIG" "${specs[@]}"
}

write_evidence() {
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n").filter(Boolean);
    const gates = lines.map((line) => {
      const [name, command, exitCode] = line.split("\t");
      return { name, command, exitCode: Number(exitCode) };
    });
    const base = fs.existsSync(process.argv[2])
      ? JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
      : {};
    const payload = {
      timestamp: new Date().toISOString(),
      mode: base.mode ?? "change-scoped",
      scope: base.scope ?? "full",
      explicitPath: base.explicitPath ?? null,
      rules: base.rules ?? [],
      changed: base.changed ?? [],
      unit: base.unit ?? [],
      unitFiles: base.unitFiles ?? [],
      e2e: base.e2e ?? [],
      gates,
      exit: Number(process.argv[4]),
      note: "Chỉ ghi metadata; không ghi token hay response body.",
    };
    fs.mkdirSync("workbench/evidence", { recursive: true });
    fs.writeFileSync(process.argv[3], `${JSON.stringify(payload, null, 2)}\n`);
  ' "$GATES_TMP" "$SCOPE_FILE" "$EVIDENCE" "$1"
}

echo "REPO_ROOT=$REPO_ROOT"
: > "$GATES_TMP"

if [[ "$MODE" == "full" ]]; then
  echo "[MODE] full — release/nghi lan, chạy mọi gate"
  OVERALL=0

  run_gate "unit-root" npm test -- --bail=1 || OVERALL=1
  run_gate "unit-knowledge" npm run test:knowledge || OVERALL=1
  run_gate "jira-proxy" node --test proxy/jira-proxy.test.mjs || OVERALL=1
  run_gate "knowledge-self-check" node scripts/test-knowledge-live.mjs --self-check || OVERALL=1

  if [[ -n "${KNOWLEDGE_SERVER_TOKEN:-}" ]]; then
    run_gate "knowledge-live" node scripts/test-knowledge-live.mjs
    LIVE_CODE=$?
    if [[ $LIVE_CODE -eq 2 ]]; then
      OVERALL=2
      echo "[BLOCKED] knowledge live trả 2 — không tính pass"
    elif [[ $LIVE_CODE -ne 0 ]]; then
      OVERALL=1
    fi
  else
    echo "[SKIP] knowledge-live (thiếu KNOWLEDGE_SERVER_TOKEN)"
    record_gate "knowledge-live" "knowledge-live (skipped: no token)" 0
  fi

  ALL_SPECS=()
  while IFS= read -r spec; do
    [[ -n "$spec" ]] && ALL_SPECS+=("$spec")
  done < <(find workbench/e2e -maxdepth 1 -name '*.e2e.ts' -print 2>/dev/null | sort)
  run_playwright "e2e-all" "${ALL_SPECS[@]:-}" || OVERALL=1

  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({ mode: "full", scope: "full" }) + "\n");
  ' "$SCOPE_FILE"

  write_evidence "$OVERALL"
  echo "EVIDENCE=$EVIDENCE exit=$OVERALL"
  exit "$OVERALL"
fi

echo "[MODE] change-scoped — mặc định, không gọi full suite"
node workbench/scripts/detect-changes.mjs "${SCOPE_ARG[@]}" > "$SCOPE_FILE" || exit 2

# Expand rule unit paths to concrete test files and persist back into scope JSON.
node --input-type=module -e '
  import fs from "node:fs";
  const scopePath = process.argv[1];
  const scope = JSON.parse(fs.readFileSync(scopePath, "utf8"));
  const { expandUnitPaths } = await import("./workbench/scripts/detect-changes.mjs");
  const manifest = JSON.parse(fs.readFileSync("workbench/gate-map.json", "utf8"));
  scope.unitFiles = expandUnitPaths(
    scope.unit,
    (p) => fs.existsSync(p),
    (dir, opts) => fs.readdirSync(dir, opts),
    manifest.unitTestFileSuffixes
  );
  fs.writeFileSync(scopePath, `${JSON.stringify(scope, null, 2)}\n`);
' "$SCOPE_FILE" || exit 2
visible_scope

UNIT_FILES=$(node -e 'const fs=require("fs");console.log((JSON.parse(fs.readFileSync(process.argv[1],"utf8")).unitFiles||[]).join("\n"))' "$SCOPE_FILE")
E2E_SPECS=$(node -e 'const fs=require("fs");console.log((JSON.parse(fs.readFileSync(process.argv[1],"utf8")).e2e||[]).join("\n"))' "$SCOPE_FILE")

UNIT_ARGS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && UNIT_ARGS+=("$line")
done <<< "$UNIT_FILES"
E2E_ARGS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && E2E_ARGS+=("$line")
done <<< "$E2E_SPECS"

OVERALL=0
if [[ ${#UNIT_ARGS[@]} -gt 0 ]]; then
  run_gate "unit-scoped" node --test "${UNIT_ARGS[@]}" || OVERALL=1
else
  echo "[SKIP] unit-scoped (không có file unit nào map)"
  record_gate "unit-scoped" "vitest (no unit files)" 0
fi
run_playwright "e2e-scoped" "${E2E_ARGS[@]}" || OVERALL=1

write_evidence "$OVERALL"
echo "EVIDENCE=$EVIDENCE exit=$OVERALL"
exit "$OVERALL"
