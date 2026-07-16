import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
  pgPool?: Pool
}

/**
 * Keep the pool tiny for serverless (Vercel) + Neon.
 * Many concurrent Pool instances exhaust Neon connection limits and cost.
 */
function createPool(connectionString: string): Pool {
  const isNeon = connectionString.includes("neon.tech")
  const wantsSsl =
    connectionString.includes("sslmode=require") ||
    isNeon ||
    connectionString.includes("prisma.io")

  return new Pool({
    connectionString,
    // 1 connection per warm isolate is enough for thin CRUD.
    max: Number.parseInt(process.env.PG_POOL_MAX ?? "1", 10) || 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: wantsSsl ? { rejectUnauthorized: isNeon } : undefined,
  })
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const pool = globalForPrisma.pgPool ?? createPool(connectionString)
  globalForPrisma.pgPool = pool

  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
globalForPrisma.prisma = prisma
