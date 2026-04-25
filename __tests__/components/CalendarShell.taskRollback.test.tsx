/**
 * @jest-environment node
 *
 * Regression test for the optimistic-rollback fix in CalendarShell's
 * handleToggleTaskDone. The previous code captured `prev = tasks` at click
 * time and restored it on failure, which clobbered any task toggles the
 * user made while the failing request was in flight. The new code rolls
 * back by id only — using a functional setState updater that flips just
 * that one task back to its prior value.
 *
 * This test simulates the rollback shape directly: it is the exact updater
 * the handler now passes to React, applied to a state where a SECOND task
 * has been toggled mid-request. The clobber-style rollback would erase
 * that second toggle; the id-scoped rollback preserves it.
 */
import type { Task } from '@/types/task'

const T1: Task = { id: 'herbe:1', source: 'herbe', title: 'first',  done: false }
const T2: Task = { id: 'herbe:2', source: 'herbe', title: 'second', done: false }

// Mirror of the rollback updater in CalendarShell#handleToggleTaskDone
function rollbackById(task: Task, done: boolean) {
  return (ts: Task[]) => ts.map(t => t.id === task.id ? { ...t, done: !done } : t)
}

describe('handleToggleTaskDone rollback', () => {
  it('rolls back the failing task by id without overwriting concurrent toggles', () => {
    // User clicks T1 (done=true). Optimistic state:
    let state: Task[] = [{ ...T1, done: true }, T2]
    // Before T1's request returns, the user toggles T2 → state mutates again:
    state = state.map(t => t.id === T2.id ? { ...t, done: true } : t)
    // T1's PATCH then fails — apply the new functional rollback.
    state = rollbackById(T1, true)(state)
    // T1 should be back to false; T2's concurrent toggle survives.
    expect(state.find(t => t.id === T1.id)?.done).toBe(false)
    expect(state.find(t => t.id === T2.id)?.done).toBe(true)
  })
})
