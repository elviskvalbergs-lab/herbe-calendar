/** Check which data sources are configured based on environment variables */

export function isHerbeConfigured(): boolean {
  return !!(process.env.HERBE_API_BASE_URL?.trim() && process.env.HERBE_COMPANY_CODE?.trim())
}

export function isAzureConfigured(): boolean {
  return !!(process.env.AZURE_TENANT_ID?.trim() && process.env.AZURE_CLIENT_ID?.trim() && process.env.AZURE_CLIENT_SECRET?.trim())
}
