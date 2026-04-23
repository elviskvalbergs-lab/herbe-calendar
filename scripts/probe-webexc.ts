import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

async function main() {
  const r = await pool.query("SELECT name, api_base_url, company_code, username, password FROM account_erp_connections WHERE username IS NOT NULL")
  for (const row of r.rows) {
    const user = row.username as string
    const pass = decrypt(row.password)
    const origin = new URL(row.api_base_url).origin
    const url = `${origin}/WebExcellentAPI.hal?compno=${row.company_code}&action=getactivitytypes`
    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
    const res = await fetch(url, { headers: { Authorization: auth } })
    const body = (await res.text()).slice(0, 400)
    console.log(`${row.name} (user=${user}, compno=${row.company_code}) -> ${res.status}`)
    console.log(`  ${url}`)
    console.log(`  body: ${body}`)
  }
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
