# Stack Research

**Domain:** Personal offline-first task and workload planning PWA on GitHub Pages
**Researched:** 2026-09-26
**Confidence:** HIGH

## Recommendation

Use a boring static React stack: **React 19 + TypeScript 7 + Vite 8 + Ant Design 6 + Dexie 4 + vite-plugin-pwa + native Web Crypto + GitHub Contents API**.

This matches fixed decisions in `PROJECT.md`: no backend, IndexedDB source of truth, installable PWA, Ant Design UI, GitHub Pages static hosting, optional client-side encrypted GitHub backup.

Do **not** add server, auth provider, sync database, or heavy state framework. Personal single-user app needs durable local data and safe backup, not distributed collaboration infrastructure.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Node.js | 24 LTS | Build/runtime for tooling only | Node 24 is current Latest LTS. Node 20 is EOL; Node 26 is Current, not LTS. Modern Vite/Vitest/ESLint support Node 22+ or 24+, so use 24 to avoid immediate churn. | HIGH |
| npm | 12.x | Package manager | Default, lowest-friction choice with Node. No need for pnpm/yarn complexity in a personal app. Use `npm ci` in GitHub Actions. | MEDIUM |
| Vite | 8.3.1 | Static app build/dev server | Official Vite docs support React TypeScript templates, fast ESM dev, GitHub Pages deployment with `base: '/<repo>/'`, and static `dist` output. | HIGH |
| React | 19.3.0 | UI framework | Current stable React family. Pairs cleanly with Ant Design 6 and React Router 8. | HIGH |
| react-dom | 19.3.0 | React browser renderer | Required peer for React/Ant Design. React 19 has improved root error hooks useful for app-level data-loss logging. | HIGH |
| TypeScript | 7.0.2 | Static typing | Required for durable task/data model, migration safety, and encryption/backup boundary correctness. | HIGH |
| Ant Design | 6.6.5 | Component system | Fixed UI decision. Ant Design 6 supports React >=18, dropped React 16/17, bundles TypeScript types, and gives productive forms/tables/layout without custom UI work. | HIGH |
| IndexedDB | Browser API | Local durable database | Fixed persistence decision. Works offline, origin-scoped, structured, async, and suited to larger datasets than Web Storage. | HIGH |
| Dexie | 4.4.6 | IndexedDB wrapper | Standard pragmatic wrapper: schema versioning, transactions, compound indexes, bulk operations, typed tables. Much less code than raw IndexedDB. | HIGH |
| dexie-react-hooks | 4.4.0 | Reactive React reads from Dexie | `useLiveQuery` updates views from IndexedDB changes without writing custom subscription plumbing. | HIGH |
| vite-plugin-pwa | 1.3.0 | Manifest and service worker integration | Official Vite PWA ecosystem standard. Uses Workbox, generates app manifest/SW registration, and supports dev testing. | HIGH |
| Workbox | 7.4.1 | Service worker precache/runtime cache | Used by vite-plugin-pwa. Avoid hand-written service worker cache bugs unless requirements exceed generated SW. | HIGH |
| Web Crypto API | Browser native | Backup encryption | Native secure-context API supports `crypto.subtle`, AES-GCM, PBKDF2/HKDF, `getRandomValues`, and non-extractable `CryptoKey`. No crypto npm package needed. | HIGH |
| GitHub Contents API | REST API | Optional encrypted backup file sync | Fits GitHub Pages/no-backend constraint. `GET`/`PUT /repos/{owner}/{repo}/contents/{path}` can fetch/create/update one encrypted backup artifact. | HIGH |
| @octokit/request | 10.0.16 | GitHub REST caller | Small wrapper around `fetch` with GitHub defaults, works in browser and Node, avoids full Octokit SDK weight. | HIGH |
| GitHub Pages | Current service | Static hosting | Officially hosts HTML/CSS/JS from repository, supports project subpaths, and has no server-side runtime. Perfect fit for Vite static output. | HIGH |
| GitHub Actions Pages deploy | Current service | Build/deploy pipeline | Official Vite docs recommend GitHub Actions for GitHub Pages because Vite needs build step. Avoid `gh-pages` package. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| zod | 4.6.5 | Runtime schema validation | Use at trust boundaries: backup import, backup decrypt payload, GitHub response normalization, IndexedDB migration validation. | HIGH |
| dayjs | 1.11.23 | Date math/display | Use for date parsing, formatting, ranges, and workload horizons. Keep all persisted dates as `YYYY-MM-DD` strings to avoid timezone drift. | HIGH |
| zustand | 5.0.15 | Lightweight UI state | Optional. Use for ephemeral global UI state only: selected project, filters, dashboard range, sync status. Do not persist domain data here. | MEDIUM |
| react-router | 8.4.0 | Client-side routing | Use only when distinct URL-addressable views matter. On GitHub Pages, prefer hash routing unless adding SPA fallback workflow. | HIGH |
| @ant-design/icons | 6.3.4 | Ant Design icon set | Use because Ant Design components/examples expect it. Import icons individually. | HIGH |
| @testing-library/react | 16.3.3 | React component tests | Use for behavior tests of forms, workload planner, and import confirmation flows. | HIGH |
| @testing-library/jest-dom | 7.0.1 | DOM assertions | Use with Vitest/jsdom for readable assertions. | HIGH |
| fake-indexeddb | 6.2.5 | IndexedDB test shim | Use for Dexie repository tests in Node. | HIGH |
| jsdom | 30.1.1 | Browser-like test DOM | Use with Vitest component tests. | HIGH |
| Playwright | 1.63.0 | Browser E2E/PWA checks | Use for installability smoke tests, offline reload, GitHub Pages base-path routing, and backup import/export flows. | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite | Dev server/build | Use `base: '/task-management/'` for GitHub project page unless custom domain/user page uses `/`. |
| @vitejs/plugin-react | React transform | Version 6.1.1. Use standard plugin first. Skip React Compiler template until measurable UI bottleneck exists. |
| TypeScript `strict` | Type safety | Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Planning math and migrations need this. |
| ESLint | Static lint | Version 10.11.0. Use flat config. Keep rules boring: React hooks, TypeScript, no unsafe optional data replacement. |
| Prettier | Formatting | Version 3.9.9. Use default formatting; no style debate. |
| Vitest | Unit tests | Version 5.0.2. Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`; Node 24 LTS recommended. |
| Playwright | E2E tests | Version 1.63.0. Test PWA/offline in real Chromium, not only jsdom. |
| GitHub Actions | CI/deploy | Use `npm ci`, `npm run build`, upload `dist` via official Pages actions. |

## Installation

```bash
# Create app
npm create vite@latest task-management -- --template react-ts
cd task-management

