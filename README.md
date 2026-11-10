# Split

Trip cost PWA — rooms, expenses, balances, optional receipt OCR. Sign in to keep yours and scan tickets.

Host: `split.ailabs.sv`

## Stack

- TanStack Start (React + file router)
- Tailwind v4 + shadcn base-mira + Hugeicons
- Neon Postgres + Prisma
- vite-plugin-pwa (installable shell; offline add-expense via TanStack Query persist + sync on reconnect)
- OpenAI vision (`gpt-5-mini`) for receipt draft-fill

## Setup

```bash
pnpm install
cp .env.example .env
# set DATABASE_URL (Neon) and optional OPENAI_API_KEY
pnpm db:migrate
pnpm dev
```

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Local app on :3000 |
| `pnpm build` | `prisma generate && vite build` (Nitro → `.output` / Vercel BOA) |
| `pnpm start` | Run local Nitro node-server build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (settle math) |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:generate` | `prisma generate` |

## Product

1. **/** — create a room (name, currency, members) or join by code **and your name**
2. **/r/$code** — who-are-you gate (pick existing or add name) → balances + expenses
3. **/r/$code?as=Name** — personal link that claims you on a new device
4. **/r/$code/new** — fast add expense; optional scan (scan needs network)
5. **/r/$code/settle** — “X owes Y $Z” transfers

Join-by-code stays open for guests. Sign in (Clerk, same app as ailabs.sv) to keep dinners and trips across devices and to scan tickets.

Offline: after opening a trip online once, you can add expenses without a connection. They sync when you’re back online (header sync icon shows status).

## Cost / connection hygiene

- Postgres: one shared `pg` Pool per isolate (`PG_POOL_MAX=1`), short idle timeout, Neon **pooled** `DATABASE_URL`
- OCR: requires a signed-in user, a real room code, IP + room + user rate limits, ~1MB image cap, 30s timeout; OpenAI vision structured JSON
- Writes (create/join/add expense): light per-IP rate limits

## Deploy

TanStack Start → **Nitro** → Vercel (auto-detects `vercel` preset when `VERCEL=1`).

1. Link the repo in Vercel (framework: Other / Nitro Build Output API)
2. Set env: `DATABASE_URL` (Neon pooled), optional `DIRECT_URL`, optional `OPENAI_API_KEY`, plus `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the existing ailabs.sv Clerk application. Set `CLERK_SIGN_IN_URL=/sign-in`. Do **not** set `CLERK_SIGN_UP_URL` (that splits sign-in and sign-up; `/sign-up` is the same combined screen).
3. Build: `pnpm build` (runs `prisma generate` + `vite build`)
4. Run migrations against Neon once: `pnpm exec prisma migrate deploy`
5. Point DNS `split.ailabs.sv` at the deployment

Local prod smoke: `pnpm build && pnpm start`
