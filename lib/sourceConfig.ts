/**
 * Legacy source config checks.
 * These always return false — source availability is now determined
 * by DB-based configuration via getErpConnections / getAzureConfig.
 */

export function isHerbeConfigured(): boolean {
  return false
}

export function isAzureConfigured(): boolean {
  return false
}
