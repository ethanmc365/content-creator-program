// One-shot database setup: applies the schema migration and (optionally)
// the seed file to your Supabase Postgres.
//
// Usage:
//   DB_URL="postgresql://..." node scripts/db-setup.mjs [--seed]
//
// Notes:
//  * Use the SESSION POOLER connection string (IPv4) if your network has no
//    IPv6 — find it under Connect → Session pooler in the Supabase dashboard.
//  * The password is passed via the DB_URL env var so it never lands in a file.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbUrl = process.env.DB_URL
if (!dbUrl) {
  console.error('Set DB_URL to your Postgres connection string first.')
  process.exit(1)
}

const files = ['supabase/migrations/001_initial_schema.sql']
if (process.argv.includes('--seed')) files.push('supabase/seed.sql')

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  for (const file of files) {
    process.stdout.write(`Applying ${file} … `)
    await client.query(readFileSync(join(root, file), 'utf8'))
    console.log('✓')
  }
  console.log('Database setup complete.')
} catch (err) {
  console.error(`\nFailed: ${err.message}`)
  if (err.position) console.error(`(at character position ${err.position})`)
  process.exitCode = 1
} finally {
  await client.end()
}
