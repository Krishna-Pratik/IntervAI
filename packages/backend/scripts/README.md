# Backend scripts

These are one-off diagnostic scripts. They are not part of the API server
and are not loaded by `src/index.ts`.

## verify-config.ts
Dumps the loaded `Config` object — confirms every env var in
`packages/backend/.env` is reachable and that the config layer's
required-key validation isn't going to throw at boot time.

```
npx tsx scripts/verify-config.ts
```

## ping-services.ts
Live ping every external service. Each block makes a real read-only API
call against the configured key, prints ✓/✗ with latency and a short
status payload, and never mutates external state. Read the script header
for what each check does.

```
npx tsx scripts/ping-services.ts
```

Use this after rotating a key, when a feature starts failing, or as
a quick "everything is green" smoke test before a demo.
