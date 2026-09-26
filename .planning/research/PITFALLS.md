# Pitfalls Research

**Domain:** Personal offline-first task and workload planning PWA
**Researched:** 2026-09-26
**Confidence:** HIGH for browser platform, GitHub API, and PWA pitfalls; MEDIUM for product workload UX pitfalls

## Critical Pitfalls

### Pitfall 1: Treating dates as timestamps instead of planning days

**What goes wrong:**
Tasks due on one date appear on another date after timezone changes, DST transitions, travel, browser locale changes, or ISO parsing. Daily capacity math drifts because code adds `86400000` milliseconds instead of adding calendar days. Date-only fields become hidden instants.

**Why it happens:**
JavaScript `Date` stores an instant, not a plain calendar date. MDN documents that date-only strings like `"2011-10-10"` parse as UTC, date-time strings without offset parse as local time, and DST can make one calendar day not equal 24 hours. Developers also rely on host local timezone because `Date` has no stored timezone.

**How to avoid:**
Store planning dates as canonical `YYYY-MM-DD` strings for all due dates, capacity override dates, and workload allocation dates. Use local calendar arithmetic helpers that operate on year/month/day fields, not elapsed milliseconds. Keep timestamps only for audit metadata like backup creation time. Add tests around DST start/end, month boundaries, leap year, and timezone changes. If date helpers grow complex, evaluate Temporal polyfill in a later phase; do not start with custom timezone engine.

**Warning signs:**
- Code uses `new Date('YYYY-MM-DD')` for business dates.
- Code adds or subtracts `86400000` for next/previous day.
- Same task lands on different workload days in UTC+7 versus UTC-5.
- Tests only cover current locale and ordinary weekdays.

**Phase to address:**
Phase 1: Data model and date math foundation. Block scheduling features until date representation is settled.

---

### Pitfall 2: Workload feasibility looks precise but ignores real capacity rules

**What goes wrong:**
Planner says work fits, but allocation overloads leave days, weekends, meetings, existing allocations, or partial availability. Suggested schedules appear mathematically valid but useless. User loses trust in the core product value.

**Why it happens:**
Feasibility is often built as `total estimated hours <= total capacity`, without day-level constraints. Requirements need weekly capacity plus per-date overrides and lowest-load eligible day distribution. That demands deterministic day-by-day capacity, existing load, date eligibility, and remaining work tracking.

**How to avoid:**
Build feasibility as a pure deterministic function: inputs are date range, task estimate, fixed allocations, weekly capacity, per-date overrides, and current allocations; output is per-day allocation, overload list, unscheduled hours, and explanation. Prefer transparent greedy lowest-load allocation first; avoid opaque optimization. Represent unavailable days as zero capacity. Round only at display boundaries, not internal math.

**Warning signs:**
- Feasibility returns only boolean without per-day explanation.
- Overrides apply after allocation instead of before.
- Existing planned work excluded from fit checks.
- Suggested schedule changes on every render because sort tie-breakers are unstable.

**Phase to address:**
Phase 2: Capacity model and feasibility engine. Verify before dashboard polish.

---

### Pitfall 3: IndexedDB migrations corrupt or strand local data

**What goes wrong:**
App update ships a schema change, but old tabs keep database open and block migration. A failed migration deletes object stores or half-converts records. User reloads into empty or incompatible data. Offline source of truth becomes untrustworthy.

**Why it happens:**
IndexedDB schema changes can only occur in `onupgradeneeded`; existing store options cannot be edited in place; deleting/recreating a store destroys data. MDN documents blocked upgrades when another tab holds an old connection, integer-only versions, auto-aborting transactions on uncaught errors, and transaction inactivity after returning to event loop.

**How to avoid:**
Use monotonic integer schema versions and explicit migration steps. Keep migrations idempotent where possible. Never delete old stores until migrated data has been written and verified. Group related changes in one transaction. Register `db.onversionchange` to close old connections and show reload prompt. Add export-before-migrate path once backups exist. Test upgrade from every released schema version.

**Warning signs:**
- Version numbers use `1.1` or package semver.
- Migration code calls `deleteObjectStore()` before copying data.
- App has no UI for “another tab must close/reload”.
- Migration tests only start from empty database.

**Phase to address:**
Phase 1: Persistence foundation. Revisit every phase that changes data shape.

---

### Pitfall 4: Offline data assumed durable because IndexedDB write succeeded

