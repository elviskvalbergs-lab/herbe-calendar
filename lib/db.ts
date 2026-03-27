import { Pool, neonConfig } from '@neondatabase/serverless'

// Use HTTP fetch for Pool queries instead of WebSocket.
// Required for Vercel Node.js runtime (18/20) which lacks a global WebSocket.
neonConfig.poolQueryViaFetch = true

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