# Core UI/data/PWA/sync
npm install react@19.3.0 react-dom@19.3.0 antd@6.6.5 @ant-design/icons@6.3.4 dexie@4.4.6 dexie-react-hooks@4.4.0 vite-plugin-pwa@1.3.0 workbox-window@7.4.1 @octokit/request@10.0.16 zod@4.6.5 dayjs@1.11.23

# Optional only after multiple URL-addressable pages or global UI state emerges
npm install react-router@8.4.0 zustand@5.0.15

# Dev dependencies
npm install -D typescript@7.0.2 vite@8.3.1 @vitejs/plugin-react@6.1.1 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.0 eslint@10.11.0 typescript-eslint@8.70.1 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 globals@17.12.0 prettier@3.9.9 vitest@5.0.2 jsdom@30.1.1 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 fake-indexeddb@6.2.5 playwright@1.63.0
```

## Required Project Configuration

### `package.json` engine

```json
{
  "engines": {
    "node": "^24.0.0"
  }
}
```

Why: Node 24 is Latest LTS. Vite 8 requires `^20.19.0 || >=22.12.0`, but Node 20 is EOL. Vitest 5 requires `^22.12.0 || ^24.0.0 || >=26.0.0`. Node 24 is stable target.

### Vite base for GitHub Pages

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/task-management/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Task Management',
        short_name: 'Tasks',
        start_url: '/task-management/',
        scope: '/task-management/',
        display: 'standalone',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    })
  ]
});
```

Use `base: '/'` only for user/organization page or custom domain. For project page `https://<owner>.github.io/task-management/`, use `base: '/task-management/'`.

### Routing

Start with no router or hash routing.

- If views are tabs inside one shell: no `react-router`.
- If URLs matter: use React Router hash routing.
- Avoid browser history routing on GitHub Pages unless also shipping an SPA fallback/404 copy. Static hosting has no server rewrite.

### IndexedDB model

Use Dexie as one local source of truth.