**What goes wrong:**
Data vanishes after storage pressure, private browsing close, site data cleanup, Safari inactivity behavior, OS crash, or quota failure. Cache and database may be wiped together. User thinks offline-first means permanent.

**Why it happens:**
Browser storage is best-effort by default. MDN documents that browsers can evict origin storage under pressure, private browsing uses lower quotas and purges at session end, and origin buckets can be removed all at once. IndexedDB `complete` does not always mean bytes are physically flushed to disk before crash.

**How to avoid:**
Request persistent storage with `navigator.storage.persist()` after meaningful user action and report result. Expose backup/export early. Catch `QuotaExceededError` and show recovery guidance. Keep Cache API storage bounded so precache does not compete with IndexedDB. Detect empty database on startup and offer import, not silent reset.

**Warning signs:**
- No call to `navigator.storage.persisted()` / `persist()`.
- No startup path for “database missing but app installed”.
- Cache grows without cleanup.
- Quota errors only logged to console.

**Phase to address:**
Phase 1: Persistence foundation; Phase 4: Backup and GitHub sync hardening.

---

### Pitfall 5: Backup import replaces good local data with bad or wrong data

**What goes wrong:**
User imports corrupt JSON, wrong encrypted file, old backup, incompatible schema, duplicate IDs, or partial data and overwrites the only good local database. Recovery path becomes data loss path.

**Why it happens:**
Backup/import is treated as serialization glue instead of a destructive data operation. Apps often skip manifest/version checks, dry-run validation, collision detection, and explicit confirmation.

**How to avoid:**
Use a backup envelope with app name, backup format version, schema version, created timestamp, item counts, random backup ID, encryption metadata, and checksum/authenticated metadata. Import must parse, validate, migrate in memory, show summary, and require explicit replace/merge confirmation. Default to restore into a new database snapshot or create automatic pre-import export. Reject unknown future format unless safe migration exists.

**Warning signs:**
- Import button immediately clears IndexedDB.
- Backup has no format version or app marker.
- Import cannot preview item counts and timestamp.
- Test suite lacks corrupt, old, future, empty, and wrong-file cases.

**Phase to address:**
Phase 4: Export/import and backup safety. Do not add GitHub sync before safe local import exists.

---

### Pitfall 6: Browser encryption gives false security

**What goes wrong:**
Encrypted GitHub backup can be decrypted by attacker because AES-GCM IV repeats, password-derived key is weak, salt/iterations are missing, key is extractable unnecessarily, metadata leaks too much, or passphrase is stored beside token. Public repository contains recoverable personal planning data.

**Why it happens:**
Web Crypto is low-level. MDN warns it is easy to misuse and key management is hard. AES-GCM requires unique IV per key. PBKDF2 is appropriate for passwords; HKDF is not for low-entropy passwords. `extractable` should be false unless export is required.

**How to avoid:**
Encrypt only with Web Crypto primitives using PBKDF2 from passphrase plus random salt, AES-GCM 256-bit key, fresh random 96-bit IV per backup, 128-bit tag, and authenticated additional data for non-secret envelope fields. Store salt and IV with ciphertext. Never store passphrase in source, bundle, localStorage, or GitHub. Require passphrase re-entry unless user explicitly accepts local retention. Add decrypt-verify before upload and after download.

**Warning signs:**
- Code reuses IV or derives IV from timestamp/filename.
- Encryption key is exported or saved in IndexedDB/localStorage.
- Backup decrypt failure produces empty import instead of hard error.
- Encrypted blob lacks algorithm/version metadata.

**Phase to address:**
Phase 4: Encrypted backup. Security review flag before enabling GitHub upload.

---

### Pitfall 7: GitHub token handling turns static app into credential leak

**What goes wrong:**
Personal access token is committed, embedded in built assets, stored insecurely, over-scoped, never expires, or exposed through screenshots/logs. A public Pages repo leaks access to repository contents or wider account permissions.

**Why it happens:**
GitHub Pages has no server-side secret storage. All bundled code and client storage are user-controlled/exposed. GitHub says access tokens must be treated like passwords; classic tokens can grant broad account/repo access. Contents API updates need bearer token and SHA, which tempts developers to bake token into config.

**How to avoid:**
Make GitHub sync optional and user-supplied at runtime. Recommend fine-grained token restricted to one repository and Contents read/write only, with expiration. Never include token in `.env` variables used by Vite client bundle. Store token only if user explicitly chooses, with clear warning; prefer session memory. Redact token in logs/errors. Provide revoke/replace UI and docs.

