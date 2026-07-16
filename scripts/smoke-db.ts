import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { equalSplitCents } from "../src/lib/settle"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const code = `SMK${Math.floor(Math.random() * 10000)}`
const room = await prisma.room.create({
  data: {
    code,
    name: "Smoke Trip",
    currency: "USD",
    members: { create: [{ name: "Walter" }, { name: "Daniela" }] },
  },
  include: { members: true },
})

const [walter, daniela] = room.members
if (!walter || !daniela) throw new Error("members missing")

const shares = equalSplitCents(5000, [walter.id, daniela.id])
await prisma.expense.create({
  data: {
    roomId: room.id,
    title: "Lunch",
    amountCents: 5000,
    paidById: walter.id,
    shares: { create: shares },
  },
})

const loaded = await prisma.room.findUnique({
  where: { code },
  include: { expenses: { include: { shares: true } }, members: true },
})
console.log(
  JSON.stringify(
    {
      code: loaded?.code,
      expenses: loaded?.expenses.length,
      shares: loaded?.expenses[0]?.shares.length,
    },
    null,
    2
  )
)

await prisma.room.delete({ where: { id: room.id } })
await prisma.$disconnect()
await pool.end()
console.log("smoke ok")
