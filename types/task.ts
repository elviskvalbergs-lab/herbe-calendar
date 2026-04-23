export type TaskSource = 'herbe' | 'outlook' | 'google'

export interface Task {
  /** Source-prefixed id, e.g. "herbe:12345", "outlook:AAMkAG...", "google:xyz" */
  id: string
  source: TaskSource
  /** ERP connection id (accounts can have multiple). Omitted for Outlook/Google. */
  sourceConnectionId?: string
  title: string
  description?: string
  /** YYYY-MM-DD, omitted when no due date set */
  dueDate?: string
  done: boolean
  /** ERP only — person codes from CCPersons, so the edit form can pre-fill them. */
  ccPersons?: string[]
  /** Outlook: list display name; Google: list title; ERP: project or customer label */
  listName?: string
  /** ERP-only metadata used for the copy-to-event pre-fill and row meta line */
  erp?: {
    activityTypeCode?: string
    projectCode?: string
    projectName?: string
    customerCode?: string
    customerName?: string
    textInMatrix?: string
  }
  /** Deep link for "Open in source" menu action */
  sourceUrl?: string
}