**Warning signs:**
- `VITE_GITHUB_TOKEN` exists.
- Token appears in built `dist` assets or repo history.
- App requests classic `repo` scope without explaining blast radius.
- Network errors display Authorization header or full request object.

**Phase to address:**
Phase 4: GitHub sync. Add secret scanning check before deployment.

---

### Pitfall 8: GitHub Contents API sync treated like live database sync

**What goes wrong:**
Backup upload fails with 409 conflicts, overwrites newer remote backup, corrupts remote file through concurrent update/delete, or downloads wrong branch/path. User expects sync but gets last-write-wins data loss.

**Why it happens:**
GitHub Contents API is file-oriented, not a database. Official docs require file SHA for update/delete and warn concurrent create/update/delete requests conflict and must run serially. Large files have endpoint limits. This project explicitly needs backup sync, not collaborative live sync.

**How to avoid:**
Implement single encrypted artifact sync with explicit manual actions: “download remote backup”, “upload current backup”, “compare timestamps/counts”. On upload, fetch current file metadata and SHA, verify remote backup ID/timestamp, then update with SHA. Handle 409 by refetching and asking user. Keep path and branch configurable but default safe. Block concurrent sync operations with one in-flight lock.

**Warning signs:**
- Sync runs automatically on every edit.
- Upload uses PUT without first reading current SHA.
- 409 conflict retries blindly.
- UI says “synced” without remote timestamp and commit result.

**Phase to address:**
Phase 4: GitHub sync after local backup/import is robust.

---

### Pitfall 9: GitHub Pages subpath breaks PWA assets and routing

**What goes wrong:**
App works locally but deployed page loads blank, service worker controls wrong scope, manifest icons fail, refresh deep link 404s, or assets point to `/assets/...` instead of `/<repo>/assets/...`.

**Why it happens:**
Project Pages are served under `https://<owner>.github.io/<repository>/`. Vite requires `base: '/<REPO>/'` for subpath deployment. Service worker script path and scope are origin-relative; scope cannot exceed script directory unless server headers allow it. Static hosting has no app server for arbitrary SPA rewrites.

**How to avoid:**
Set Vite `base` to repository subpath for project Pages. Keep service worker and manifest URLs under that base. Prefer hash routing or verified Pages SPA fallback strategy for deep links. Test production build from the exact Pages URL, not only `localhost`. Add CI check that built HTML uses expected base.

**Warning signs:**
- `vite.config` base remains `/` for project Pages.
- Service worker registration uses `/sw.js` while app is under `/<repo>/`.
- Reloading nested route gives GitHub 404.
- Manifest start URL opens root domain, not repo path.

**Phase to address:**
Phase 0/1: Build and deployment foundation; verify again when PWA added.

---

### Pitfall 10: Service worker update swaps app shell while old app state is running

**What goes wrong:**
New service worker activates under old JavaScript. Old UI talks to new cache or changed IndexedDB schema. User loses unsaved edits, sees mixed asset versions, or reloads into migration conflict.

**Why it happens:**
Service worker lifecycle intentionally stages new workers in `waiting` while old clients run. `skipWaiting()` forces takeover and can make new worker control pages loaded with older code. MDN documents first install does not control existing tabs until reload, and old worker may serve while new worker installs.

**How to avoid:**
Use update prompt: “New version available, save and reload”. Do not blanket `skipWaiting()` for data-bearing app screens. Version caches and delete old caches during `activate`. Pair app version, DB schema version, and service worker cache version in release notes/tests. Before reload, flush pending writes and close DB connections.

**Warning signs:**
- Workbox config has `skipWaiting: true` and `clientsClaim: true` without UX prompt.
- No `updatefound` / `controllerchange` handling.
- Cache names are reused across releases.
- User can edit while reload prompt forces refresh.

**Phase to address:**
Phase 3: PWA offline shell and update UX. Re-test every schema-changing release.

---

### Pitfall 11: Accessibility sacrificed to dense productivity UI

**What goes wrong:**
Keyboard users cannot create/edit tasks quickly. Focus disappears in modals, filters, tables, drawers, or date pickers. Overload warnings are color-only. Screen readers miss save/import/sync status. Touch targets are too small on mobile.

