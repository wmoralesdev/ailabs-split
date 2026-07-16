import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
  pgPool?: Pool
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      ssl:
        connectionString.includes("sslmode=require") ||
        connectionString.includes("neon.tech") ||
        connectionString.includes("prisma.io")
          ? { rejectUnauthorized: false }
          : undefined,
    })

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool
  }

  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