- Tables: `projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `settings`, `backupMetadata`.
- IDs: native `crypto.randomUUID()`.
- Dates: persist calendar days as `YYYY-MM-DD`, not `Date` objects.
- Migrations: use `db.version(n).stores(...).upgrade(...)`.
- Writes: wrap multi-table changes in Dexie transactions.
- Tests: use `fake-indexeddb` with repository-level tests.

### Encryption stack

Use native Web Crypto only.

Recommended backup format:

```json
{
  "format": "task-management-backup",
  "version": 1,
  "kdf": "PBKDF2-SHA-256",
  "iterations": 600000,
  "salt": "base64",
  "cipher": "AES-256-GCM",
  "iv": "base64",
  "createdAt": "2026-09-26T00:00:00.000Z",
  "payload": "base64"
}
```

Rules:

- Derive encryption key from passphrase with PBKDF2 and random salt.
- Encrypt with AES-GCM and fresh 96-bit IV per backup.
- Store salt and IV with ciphertext; never store passphrase.
- Validate decrypted JSON with Zod before import.
- Never put GitHub token or passphrase in `.env`, source, config, or bundle.
- Prefer session-only token entry or browser password manager. If token persistence becomes necessary, require explicit opt-in and encrypt token locally with user passphrase.

### GitHub backup sync

Use `@octokit/request` against GitHub Contents API.

- Read: `GET /repos/{owner}/{repo}/contents/{path}`.
- Create/update: `PUT /repos/{owner}/{repo}/contents/{path}`.
- Updates require current file `sha`.
- Write `content` as Base64.
- Serialize writes; simultaneous create/update/delete calls conflict.
- Keep encrypted backup artifact under 1 MB if possible. Contents API has full functionality up to 1 MB, raw/object-only behavior from 1 MB to 100 MB, and no support above 100 MB.
- Use fine-grained token with least repository contents permission where possible. Classic/OAuth tokens need `repo` scope for private repos.
- Respect rate limits: personal tokens generally have 5,000 requests/hour; content-generating requests capped separately.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vite | Next.js | Use Next only if server rendering/API routes become real requirements. Current app is static/offline, so Next adds routing/deploy complexity. |
| Dexie | Raw IndexedDB | Use raw IndexedDB only for tiny demos. App needs schema versions, transactions, indexes, and reactive queries. Dexie removes boilerplate safely. |
| Dexie | idb | Use `idb` for small low-level wrappers. Dexie better fits query-heavy task views and live React reads. |
| Native Web Crypto | crypto-js / tweetnacl / libsodium wrappers | Use external crypto only for missing algorithms or audited protocol need. AES-GCM/PBKDF2 are native and secure-context supported. |
| GitHub Contents API | GitHub Gists | Use Gists only if backup should live outside repo. Contents API matches “same repository” requirement. |
| GitHub Contents API | GitHub Actions artifact/releases | Use artifacts/releases for generated build assets, not user-controlled encrypted personal backup from browser. |
| GitHub Pages + Actions | `gh-pages` npm package | Use `gh-pages` only for manual local deploys. Actions is official, reproducible, and avoids developer machine state. |
| Ant Design | MUI / Chakra / custom CSS | Use alternatives only if Ant Design decision changes. Ant Design is fixed and fastest path to rich forms/tables. |
| Zustand optional | Redux Toolkit | Use Redux only if complex cross-cutting state, undo history, or middleware-heavy workflows appear. Current domain state belongs in IndexedDB, not Redux. |
| React Router hash routing | BrowserRouter | BrowserRouter only with SPA fallback configured. GitHub Pages project sites otherwise 404 on deep refresh. |
| Dayjs | date-fns | date-fns is fine, but Dayjs smaller mental model for app-level formatting/ranges. Persist date strings either way. |
| Zod | TypeBox/Ajv | Use Ajv if JSON Schema interoperability or very high validation throughput becomes necessary. Zod is simpler for TypeScript-first app boundaries. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Backend/server/API database | Violates static/offline/no-backend constraints and creates auth/ops burden. | Local IndexedDB plus optional encrypted GitHub backup. |
| Firebase/Supabase/Appwrite | Adds hosted backend, auth, network dependency, and data exposure model not needed for one-person app. | Dexie + GitHub encrypted backup. |
| `localStorage` as database | Synchronous, small, string-only, blocks main thread, unsafe for structured task/planning data. | IndexedDB via Dexie. |
| Raw service worker | Easy to break updates/offline cache; stale SW can cause data-loss UX. | `vite-plugin-pwa` + Workbox generated SW. |
| Auto `skipWaiting` without user prompt | New SW can replace app while old tabs still hold data/state. | `registerType: 'prompt'` and user-controlled reload. |
| `@types/antd` | Ant Design bundles TypeScript definitions. Extra types are obsolete/wrong. | Use bundled Ant Design types. |
| `uuid` package | Browser has native `crypto.randomUUID()` for stable client-generated UUIDs. | `crypto.randomUUID()`. |
| Moment.js | Larger legacy date stack; Dayjs exists as 2KB immutable alternative. | Dayjs or native `Temporal` later if browser support/project target makes it viable. |
| React Query/TanStack Query for local DB | Optimized for server-state fetching/caching; Dexie already owns local persistence/reactivity. | Dexie repositories + `useLiveQuery`. |
| Redux-persist / app state as source of truth | Duplicates IndexedDB and creates migration/cache invalidation bugs. | IndexedDB source of truth; optional Zustand only for ephemeral UI state. |
| Storing GitHub token in Vite env var | `VITE_*` values are bundled and visible to anyone using public GitHub Pages. | User-entered token at runtime; session-only by default. |
| Storing passphrase | Breaks client-side encryption threat model. | Ask when encrypting/decrypting; optionally derive key per session. |
| Unencrypted GitHub backup | Public repo/pages exposure can leak personal workload data. | Web Crypto encrypted backup artifact only. |
| BrowserRouter deep links on GitHub Pages | Project page lacks server rewrite, refresh on deep path can 404. | Hash routing or SPA fallback. |
| PouchDB/CouchDB sync | Solves multi-device distributed sync but adds conflict/replication model outside v1. | Backup sync, not live sync. |

## Stack Patterns by Variant

**If repo is published at `https://<owner>.github.io/task-management/`:**
- Use `base: '/task-management/'`, manifest `scope: '/task-management/'`, and `start_url: '/task-management/'`.
- Because Vite official docs require project-site base path.