**Why it happens:**
Task planners push dense grids, drag/drop, inline edit, badges, and modals. Ant Design provides components but app-level composition still controls labels, focus order, status messaging, row identity, and color semantics. WCAG requirements still apply to keyboard operation, visible focus, name/role/value, labels, contrast, and status messages.

**How to avoid:**
Make every core action keyboard reachable before adding drag/drop. Use buttons/menus/forms with accessible names. Add visible focus states and logical focus return after modal/drawer close. Pair colors with text/icons for load states. Announce save/import/sync results in `aria-live` region. Keep mobile touch targets practical. Test with keyboard only and at 200% zoom.

**Warning signs:**
- Required action only available through drag/drop or hover.
- Focus trap leaks from modal/drawer.
- “Overloaded” is red-only with no text.
- Toasts disappear before screen reader can announce result.

**Phase to address:**
Every UI phase, starting Phase 1. Add accessibility acceptance checks to each feature, not final cleanup.

---

### Pitfall 12: UI complexity overwhelms core planning loop

**What goes wrong:**
App becomes a mini project-management suite with dependencies, recurrence, collaboration, time tracking, elaborate Gantt views, and many statuses before core feasibility is proven. Main user stops trusting or using it because adding work is slower than current tools.

**Why it happens:**
Task tools have many tempting adjacent features. Project requirements explicitly exclude collaboration, recurring tasks, subtasks/dependencies, external calendar integration, notifications, timers, and native apps for v1. Roadmaps often ignore these boundaries once UI work begins.

**How to avoid:**
Optimize first loop: capture task, estimate hours, set date range/deadline, see daily load, adjust. Keep one primary dashboard and one planning view before adding more. Use progressive disclosure for details. Treat excluded features as anti-features until validated. Measure UI by number of steps to add/reschedule work.

**Warning signs:**
- Roadmap adds recurrence/dependencies before allocation is validated.
- More than one way to represent same work item.
- Dashboard has many widgets but no clear overload action.
- Task creation requires fields that are not needed for feasibility.

