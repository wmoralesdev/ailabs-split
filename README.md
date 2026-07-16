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

1. **/** — create a room (name, currency, members) or join by code  
2. **/r/$code** — balances + expense list  
3. **/r/$code/new** — fast add expense; optional scan  
4. **/r/$code/settle** — “X owes Y $Z” transfers  

Room code (6–8 chars) is the only access control. Member identity is a display name remembered in `localStorage`.

## Deploy

Vercel (or same host as ailabs). Env: `DATABASE_URL`, optional `DIRECT_URL`, optional `MISTRAL_API_KEY`. Point DNS `split.ailabs.sv` at the deployment.
