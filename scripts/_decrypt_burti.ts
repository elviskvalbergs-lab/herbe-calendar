import { pool } from '../lib/db'
import { decrypt } from '../lib/crypto'

async function main() {
  const { rows } = await pool.query(
    "SELECT id, name, api_base_url, company_code, username, password FROM account_erp_connections ORDER BY id"
  )
  for (const r of rows) {
    let pw: string | null = null
    try {
      if (r.password) {
        const buf = Buffer.isBuffer(r.password) ? r.password : Buffer.from(r.password)
        pw = decrypt(buf)
      }
    } catch (e) {
      pw = `<decrypt error: ${(e as Error).message}>`
    }
    console.log(JSON.stringify({id: r.id, name: r.name, url: r.api_base_url, compno: r.company_code, user: r.username, pw}))
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
