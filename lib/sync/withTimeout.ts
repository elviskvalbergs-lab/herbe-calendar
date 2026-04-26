/**
 * Runs `work` with a timeout. If it doesn't complete in `ms`, the returned
 * promise rejects with a timeout error. Note: this does NOT cancel the
 * underlying work — Node has no portable cancellation primitive — but it
 * stops blocking the caller, so the sync orchestrator can move on.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label} exceeded ${ms}ms`)), ms)
    // unref so a stray timeout doesn't keep the process alive
    timer?.unref?.()
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
