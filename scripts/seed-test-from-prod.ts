#!/usr/bin/env npx tsx
/**
 * Seed test Herbe from production data for a specific person + date range.
 *
 * What it does:
 *   1. Reads OAuth tokens from both prod and test databases
 *   2. Fetches EKS activities from PROD for the configured period
 *   3. Fetches EKS activities from TEST for the same period
 *   4. For each TEST activity: shows label + DELETE URL, asks confirmation, deletes
 *   5. For each PROD activity: shows label + CREATE URL, asks confirmation, creates in TEST
 *
 * Usage:
 *   npx tsx scripts/seed-test-from-prod.ts
 *
 * Env files:
 *   .env.production.local  — prod Herbe + DB credentials
 *   .env.local             — test Herbe + DB credentials
 */

import { createInterface } from 'node:readline/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { createGunzip } from 'node:zlib'
import type { Readable } from 'node:stream'
import { readFileSync, existsSync } from 'node:fs'
import { Pool } from 'pg'

// ─── Configuration (overridable via CLI args) ──────────────────────────────────
// Usage: npx tsx scripts/seed-test-from-prod.ts [dateFrom] [dateTo] [personCode]
// Example: npx tsx scripts/seed-test-from-prod.ts 2026-03-17 2026-03-18 EKS

const [,, argFrom, argTo, argPerson] = process.argv
const DATE_FROM   = argFrom  ?? '2026-03-17'
const DATE_TO     = argTo    ?? '2026-03-18'
const PERSON_CODE = argPerson ?? 'EKS'

// ─── Env file parser ───────────────────────────────────────────────────────────

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`Env file not found: ${path}\nRun: vercel env pull ${path}`)
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

// ─── Raw HTTP helper (mirrors lib/herbe/client.ts) ─────────────────────────────

async function herbeRaw(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const makeRequest = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = makeRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: (opts.method ?? 'GET').toUpperCase(),
        headers: opts.headers ?? {},
        insecureHTTPParser: true,
        rejectUnauthorized: false,
      } as Parameters<typeof httpsRequest>[0],
      (res) => {
        const encoding = res.headers['content-encoding']
        const stream = (encoding === 'gzip' ? res.pipe(createGunzip()) : res) as Readable
        const chunks: Buffer[] = []
        const resHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) resHeaders[k] = Array.isArray(v) ? v.join(', ') : v
        }
        stream.on('data', (c: Buffer) => chunks.push(c))
        stream.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8'), headers: resHeaders }))
        stream.on('error', reject)
      }
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function herbeCall(
  url: string,
  token: string,
  opts: { method?: string; body?: string; contentType?: string } = {}
): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (opts.body) headers['Content-Type'] = opts.contentType ?? 'application/json'
  const { status, text, headers: resHeaders } = await herbeRaw(url, { method: opts.method, headers, body: opts.body })
  let data: unknown = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  return { status, data, headers: resHeaders }
}

// ─── OAuth token helpers ───────────────────────────────────────────────────────

// NOTE: hardcoded to match lib/herbe/config.ts — the HERBE_TOKEN_URL env var uses
// 'oauth/token' (slash) but the actual working endpoint is 'oauth-token' (hyphen).
const TOKEN_ENDPOINT = 'https://standard-id.hansaworld.com/oauth-token'

async function getStoredTokens(dbUrl: string) {
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  try {
    const res = await pool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [['herbe_access_token', 'herbe_refresh_token', 'herbe_token_expires_at']]
    )
    const map: Record<string, string> = {}
    for (const row of res.rows as { key: string; value: string }[]) map[row.key] = row.value
    if (!map['herbe_access_token'] || !map['herbe_refresh_token']) return null
    return {
      accessToken: map['herbe_access_token'],
      refreshToken: map['herbe_refresh_token'],
      expiresAt: Number(map['herbe_token_expires_at'] ?? 0),
    }
  } finally {
    await pool.end()
  }
}

async function doRefresh(clientId: string, clientSecret: string, refreshTok: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTok,
  }).toString()
  const { status, text } = await herbeRaw(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (status < 200 || status >= 300) {
    throw new Error(`Token refresh failed (HTTP ${status}):\n${text.slice(0, 400)}`)
  }
  // Guard against HTML error pages returned with 200
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      `Token refresh returned HTML instead of JSON (server returned a web page).\n` +
      `This usually means the refresh token is stale or the client credentials changed.\n` +
      `Fix: re-run the Herbe OAuth setup flow for this environment to get a fresh token.\n\n` +
      `Response preview:\n${text.slice(0, 300)}`
    )
  }
  return JSON.parse(text) as { access_token: string; expires_in?: number }
}