**If repo is published as user site or custom domain root:**
- Use `base: '/'`, manifest `scope: '/'`, and `start_url: '/'`.
- Because assets live at root.

**If app starts as one dashboard shell:**
- Skip React Router.
- Use Ant Design `Tabs`, `Segmented`, and local state.
- Because fewer moving parts and no GitHub Pages routing risk.

**If app needs bookmarkable views:**
- Add `react-router@8.4.0` and use hash routing.
- Because GitHub Pages static hosting handles `/#/tasks` refresh safely.

**If backup file grows beyond 1 MB:**
- Compress JSON before encryption with browser `CompressionStream` if target browsers support it, then upload encrypted bytes as Base64.
- Because GitHub Contents API changes behavior after 1 MB.
- Do not add compression dependency until file size actually approaches limit.

**If workload calculations become slow:**
- Move calculation to Web Worker using browser native worker modules.
- Because UI remains responsive without backend.
- Do not add worker framework until profiling proves need.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js 24 LTS | Vite 8.3.1, Vitest 5.0.2, ESLint 10.11.0, Playwright 1.63.0 | Best single engine target. Node 20 is EOL; Node 26 is Current. |
| Vite 8.3.1 | Node `^20.19.0 || >=22.12.0` | Use Node 24 despite Vite still allowing Node 20. |
| Vitest 5.0.2 | Node `^22.12.0 || ^24.0.0 || >=26.0.0`, Vite `^6.4.0 || ^7.0.0 || ^8.0.0` | Confirms Node 24 and Vite 8 pairing. |
| React 19.3.0 | Ant Design 6.6.5 | Ant Design peer requires React >=18; docs say React 16/17 unsupported after antd 6. |
| React 19.3.0 | React Router 8.4.0 | React Router peer requires React/React DOM >=19.2.7. |
| @testing-library/react 16.3.3 | React `^18 || ^19` | Works with React 19. |
| vite-plugin-pwa 1.3.0 | Vite `^3.1 || ^4 || ^5 || ^6 || ^7 || ^8`, Workbox 7.4.1 | Official peer range includes Vite 8. |
| @octokit/request 10.0.16 | Node >=20, browsers with fetch | Browser/static app OK; package says browsers and Node. |
| Ant Design 6.6.5 | TypeScript bundled | Do not install `@types/antd`. |
| Dexie 4.4.6 | Browser IndexedDB | Data tied to same browser and same origin. GitHub Pages URL/base changes can change origin/path behavior expectations, so keep site URL stable. |
| Web Crypto API | HTTPS/localhost secure contexts | GitHub Pages HTTPS satisfies requirement. `file://` does not. |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Core build stack | HIGH | Versions verified from npm registry and official Vite/React docs. |
| UI stack | HIGH | Ant Design docs and npm registry verified version/React peer support. |
| IndexedDB stack | HIGH | Dexie docs verified schema, transactions, React hooks, TypeScript patterns. |
| PWA stack | HIGH | vite-plugin-pwa docs, MDN PWA installability, MDN service worker docs verified. |
| Encryption stack | HIGH | MDN Web Crypto docs verified secure context, AES-GCM/PBKDF2 capabilities. |
| GitHub backup stack | HIGH | GitHub REST Contents/rate-limit/auth docs verified. |
| Zustand recommendation | MEDIUM | npm registry verified version/peer deps; docs fetch partially failed. Recommendation is optional and low-risk. |
| npm version | MEDIUM | npm 12.1.0 observed via npm notice, but not needed as pinned dependency. Node-bundled npm is acceptable. |

