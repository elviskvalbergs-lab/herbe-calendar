/**
 * @jest-environment node
 *
 * Regression tests for the source-id helper used by handleToggleTaskDone /
 * task PATCH+DELETE call sites in CalendarShell. The previous implementation
 * called `task.id.split(':', 2)[1]` which dropped everything after the
 * second colon — Outlook and Google list-scoped ids can carry more than one.
 */
import { sourceIdFromTaskId } from '@/lib/tasks/taskId'

describe('sourceIdFromTaskId', () => {
  it('returns everything after the first colon (single colon)', () => {
    expect(sourceIdFromTaskId('herbe:12345')).toBe('12345')
  })

  it('preserves colons inside the source id (Outlook/Google list-scoped)', () => {
    expect(sourceIdFromTaskId('outlook:abc:def:ghi')).toBe('abc:def:ghi')
    expect(sourceIdFromTaskId('google:list1:taskZ')).toBe('list1:taskZ')
  })

  it('returns the input unchanged when there is no colon', () => {
    expect(sourceIdFromTaskId('orphan')).toBe('orphan')
  })

  it('returns empty string when the id is just "source:" with nothing after', () => {
    expect(sourceIdFromTaskId('outlook:')).toBe('')
  })
})
