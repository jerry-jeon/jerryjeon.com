import { createClient, type Client } from '@libsql/client'
import fs from 'node:fs'

// Turso in production; a local SQLite file when TURSO_DATABASE_URL isn't set.
const env = (key: string): string | undefined => process.env[key] ?? import.meta.env[key]
const LOCAL_DB = 'file:.data/stats.db'

let client: Client | undefined
let ready: Promise<unknown> | undefined

export async function db() {
  if (!client) {
    const url = env('TURSO_DATABASE_URL') ?? LOCAL_DB
    if (url === LOCAL_DB) fs.mkdirSync('.data', { recursive: true })
    client = createClient({ url, authToken: env('TURSO_AUTH_TOKEN') })
  }
  ready ??= client.batch(
    [
      `CREATE TABLE IF NOT EXISTS hits (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        path TEXT NOT NULL,
        referrer TEXT,
        country TEXT,
        visitor TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS hits_day ON hits (day)',
    ],
    'write',
  )
  await ready
  return client
}

export const statsSalt = () => env('STATS_SALT') ?? 'jerryjeon.com'
