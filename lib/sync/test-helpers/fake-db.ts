/**
 * A recording stand-in for the Supabase client. Every chained call
 * (`.from('jobs').select(...).eq(...)`) is logged as an op, and awaiting the
 * chain calls `handler(table, ops)` for the result -- so a test asserts on
 * exactly which table was touched and how, and scripts what comes back.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Op {
  name: string
  args: unknown[]
}

export interface FakeResult {
  data?: unknown
  error?: { message: string } | null
  count?: number | null
}

export type Handler = (table: string, ops: Op[]) => FakeResult | undefined

export interface LoggedCall {
  table: string
  ops: Op[]
}

export function fakeDb(handler: Handler = () => undefined) {
  const log: LoggedCall[] = []

  const db = {
    from(table: string) {
      const ops: Op[] = []
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
                log.push({ table, ops })
                const out = handler(table, ops) ?? {}
                return Promise.resolve({ data: null, error: null, count: null, ...out }).then(resolve, reject)
              }
            }
            return (...args: unknown[]) => {
              ops.push({ name: String(prop), args })
              return builder
            }
          },
        }
      )
      return builder
    },
  }

  return { db: db as unknown as SupabaseClient, log }
}

export const opNames = (call: LoggedCall) => call.ops.map((o) => o.name)
export const callsTo = (log: LoggedCall[], table: string, op: string) =>
  log.filter((c) => c.table === table && c.ops.some((o) => o.name === op))
