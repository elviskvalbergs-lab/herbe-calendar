/**
 * Builds a hansa:// deep link to open a record in the Standard ERP desktop client.
 * Format: hansa://UUID/v1/COMPANY/Register/RecordId
 *
 * Requires env var:
 *   NEXT_PUBLIC_HERBE_SERP_UUID — server UUID from Standard ERP Server → Preferences → Server UUID
 *
 * The company number is passed in at call time (sourced from HERBE_COMPANY_CODE on the server).
 */

const SERP_UUID = process.env.NEXT_PUBLIC_HERBE_SERP_UUID

export const hasSerpConfig = !!SERP_UUID

export function serpLink(register: string, id: string, companyCode: string): string | null {
  if (!SERP_UUID || !id) return null
  return `hansa://${SERP_UUID}/v1/${companyCode}/${register}/${id}`
}