async function getValidToken(env: Record<string, string>, label: string): Promise<string> {
  const dbUrl = env['DATABASE_URL']
  if (!dbUrl) throw new Error(`DATABASE_URL missing in ${label} env`)

  const stored = await getStoredTokens(dbUrl)
  if (!stored) throw new Error(`No Herbe tokens in ${label} DB. Complete the OAuth setup flow first.`)

  if (Date.now() < stored.expiresAt - 60_000) {
    const mins = Math.round((stored.expiresAt - Date.now()) / 60_000)
    console.log(`  [${label}] Using stored token (expires in ${mins}m)`)
    return stored.accessToken
  }

  console.log(`  [${label}] Token expired — refreshing...`)
  const clientId = env['HERBE_CLIENT_ID'] ?? ''
  const clientSecret = env['HERBE_CLIENT_SECRET'] ?? ''
  if (!clientId || !clientSecret) throw new Error(`HERBE_CLIENT_ID / HERBE_CLIENT_SECRET missing in ${label} env`)
  const refreshed = await doRefresh(clientId, clientSecret, stored.refreshToken)
  console.log(`  [${label}] Token refreshed`)
  return refreshed.access_token
}

// ─── Activity helpers ──────────────────────────────────────────────────────────

type HerbeRecord = Record<string, unknown>

async function fetchActivities(
  baseUrl: string, company: string, token: string,
  personCode: string, dateFrom: string, dateTo: string
): Promise<HerbeRecord[]> {
  const qs = new URLSearchParams({ sort: 'TransDate', range: `${dateFrom}:${dateTo}`, limit: '1000', offset: '0' })
  const url = `${baseUrl}/${company}/ActVc?${qs}`
  const { status, data } = await herbeCall(url, token)
  if (status >= 300) throw new Error(`Herbe fetch failed (${status}) from ${baseUrl}`)
  const records = ((data as HerbeRecord)?.data as HerbeRecord)?.['ActVc'] as HerbeRecord[] ?? []
  return records.filter(r => {
    const persons = String(r['MainPersons'] ?? '').split(',').map(s => s.trim())
    return persons.includes(personCode)
  })
}

function formatActivity(r: HerbeRecord): string {
  const date = String(r['TransDate'] ?? '?')
  const from = String(r['StartTime'] ?? '').slice(0, 5)
  const to   = String(r['EndTime']   ?? '').slice(0, 5)
  const type = r['ActType'] ? ` [${r['ActType']}]` : ''
  const desc = String(r['Comment'] ?? '').slice(0, 60) || '(no description)'
  const id   = r['SerNr'] ? `  #${r['SerNr']}` : ''
  const cu   = r['CUCode'] ? `  CU:${r['CUCode']}` : ''
  const pr   = r['PRCode'] ? `  PR:${r['PRCode']}` : ''
  return `${date}  ${from}–${to}${type}  "${desc}"${cu}${pr}${id}`
}

const COPY_FIELDS = [
  'TransDate', 'StartTime', 'EndTime', 'Comment', 'ActType',
  'MainPersons', 'CUCode', 'PRCode', 'ItemCode', 'AccessGroup',
]

