/**
 * Strip the source prefix from a Task id, preserving any colons inside the
 * source-id itself. Outlook/Google task ids can carry multiple colons, e.g.
 * "outlook:AAMkAG...:abc:def" → "AAMkAG...:abc:def". The previous
 * `task.id.split(':', 2)[1]` pattern dropped everything after the second
 * colon and broke list-scoped Outlook/Google task PATCH+DELETE round-trips.
 */
export function sourceIdFromTaskId(taskId: string): string {
  const colonIdx = taskId.indexOf(':')
  return colonIdx >= 0 ? taskId.slice(colonIdx + 1) : taskId
}