**Phase to address:**
Phase 0: scope guard; Phase 2: planning loop; Phase 5+: only after validation.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store dates as `Date` objects/ISO instants | Faster initial forms | Timezone and DST bugs in core workload math | Never for planning days |
| Use floating DB versions like `1.2` | Looks like app semver | IndexedDB rounds down; migrations may not run | Never |
| Clear and rewrite DB on import | Simple code | One bad import destroys good data | Never without pre-import backup and confirmation |
| Auto-sync every edit to GitHub | Feels modern | Token exposure, conflicts, rate/noise, user confusion | Defer; manual backup sync only |
| Force `skipWaiting()` | Fast updates | Mixed app versions, lost edits, migration conflicts | Only for static marketing pages, not this app |
| Build dense table-first UI | Lots visible | Poor mobile, keyboard, and cognitive load | Only for secondary review screens |
| Add recurrence/dependencies early | Feature richness | Model and UI complexity before core value validated | Not in v1 |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Contents API | PUT update without current file SHA | Fetch metadata, use current SHA, handle 409 by prompting |
| GitHub token | Bundle token via Vite env or commit config | Runtime user token only; fine-grained repo-limited token; redact logs |
| GitHub Pages | Deploy project site with `base: '/'` | Set Vite `base: '/<REPO>/'`; test production URL |
| Service worker | Register `/sw.js` from repo subpath app | Register under correct base/scope and verify controlled URL |
| Web Crypto | Reuse AES-GCM IV or store passphrase locally | Fresh 96-bit IV per encryption, PBKDF2 salt, non-extractable key, passphrase not persisted by default |
| IndexedDB | Leave old tab open during upgrade | Handle `versionchange`, close DB, show reload prompt |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recalculate all allocations on every keystroke | Laggy forms and battery drain | Pure engine plus memoized inputs; recalc on committed edits | Hundreds of tasks or 30-day horizon |
| Store derived daily load as source of truth | Load totals disagree with tasks | Store allocations; derive summaries or cache with invalidation | First reschedule/import |
| Huge Ant Design table with all rows rendered | Slow scroll, broken mobile | Paginate/group by horizon; use virtualization only with numeric `scroll.x/y` and stable `rowKey` | Hundreds to thousands of rows |
| Unbounded app caches | Quota pressure wipes origin storage | Version caches, cleanup outdated caches, keep precache small | Large assets or many releases |
| One giant encrypted backup forever | Slow upload/download, Contents API limits | Keep compact JSON, no binary attachments, warn on size | Approaches 1 MB+; unsupported above 100 MB |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| GitHub token in source, `.env`, or bundle | Repository/account compromise | Runtime token entry; fine-grained token; secret scanning; no Vite client env token |
| Passphrase stored with encrypted backup | Backup encryption meaningless | Do not persist passphrase by default; if retained, disclose risk clearly |
| AES-GCM IV reuse | Ciphertext may become decryptable/forgeable | Fresh random 96-bit IV for every backup encryption |
| Weak backup envelope validation | Wrong/corrupt file can destroy local data | Authenticated metadata, format version, dry-run import, confirmation |
| Error logs include secrets or decrypted data | Local screenshots/log exports leak private data | Redact Authorization headers, tokens, passphrases, plaintext backup content |
| Treat client-side crypto as audited security product | Hidden design flaw leaks personal data | Keep protocol minimal and documented; mark security review before remote sync |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Boolean “fits/doesn't fit” feasibility | User cannot fix overload | Show overloaded dates, unscheduled hours, and suggested moves |
| Too many required task fields | Capture becomes slower than paper | Require title and estimate/date only when needed for planning |
| Color-only capacity states | Inaccessible and ambiguous | Use text labels: Available, Busy, Overloaded plus color |
| Hidden sync state | User cannot tell whether backup is local or remote | Show last local save, last export, last GitHub upload/download timestamp |
| Destructive import without preview | Fear and data loss | Show backup summary and require explicit replace/merge confirmation |
| Drag/drop as primary scheduling | Poor keyboard/touch accessibility | Provide buttons/menus/date inputs; drag/drop optional later |
| Dashboard widget overload | No clear next action | Prioritize today, urgent, overloaded days, and next recommended action |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Date model:** Uses `YYYY-MM-DD` for planning dates; DST/leap/month tests pass.
- [ ] **Capacity engine:** Handles weekly capacity, per-date overrides, zero-capacity days, existing allocations, and deterministic tie-breaks.
- [ ] **IndexedDB:** Has versioned migrations, blocked-upgrade UX, `versionchange` close handler, and upgrade tests from old schemas.
- [ ] **Durability:** Requests persistent storage, handles quota errors, and offers export before user trusts app.
- [ ] **Backup export:** Includes envelope, schema version, counts, timestamp, and validation path.
- [ ] **Import:** Performs dry-run validation and never clears local data before confirmation/pre-import backup.
- [ ] **Encryption:** Uses PBKDF2 salt, fresh AES-GCM IV, non-extractable key, and decrypt-verify tests.
- [ ] **GitHub sync:** Uses current SHA, handles 409 conflicts, serializes operations, and never embeds token.
- [ ] **Pages deploy:** Production build works under repo subpath with correct manifest/service-worker scope.
- [ ] **Service worker:** Shows update prompt and avoids forced reload while edits may be pending.
- [ ] **Accessibility:** Keyboard-only path exists for create/edit/schedule/import/sync; focus and status announcements work.
- [ ] **UI scope:** No recurrence, dependencies, collaboration, timers, notifications, or calendar integration in v1.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Date drift discovered after data exists | MEDIUM | Freeze writes, add migration from instants to `YYYY-MM-DD` using displayed local date, ask user to review affected records |
| Failed IndexedDB migration | HIGH | Stop app startup, export raw DB if possible, restore from pre-migration backup, patch migrator, retry on copy |
| Storage eviction/data missing | HIGH | Detect empty DB, show restore/import flow, explain browser storage limits, request persistence after restore |
| Bad import overwrote data | HIGH | Restore automatic pre-import backup; if absent, recover from GitHub/export/browser profile backup if available |
| Encryption metadata bug | MEDIUM | Keep old decrypt path versioned, re-encrypt with fixed envelope after successful decrypt |
| GitHub token leaked | HIGH | Revoke token in GitHub, remove from repo/history if committed, rotate token, audit repo access/logs |
| GitHub sync conflict | LOW/MEDIUM | Stop auto retry, fetch remote metadata, show local vs remote summary, let user choose upload/download/export both |
| Bad service-worker release | MEDIUM | Publish fixed worker with cache cleanup, instruct hard reload/unregister if needed, keep DB migration backward-compatible |
| Accessibility regression | LOW/MEDIUM | Add keyboard/focus/status checks to affected component; avoid custom control until native/Ant component works |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Date/timestamp confusion | Phase 1: Data model and persistence | Unit tests for DST, timezone, leap day, month boundary; schema stores date strings |
| Feasibility ignores real capacity | Phase 2: Workload engine | Golden tests for overrides, existing load, zero-capacity days, unscheduled hours |
| IndexedDB migration corruption | Phase 1 and every schema phase | Upgrade tests from each released version; blocked-tab manual test |
| Browser storage eviction | Phase 1; backup in Phase 4 | Persistent storage request path; quota error test; empty DB recovery UX |
| Unsafe import | Phase 4: Backup/import | Corrupt/wrong/future/old backup tests; pre-import backup created |
| Weak encryption | Phase 4: Encrypted backup | Encrypt/decrypt roundtrip, wrong passphrase failure, IV uniqueness test, metadata versioning |
| GitHub token leak | Phase 4: GitHub sync | Built asset scan for token strings; docs specify fine-grained token; logs redacted |
| Contents API conflicts | Phase 4: GitHub sync | 409 conflict mocked; update requires SHA; concurrent upload lock works |
| Pages subpath breakage | Phase 0/1: Deployment foundation | Production build deployed/tested under `/<repo>/`; refresh/install works |
| Service-worker mixed versions | Phase 3: PWA offline | Update prompt manual test; no forced reload with dirty state; cache version cleanup |
| Accessibility gaps | Every UI phase | Keyboard-only acceptance test; focus visible; status messages announced; color not sole signal |
| UI scope creep | Phase 0 roadmap and each planning review | Anti-feature checklist enforced; core planning loop step count reviewed |