function buildFormBody(r: HerbeRecord): string {
  const ROW_FIELDS = new Set(['Text'])
  const payload: HerbeRecord = {}
  for (const f of COPY_FIELDS) {
    if (r[f] !== undefined && r[f] !== null && String(r[f]) !== '') payload[f] = r[f]
  }
  if (r['Text']) payload['Text'] = r['Text']

  return Object.entries(payload)
    .map(([k, v]) => {
      const prefix = ROW_FIELDS.has(k) ? 'set_row_field.0' : 'set_field'
      return `${prefix}.${k}=${encodeURIComponent(String(v))}`
    })
    .join('&')
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const prodEnv = loadEnvFile('.env.production.local')
  const testEnv = loadEnvFile('.env.local')

  const prodBase    = prodEnv['HERBE_API_BASE_URL']!.replace(/\/$/, '')
  const testBase    = testEnv['HERBE_API_BASE_URL']!.replace(/\/$/, '')
  const prodCompany = prodEnv['HERBE_COMPANY_CODE'] ?? '3'
  const testCompany = testEnv['HERBE_COMPANY_CODE'] ?? '3'

  console.log('\n' + '═'.repeat(64))
  console.log(`  Person : ${PERSON_CODE}`)
  console.log(`  Period : ${DATE_FROM} – ${DATE_TO}`)
  console.log('  ─')
  console.log(`  PROD   : ${prodBase}/${prodCompany}`)
  console.log(`  TEST   : ${testBase}/${testCompany}`)
  console.log('═'.repeat(64) + '\n')

  console.log('Obtaining OAuth tokens...')
  const prodToken = await getValidToken(prodEnv, 'PROD')
  const testToken = await getValidToken(testEnv, 'TEST')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  console.log(`\nFetching from PROD (${prodBase})...`)
  const prodActs = await fetchActivities(prodBase, prodCompany, prodToken, PERSON_CODE, DATE_FROM, DATE_TO)
  console.log(`  → ${prodActs.length} activities found`)

  console.log(`Fetching from TEST (${testBase})...`)
  const testActs = await fetchActivities(testBase, testCompany, testToken, PERSON_CODE, DATE_FROM, DATE_TO)
  console.log(`  → ${testActs.length} activities found`)

  // ── Step 1: delete test activities ────────────────────────────────────────
  console.log('\n' + '─'.repeat(64))
  console.log(`STEP 1 / 2  —  Delete from TEST`)
  console.log(`  Base URL : ${testBase}/${testCompany}/ActVc/<SerNr>  [DELETE]`)
  console.log(`  Tip      : type Y (uppercase) to confirm all remaining without asking`)
  console.log('─'.repeat(64))

  if (testActs.length === 0) {
    console.log('  (nothing to delete)')
  } else {
    let deleted = 0
    let yesToAll = false
    for (const act of testActs) {
      const id = String(act['SerNr'])
      const deleteUrl = `${testBase}/${testCompany}/ActVc/${id}`
      console.log(`\n  Activity : ${formatActivity(act)}`)
      console.log(`  DELETE   : ${deleteUrl}`)

      let confirm = yesToAll
      if (!yesToAll) {
        const ans = await rl.question('  Delete?   (y / Y=all / N / q=quit) › ')
        if (ans === 'q' || ans === 'Q') { console.log('\nAborted.'); rl.close(); process.exit(0) }
        if (ans === 'Y') { yesToAll = true; confirm = true; console.log('  → Yes to all remaining') }
        else if (ans === 'y') { confirm = true }
        else { console.log('  → Skipped'); continue }
      } else {
        console.log('  → Auto-confirmed (Y to all)')
      }

      if (confirm) {
        const { status, data, headers } = await herbeCall(deleteUrl, testToken, { method: 'DELETE' })
        if (status >= 200 && status < 300) {
          console.log(`  ✓ Deleted (HTTP ${status})`)
          deleted++
        } else if (status === 405) {
          const allowed = headers['allow'] ?? headers['Allow'] ?? '?'
          console.log(`  ✗ HTTP 405 — DELETE not allowed by this server. Allowed methods: ${allowed}`)
          console.log(`  → Tip: delete these activities manually in the Herbe UI and re-run, or check if the test server supports a different delete method.`)
          break
        } else {
          console.log(`  ✗ Failed (HTTP ${status}): ${JSON.stringify(data).slice(0, 120)}`)
        }
      }
    }
    console.log(`\n  Deleted ${deleted} / ${testActs.length}`)
  }

  // ── Step 2: create prod activities in test ─────────────────────────────────
  console.log('\n' + '─'.repeat(64))
  console.log(`STEP 2 / 2  —  Create in TEST (copied from PROD)`)
  console.log(`  Base URL : ${testBase}/${testCompany}/ActVc  [POST]`)
  console.log(`  Tip      : type Y (uppercase) to confirm all remaining without asking`)
  console.log('─'.repeat(64))

  if (prodActs.length === 0) {
    console.log('  (nothing to copy from PROD)')
  } else {
    let created = 0
    let yesToAll = false
    const createUrl = `${testBase}/${testCompany}/ActVc`
    for (const act of prodActs) {
      console.log(`\n  Activity : ${formatActivity(act)}`)
      console.log(`  POST     : ${createUrl}`)

      let confirm = yesToAll
      if (!yesToAll) {
        const ans = await rl.question('  Create?   (y / Y=all / N / q=quit) › ')
        if (ans === 'q' || ans === 'Q') { console.log('\nAborted.'); rl.close(); process.exit(0) }
        if (ans === 'Y') { yesToAll = true; confirm = true; console.log('  → Yes to all remaining') }
        else if (ans === 'y') { confirm = true }
        else { console.log('  → Skipped'); continue }
      } else {
        console.log('  → Auto-confirmed (Y to all)')
      }

      if (confirm) {
        const { status, data } = await herbeCall(createUrl, testToken, {
          method: 'POST',
          body: buildFormBody(act),
          contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
        })
        if (status >= 200 && status < 300) {
          const newRec = ((data as HerbeRecord)?.data as HerbeRecord)?.['ActVc'] as HerbeRecord[] | undefined
          const newId = newRec?.[0]?.['SerNr']
          if (newId) {
            console.log(`  ✓ Created as #${newId}`)
          } else {
            console.log(`  ✓ Created (HTTP ${status}) — response: ${JSON.stringify(data).slice(0, 300)}`)
          }
          created++
        } else {
          console.log(`  ✗ Failed (HTTP ${status}): ${JSON.stringify(data).slice(0, 200)}`)
        }
      }
    }
    console.log(`\n  Created ${created} / ${prodActs.length}`)
  }

  console.log('\n' + '═'.repeat(64))
  console.log('Done.')
  console.log('═'.repeat(64) + '\n')
  rl.close()
}

main().catch(e => { console.error('\n' + String(e)); process.exit(1) })
