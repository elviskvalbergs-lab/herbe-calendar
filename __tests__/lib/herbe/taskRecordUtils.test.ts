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
})

describe('regression: calendar/task filter independence', () => {
  it('TodoFlag=0 must NOT be classified as task', () => {
    expect(isTaskRecord({ TodoFlag: '0', OKFlag: '1' })).toBe(false)
  })
  it('TodoFlag=1, OKFlag=1 is a DONE task (not a calendar entry)', () => {
    expect(isTaskRecord({ TodoFlag: '1', OKFlag: '1' })).toBe(true)
  })
})