## Sources

- https://registry.npmjs.org/react/latest — React 19.3.0 registry version.
- https://registry.npmjs.org/vite/latest — Vite 8.3.1 and Node engine requirement.
- https://registry.npmjs.org/typescript/latest — TypeScript 7.0.2 registry version.
- https://registry.npmjs.org/antd/latest — Ant Design 6.6.5 and React peer dependencies.
- https://registry.npmjs.org/dexie/latest — Dexie 4.4.6 registry version.
- https://registry.npmjs.org/vite-plugin-pwa/latest — vite-plugin-pwa 1.3.0 peer compatibility and Workbox 7.4.1.
- https://registry.npmjs.org/@octokit/request/latest — @octokit/request 10.0.16 browser/Node purpose and dependencies.
- https://registry.npmjs.org/zod/latest — Zod 4.6.5 TypeScript-first validation.
- https://registry.npmjs.org/dayjs/latest — Dayjs 1.11.23 immutable date library summary.
- https://registry.npmjs.org/zustand/latest — Zustand 5.0.15 and peer dependencies.
- https://registry.npmjs.org/react-router/latest — React Router 8.4.0 and React 19 peer requirement.
- https://registry.npmjs.org/vitest/latest — Vitest 5.0.2 Node/Vite peer requirements.
- https://registry.npmjs.org/eslint/latest — ESLint 10.11.0 Node engine.
- https://registry.npmjs.org/prettier/latest — Prettier 3.9.9.
- https://registry.npmjs.org/playwright/latest — Playwright 1.63.0 Node engine.
- https://registry.npmjs.org/@testing-library/react/latest — Testing Library React 16.3.3 React 18/19 peers.
- https://react.dev/blog/2024/12/05/react-19 — React 19 stable release facts and React DOM notes.
- https://vite.dev/guide/ — Vite 8.3.1 docs, React TypeScript templates, Node requirement.
- https://vite.dev/guide/static-deploy.html — Official Vite GitHub Pages deployment and `base` guidance.
- https://ant.design/docs/react/introduce — Ant Design 6, React compatibility, bundled TypeScript definitions.
- https://dexie.org/docs/Tutorial/React — Dexie React hooks, `useLiveQuery`, origin-scoped IndexedDB notes.
- https://dexie.org/docs/API-Reference — Dexie schema/versioning, transactions, bulk/query capabilities.
- https://vite-pwa-org.netlify.app/guide/ — vite-plugin-pwa Workbox/manifest/service worker generation.
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API — Web Crypto secure context, AES-GCM, PBKDF2/HKDF, key handling.
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API — Service worker secure context, cache/proxy behavior, update caveats.
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — PWA installability and manifest requirements.
- https://docs.github.com/en/rest/repos/contents — GitHub Contents API `GET`/`PUT`, `sha`, scopes, file-size behavior.
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api — GitHub REST rate limits and throttling behavior.
- https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api — GitHub REST Authorization header and token safety.
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages — GitHub Pages static hosting facts.
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site — GitHub Pages public/static/backend limitations and entry file behavior.
- https://nodejs.org/en/about/previous-releases — Node 24 LTS, Node 20 EOL, Node 26 Current status.

Context7 note: attempted official Context7 CLI fallback, but environment Node was v20.19.5 and `ctx7@latest` dependency required Node >=22.12.0, causing fetch failure. Official docs and npm registry used instead.

---
*Stack research for: Personal offline-first React/TypeScript task planning PWA on GitHub Pages*
*Researched: 2026-09-26*