## Sources

- MDN JavaScript `Date`: date-only parsing as UTC, local timezone behavior, DST disambiguation, and day-math warnings. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
- MDN IndexedDB “Using IndexedDB”: migrations, blocked upgrades, transactions, versionchange, and schema mutation limits. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- MDN IndexedDB basic terminology: durability, transaction auto-commit/abort, storage wipe causes. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology
- MDN Storage quotas and eviction criteria: best-effort storage, persistent storage, quota errors, private browsing, all-origin eviction. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN StorageManager.persist(): requesting persistent storage and browser behavior. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN Service Worker “Using Service Workers”: lifecycle, scope, registration, cache versioning, install/activate cautions. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- MDN ServiceWorkerRegistration `updatefound`: detecting new service workers. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updatefound_event
- web.dev PWA update guidance: waiting worker, user prompt, and `skipWaiting()` risks. HIGH confidence. https://web.dev/learn/pwa/update
- MDN Web Crypto API: low-level crypto and key-management warnings. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- MDN SubtleCrypto `deriveKey`: PBKDF2 for passwords, salt, iterations, non-extractable derived keys. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
- MDN SubtleCrypto `importKey`: raw password material and PBKDF2 key usages. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
- MDN `AesGcmParams`: AES-GCM IV uniqueness, 96-bit IV recommendation, tag length, authenticated data. HIGH confidence. https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
- GitHub REST Contents API docs: bearer token, SHA required for update/delete, file size limits, concurrency conflicts. HIGH confidence. https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28
- GitHub personal access token docs: token safety, fine-grained tokens, scopes, expiration, revocation. HIGH confidence. https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Vite static deploy docs: GitHub Pages `base: '/<REPO>/'` and `dist` output. HIGH confidence. https://vite.dev/guide/static-deploy.html
- GitHub Pages docs: project sites are served under repository subdirectory; static HTML/CSS/JS hosting. HIGH confidence. https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- Workbox precaching docs: manifest revisioning, cache cleanup, fallback, route order. HIGH confidence. https://developer.chrome.com/docs/workbox/modules/workbox-precaching
- Vite PWA plugin guide: dev service worker disabled by default and older autoUpdate caveat. MEDIUM confidence for limited extracted scope. https://vite-pwa-org.netlify.app/guide/
- Ant Design Table docs: `rowKey`, virtualization numeric scroll, fixed column/layout pitfalls, responsive/rowScope notes. HIGH confidence. https://ant.design/components/table
- WCAG 2.2 criteria referenced for keyboard, focus visible, name/role/value, status messages, contrast, target size, and responsive behavior. MEDIUM confidence due W3C fetch 403; requirements are stable but not directly fetched in this run. https://www.w3.org/WAI/WCAG22/quickref/

---
*Pitfalls research for: Personal offline-first task and workload planning PWA*
*Researched: 2026-09-26*
