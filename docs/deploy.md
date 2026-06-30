# Inkwell Deployment Guide

Inkwell has two separate deployments that must both be live for the app to work:

| Service | Platform | Command |
|---|---|------|
| Next.js app | Vercel | `npm run deploy:vercel` |
| Realtime room (Durable Object) | Cloudflare Workers | `npm run deploy:party` |

---

## Prerequisites

- [Vercel CLI](https://vercel.com/docs/cli) — already in devDependencies (`npm install`)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — already in devDependencies
- A Neon PostgreSQL database (or any Postgres provider)
- A Cloudflare account (free tier works)

---

## First-time setup

### 1. Set environment variables on Vercel

> **Windows users:** Always use **Bash / Git Bash** (not PowerShell) to pipe secrets to the Vercel CLI.  
> PowerShell adds `\r\n` line endings; the CLI strips `\n` but leaves `\r`, which corrupts stored values and causes `Invalid URL` errors at runtime.

Log in and link the project once:

```bash
npx vercel login
npx vercel          # first run — links repo, creates project, gives you the production URL
```

Note the production URL printed at the end (e.g. `https://inkwell-weld.vercel.app`).

Push each environment variable using `printf` (no trailing newline):

```bash
# Run each line in Bash — replace <VALUE> with the actual secret

printf '%s' "<DATABASE_URL>"              | npx vercel env add DATABASE_URL              production --force
printf '%s' "<AUTH_SECRET>"               | npx vercel env add AUTH_SECRET               production --force
printf '%s' "https://<your-vercel-url>"  | npx vercel env add AUTH_URL                  production --force
printf '%s' "https://<your-vercel-url>"  | npx vercel env add NEXTAUTH_URL               production --force
printf '%s' "https://<your-vercel-url>"  | npx vercel env add APP_URL                    production --force
printf '%s' "<worker>.workers.dev"        | npx vercel env add NEXT_PUBLIC_PARTYKIT_HOST  production --force
printf '%s' "<PARTYKIT_SECRET>"           | npx vercel env add PARTYKIT_SECRET            production --force
printf '%s' "<GOOGLE_GENERATIVE_AI_KEY>"  | npx vercel env add GOOGLE_GENERATIVE_AI_API_KEY production --force
```

Variable reference:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (`postgresql://...`) |
| `AUTH_SECRET` | Random secret for NextAuth session signing |
| `AUTH_URL` | Production Vercel URL with `https://` (NextAuth v5) |
| `NEXTAUTH_URL` | Same as `AUTH_URL` (backwards-compat) |
| `APP_URL` | Same as `AUTH_URL` (used by the Cloudflare Worker for CORS) |
| `NEXT_PUBLIC_PARTYKIT_HOST` | Cloudflare Worker host, **no protocol** (e.g. `inkwell.you.workers.dev`) |
| `PARTYKIT_SECRET` | Shared HS256 secret — must match the Worker's `PARTYKIT_SECRET` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studio key for the AI feature |

### 2. Set the Worker secret

```bash
npx wrangler secret put PARTYKIT_SECRET
# paste the same value used for PARTYKIT_SECRET on Vercel
```

### 3. Update `wrangler.jsonc`

Set `APP_URL` to your production Vercel URL:

```jsonc
"vars": {
  "APP_URL": "https://<your-vercel-url>"
}
```

---

## Deploying

Always deploy the Worker **before or alongside** the Next.js app so the realtime room is available when users open documents.

```bash
# Deploy the Cloudflare Worker (realtime room)
npm run deploy:party

# Deploy the Next.js app to Vercel
npm run deploy:vercel
```

Both commands are independent; order does not strictly matter for a routine redeploy.

---

## Re-deploying after code changes

```bash
# Next.js changes only
npm run deploy:vercel

# Worker (party/index.ts) changes only
npm run deploy:party

# Both changed
npm run deploy:party && npm run deploy:vercel
```

---

## Updating environment variables

If you need to change a secret (e.g. rotate `AUTH_SECRET`), always use Bash `printf`:

```bash
printf '%s' "<new-value>" | npx vercel env add <VAR_NAME> production --force
```

Then redeploy so the new value is picked up:

```bash
npm run deploy:vercel
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `500 MIDDLEWARE_INVOCATION_FAILED` | `AUTH_URL` / `NEXTAUTH_URL` stored with `\r` (PowerShell pipe) | Re-push all env vars using Bash `printf '%s'` |
| `Invalid URL` at build time | `DATABASE_URL` stored with `\r` | Same fix as above |
| WebSocket auth errors in browser console | `PARTYKIT_SECRET` mismatch between Vercel and Worker | Confirm both use the same value; re-push and redeploy |
| Sign-in redirects to wrong URL | `NEXTAUTH_URL` / `AUTH_URL` not set or incorrect | Verify both point to the production Vercel URL with `https://` |
| AI feature returns 403 | Invalid or missing `GOOGLE_GENERATIVE_AI_API_KEY` | Re-push the key; confirm it is a Google AI Studio key (not Vertex) |
