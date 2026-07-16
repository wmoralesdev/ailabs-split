# Split

Trip cost PWA — rooms, expenses, balances, optional receipt OCR. No accounts.

Host: `split.ailabs.sv`

## Stack

- TanStack Start (React + file router)
- Tailwind v4 + shadcn base-mira + Hugeicons
- Neon Postgres + Prisma
- vite-plugin-pwa (installable shell; data needs network)
- Mistral OCR for receipt draft-fill

## Setup

```bash
pnpm install
cp .env.example .env
# set DATABASE_URL (Neon) and optional MISTRAL_API_KEY
pnpm db:migrate
pnpm dev
```

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Local app on :3000 |
| `pnpm build` | `prisma generate && vite build` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (settle math) |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:generate` | `prisma generate` |

## Product

1. **/** — create a room (name, currency, members) or join by code **and your name**
2. **/r/$code** — who-are-you gate (pick existing or add name) → balances + expenses
3. **/r/$code?as=Name** — personal link that claims you on a new device
4. **/r/$code/new** — fast add expense; optional scan
5. **/r/$code/settle** — “X owes Y $Z” transfers

Room code is the only access control. Your display name is how you reclaim yourself across devices; localStorage only remembers the last pick on that browser.

## Deploy

Vercel (or same host as ailabs). Env: `DATABASE_URL`, optional `DIRECT_URL`, optional `MISTRAL_API_KEY`. Point DNS `split.ailabs.sv` at the deployment.
