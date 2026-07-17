import type { QueryClient } from "@tanstack/react-query"

import { writeRoomCache } from "@/lib/room-cache"
import { roomKeys } from "@/lib/room-query"
import { equalSplitCents, partsSplitCents } from "@/lib/settle"
import type { SplitMode } from "@/lib/schemas"
import { addExpense } from "@/server/rooms"
import type { ExpenseDto, RoomDto } from "@/server/rooms"

export const ADD_EXPENSE_MUTATION_KEY = ["addExpense"] as const

export type AddExpenseMutationVars = {
  clientId: string
  code: string
  title: string
  category?: string
  amountCents: number
  currency?: string
  paidById: string
  splitMode: SplitMode
  isPersonal: boolean
  splits: Array<{ memberId: string; weight?: number; amountCents?: number }>
}

type OptimisticContext = {
  clientId: string
  code: string
  previousByKey: Array<[readonly unknown[], RoomDto | undefined]>
}

function memberName(room: RoomDto, memberId: string): string {
  return room.members.find((member) => member.id === memberId)?.name ?? "Unknown"
}

function buildOptimisticShares(
  room: RoomDto,
  vars: AddExpenseMutationVars
): ExpenseDto["shares"] {
  if (vars.isPersonal) {
    return [
      {
        memberId: vars.paidById,
        memberName: memberName(room, vars.paidById),
        amountCents: vars.amountCents,
        weight: null,
      },
    ]
  }

  if (vars.splitMode === "PARTS") {
    return partsSplitCents(
      vars.amountCents,
      vars.splits.map((split) => ({
        memberId: split.memberId,
        weight: split.weight ?? 0,
      }))
    ).map((part) => ({
      memberId: part.memberId,
      memberName: memberName(room, part.memberId),
      amountCents: part.amountCents,
      weight: part.weight,
    }))
  }

  if (vars.splitMode === "AMOUNT") {
    return vars.splits.map((split) => ({
      memberId: split.memberId,
      memberName: memberName(room, split.memberId),
      amountCents: split.amountCents ?? 0,
      weight: null,
    }))
  }

  return equalSplitCents(
    vars.amountCents,
    vars.splits.map((split) => split.memberId)
  ).map((share) => ({
    memberId: share.memberId,
    memberName: memberName(room, share.memberId),
    amountCents: share.amountCents,
    weight: null,
  }))
}

export function buildOptimisticExpense(
  room: RoomDto,
  vars: AddExpenseMutationVars
): ExpenseDto {
  const splitMode = vars.isPersonal ? "EQUAL" : vars.splitMode
  return {
    id: vars.clientId,
    title: vars.title,
    amountCents: vars.amountCents,
    category: vars.category ?? null,
    currency: vars.currency ?? room.currency,
    splitMode,
    isPersonal: vars.isPersonal,
    redacted: false,
    paidById: vars.paidById,
    paidByName: memberName(room, vars.paidById),
    createdAt: new Date().toISOString(),
    shares: buildOptimisticShares(room, vars),
  }
}

function patchRoomCaches(
  queryClient: QueryClient,
  code: string,
  vars: AddExpenseMutationVars,
  updater: (room: RoomDto) => RoomDto
): Array<[readonly unknown[], RoomDto | undefined]> {
  const previousByKey: Array<[readonly unknown[], RoomDto | undefined]> = []
  const entries = queryClient.getQueriesData<RoomDto>({
    queryKey: roomKeys.room(code),
  })

  for (const [queryKey, data] of entries) {
    previousByKey.push([queryKey, data])
    if (!data) continue

    const viewer = queryKey[2]
    if (
      vars.isPersonal &&
      typeof viewer === "string" &&
      viewer !== "anon" &&
      viewer !== vars.paidById
    ) {
      continue
    }

    const next = updater(data)
    queryClient.setQueryData(queryKey, next)
    writeRoomCache(
      code,
      viewer === "anon" || typeof viewer !== "string" ? null : viewer,
      next
    )
  }

  return previousByKey
}

function restoreRoomCaches(
  queryClient: QueryClient,
  code: string,
  previousByKey: Array<[readonly unknown[], RoomDto | undefined]>
) {
  for (const [queryKey, data] of previousByKey) {
    queryClient.setQueryData(queryKey, data)
    const viewer = queryKey[2]
    if (data) {
      writeRoomCache(
        code,
        viewer === "anon" || typeof viewer !== "string" ? null : viewer,
        data
      )
    }
  }
}

/** Register defaults so paused mutations can resume after reload. */
export function registerAddExpenseMutationDefaults(
  queryClient: QueryClient
): void {
  queryClient.setMutationDefaults(ADD_EXPENSE_MUTATION_KEY, {
    mutationFn: (vars: AddExpenseMutationVars) => {
      const { clientId: _clientId, ...input } = vars
      return addExpense({ data: input })
    },
    scope: { id: "addExpense" },
    retry: 3,
    networkMode: "online",
    onMutate: async (vars): Promise<OptimisticContext> => {
      await queryClient.cancelQueries({ queryKey: roomKeys.room(vars.code) })

      const roomEntry = queryClient
        .getQueriesData<RoomDto>({ queryKey: roomKeys.room(vars.code) })
        .find(([, data]) => Boolean(data))
      const room = roomEntry?.[1]
      if (!room) {
        return { clientId: vars.clientId, code: vars.code, previousByKey: [] }
      }

      const optimistic = buildOptimisticExpense(room, vars)
      const previousByKey = patchRoomCaches(
        queryClient,
        vars.code,
        vars,
        (current) => ({
          ...current,
          expenses: [
            optimistic,
            ...current.expenses.filter((expense) => expense.id !== vars.clientId),
          ],
        })
      )

      return { clientId: vars.clientId, code: vars.code, previousByKey }
    },
    onSuccess: async (result, vars) => {
      patchRoomCaches(queryClient, vars.code, vars, (current) => ({
        ...current,
        expenses: [
          result,
          ...current.expenses.filter(
            (expense) =>
              expense.id !== vars.clientId && expense.id !== result.id
          ),
        ],
      }))
      await queryClient.invalidateQueries({ queryKey: roomKeys.room(vars.code) })
    },
    onError: (_error, vars, onMutateResult) => {
      const previousByKey = onMutateResult?.previousByKey
      if (previousByKey && previousByKey.length > 0) {
        restoreRoomCaches(queryClient, vars.code, previousByKey)
        return
      }
      patchRoomCaches(queryClient, vars.code, vars, (current) => ({
        ...current,
        expenses: current.expenses.filter(
          (expense) => expense.id !== vars.clientId
        ),
      }))
    },
  })
}
