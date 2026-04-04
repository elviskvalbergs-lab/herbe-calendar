import { pool } from '@/lib/db'

export type AnalyticsEventType =
  | 'login'
  | 'activity_created'
  | 'activity_edited'
  | 'activity_deleted'
  | 'day_viewed'

/**
 * Record an analytics event. Fire-and-forget — never throws.
 * For 'day_viewed', pass metadata: { date: 'YYYY-MM-DD' } to deduplicate.
 */
export async function trackEvent(
  accountId: string,
  userEmail: string,
  eventType: AnalyticsEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    if (eventType === 'day_viewed' && metadata?.date) {
      // Deduplicate: one day_viewed per user per calendar date per day
      await pool.query(
        `INSERT INTO analytics_events (account_id, user_email, event_type, event_date, metadata)
         VALUES ($1, $2, $3, CURRENT_DATE, $4)
         ON CONFLICT DO NOTHING`,
        [accountId, userEmail, eventType, JSON.stringify(metadata)]
      )
    } else {
      await pool.query(
        `INSERT INTO analytics_events (account_id, user_email, event_type, event_date, metadata)
         VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
        [accountId, userEmail, eventType, metadata ? JSON.stringify(metadata) : null]
      )
    }
  } catch (e) {
    console.warn('[analytics] Failed to track event:', String(e))
  }
}

/**
 * Clean up analytics events older than the retention period.
 * Call periodically (e.g., from a cron job or admin action).
 */
export async function purgeOldEvents(retentionDays = 30): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM analytics_events WHERE event_date < CURRENT_DATE - $1::int',
    [retentionDays]
  )
  return rowCount ?? 0
}
