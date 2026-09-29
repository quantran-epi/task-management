# Local Jira CORS Proxy

Zero-dependency Node.js helper for local personal Jira Cloud calls from the GitHub Pages app.

## Start

Build once, then start app preview and proxy together:

```bash
npm run build
npm run preview
```

The app uses Vite's preview URL. The proxy runs at `http://localhost:3001` and stops when preview stops.

## App setting

Set Jira CORS Proxy URL to:

```text
http://localhost:3001/proxy?url=
```

If using a custom port, replace `3001` with that port.

## Scope and safety

- Listens on `127.0.0.1` only.
- Forwards only HTTPS targets under `*.atlassian.net`, `atlassian.net`, `*.atlassian.com`, or `atlassian.com`.
- Strips browser `Origin`, `Referer`, `Host`, and hop-by-hop headers before forwarding.
- Jira token stays user-entered at runtime. Do not write tokens or passphrases to `.env`, source, config, docs, or committed files.

## Test

```bash
npm run test:jira-proxy
```
