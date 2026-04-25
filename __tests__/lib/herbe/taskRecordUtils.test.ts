import { mapHerbeTask, isTaskRecord } from '@/lib/herbe/taskRecordUtils'

describe('isTaskRecord', () => {
  it('returns true for TodoFlag=1', () => {
    expect(isTaskRecord({ TodoFlag: '1' })).toBe(true)
  })
  it('returns false for TodoFlag=0 (calendar entry)', () => {
    expect(isTaskRecord({ TodoFlag: '0' })).toBe(false)
  })
  it('returns false for empty TodoFlag', () => {
    expect(isTaskRecord({ TodoFlag: '' })).toBe(false)
  })
  it('returns false for undefined TodoFlag', () => {
    expect(isTaskRecord({})).toBe(false)
  })
})

describe('mapHerbeTask', () => {
  const baseRecord = {
    SerNr: '12345',
    Comment: 'Review prototype',
    TransDate: '2026-04-25',
    ActType: 'CALL',
    PRName: 'Burti Product',
    PRCode: 'P001',
    CUName: 'Burti',
    CUCode: 'C001',
    MainPersons: 'EKS',
    TodoFlag: '1',
    OKFlag: '0',
  }

  it('maps TodoFlag=1, OKFlag=0 to an open task', () => {
    const task = mapHerbeTask(baseRecord, 'EKS', 'conn-1', 'Burti ERP')
    expect(task).toMatchObject({
      id: 'herbe:12345',
      source: 'herbe',
      sourceConnectionId: 'conn-1',
      title: 'Review prototype',
      dueDate: '2026-04-25',
      done: false,
      listName: 'Burti Product',
    })
    expect(task.erp?.activityTypeCode).toBe('CALL')
    expect(task.erp?.projectCode).toBe('P001')
  })

  it('maps OKFlag=1 to done=true', () => {
    const task = mapHerbeTask({ ...baseRecord, OKFlag: '1' }, 'EKS', 'conn-1', 'x')
    expect(task.done).toBe(true)
  })

  it('uses customer name when project name is absent', () => {
    const task = mapHerbeTask({ ...baseRecord, PRName: '', CUName: 'Acme' }, 'EKS', 'conn-1', 'x')
    expect(task.listName).toBe('Acme')
  })

  it('omits dueDate when TransDate is empty', () => {
    const task = mapHerbeTask({ ...baseRecord, TransDate: '' }, 'EKS', 'conn-1', 'x')
    expect(task.dueDate).toBeUndefined()
  })

  // Regression: edit form was hardcoded to seed mainPersons with just the
  // signed-in user, so multi-person task assignments looked unsaved on
  // re-open even though ERP had stored them correctly. mapHerbeTask must
  // surface MainPersons so the form can pre-fill all assignees.
  it('surfaces MainPersons CSV as task.mainPersons (multi-assignee tasks)', () => {
    const task = mapHerbeTask(
      { ...baseRecord, MainPersons: 'EKS,ESE,ATS', CCPersons: 'APALA,ARA' },
      'EKS', 'conn-1', 'x',
    )
    expect(task.mainPersons).toEqual(['EKS', 'ESE', 'ATS'])
    expect(task.ccPersons).toEqual(['APALA', 'ARA'])
  })

  it('omits mainPersons when MainPersons is empty', () => {
    const task = mapHerbeTask({ ...baseRecord, MainPersons: '' }, 'EKS', 'conn-1', 'x')
    expect(task.mainPersons).toBeUndefined()
  })
})

describe('regression: calendar/task filter independence', () => {
  it('TodoFlag=0 must NOT be classified as task', () => {
    expect(isTaskRecord({ TodoFlag: '0', OKFlag: '1' })).toBe(false)
  })
  it('TodoFlag=1, OKFlag=1 is a DONE task (not a calendar entry)', () => {
    expect(isTaskRecord({ TodoFlag: '1', OKFlag: '1' })).toBe(true)
  })
})

import { buildCompleteTaskBody, buildCreateTaskBody, buildEditTaskBody } from '@/lib/herbe/taskRecordUtils'

describe('buildCompleteTaskBody', () => {
  it('encodes OKFlag=1 for done=true', () => {
    expect(buildCompleteTaskBody(true)).toEqual({ OKFlag: '1' })
  })
  it('encodes OKFlag=0 for done=false', () => {
    expect(buildCompleteTaskBody(false)).toEqual({ OKFlag: '0' })
  })
})

describe('buildCreateTaskBody', () => {
  it('always sets TodoFlag=1 on new tasks', () => {
    const body = buildCreateTaskBody({
      title: 'Do the thing',
      personCode: 'EKS',
      dueDate: '2026-05-01',
    })
    expect(body.TodoFlag).toBe('1')
    expect(body.Comment).toBe('Do the thing')
    expect(body.MainPersons).toBe('EKS')
    expect(body.TransDate).toBe('2026-05-01')
  })

  it('honors mainPersons when provided (multiple assignees)', () => {
    const body = buildCreateTaskBody({
      title: 'Team task',
      personCode: 'EKS',
      mainPersons: ['EKS', 'ANK'],
      dueDate: '2026-05-01',
    })
    expect(body.MainPersons).toBe('EKS,ANK')
  })

  it('falls back to personCode when mainPersons is empty', () => {
    const body = buildCreateTaskBody({
      title: 'Solo',
      personCode: 'EKS',
      mainPersons: [],
      dueDate: '2026-05-01',
    })
    expect(body.MainPersons).toBe('EKS')
  })
})

describe('buildEditTaskBody', () => {
  it('passes only the fields provided', () => {
    expect(buildEditTaskBody({ title: 'New' })).toEqual({ Comment: 'New' })
    expect(buildEditTaskBody({ dueDate: '2026-05-05' })).toEqual({ TransDate: '2026-05-05' })
    expect(buildEditTaskBody({ description: 'Notes' })).toEqual({ Text: 'Notes' })
  })
})
