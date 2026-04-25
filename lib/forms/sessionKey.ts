/**
 * Stable identity for an ActivityForm "session". When this key changes, the
 * form is unmounted and remounted, re-running every `useState` initializer
 * with fresh props.
 *
 * Without this, in-place transitions (e.g. task-edit → "Move task to calendar"
 * which closes the form and reopens it as a new event in the same React
 * render batch) preserve internal state — including `destination`, which then
 * keeps the previous task's `outlook:__edit__` / `google:...:__edit__` key.
 * The visible dropdown falls back to the first option (ERP, sorted first)
 * while `destination.source` is still 'outlook'/'google', causing
 * `isExternalCalSource` to render RSVP / external-attendee / Teams / Location
 * fields under what looks like an ERP destination.
 */
export function activityFormSessionKey(state: {
  editId?: string
  mode?: 'event' | 'task'
  seededFromCopy?: boolean
}): string {
  return `${state.editId ?? 'new'}|${state.mode ?? 'event'}|${state.seededFromCopy ? 'copy' : 'fresh'}`
}
