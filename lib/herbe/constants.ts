// Field name for multi-person activity assignment in ActVc.
// Verify against actual ActVc field list and update here if different.
export const ACTIVITY_ACCESS_GROUP_FIELD = 'AccessGroup'

export const REGISTERS = {
  activities:           'ActVc',
  users:                'UserVc',
  activityTypes:        'ActTypeVc',
  activityClassGroups:  'ActClassGrVc',
  projects:             'PRVc',
  customers:            'CUVc',
} as const
