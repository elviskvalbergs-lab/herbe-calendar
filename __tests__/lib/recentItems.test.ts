import {
  getRecentTypes,
  saveRecentType,
  getRecentPersons,
  saveRecentPersons,
  getRecentCCPersons,
  saveRecentCCPersons,
} from '@/lib/recentItems'

/* ------------------------------------------------------------------ */
/*  localStorage mock                                                  */
/* ------------------------------------------------------------------ */
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((k: string) => store[k] ?? null),
    setItem: jest.fn((k: string, v: string) => { store[k] = v }),
    removeItem: jest.fn((k: string) => { delete store[k] }),
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })
Object.defineProperty(global, 'window', { value: {}, writable: true })

beforeEach(() => {
  localStorageMock.clear()
  jest.clearAllMocks()
})

/* ------------------------------------------------------------------ */
/*  getRecentTypes / saveRecentType                                    */
/* ------------------------------------------------------------------ */
describe('getRecentTypes', () => {
  it('returns empty array when nothing stored', () => {
    expect(getRecentTypes()).toEqual([])
  })

  it('returns parsed array from localStorage', () => {
    localStorage.setItem('recentActivityTypes', JSON.stringify(['A', 'B']))
    expect(getRecentTypes()).toEqual(['A', 'B'])
  })

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('recentActivityTypes', '{bad')
    expect(getRecentTypes()).toEqual([])
  })
})

describe('saveRecentType', () => {
  it('saves a single type', () => {
    saveRecentType('LESSON')
    expect(getRecentTypes()).toEqual(['LESSON'])
  })

  it('prepends new type and deduplicates', () => {
    saveRecentType('A')
    saveRecentType('B')
    saveRecentType('A')
    expect(getRecentTypes()).toEqual(['A', 'B'])
  })

  it('limits to 10 entries', () => {
    for (let i = 0; i < 12; i++) {
      saveRecentType(`T${i}`)
    }
    expect(getRecentTypes()).toHaveLength(10)
    // Most recent should be first
    expect(getRecentTypes()[0]).toBe('T11')
    // Oldest beyond limit should be gone
    expect(getRecentTypes()).not.toContain('T0')
    expect(getRecentTypes()).not.toContain('T1')
  })
})

/* ------------------------------------------------------------------ */
/*  getRecentPersons / saveRecentPersons                               */
/* ------------------------------------------------------------------ */
describe('getRecentPersons', () => {
  it('returns empty array when nothing stored', () => {
    expect(getRecentPersons()).toEqual([])
  })

  it('returns parsed array from localStorage', () => {
    localStorage.setItem('recentPersons', JSON.stringify(['EKS', 'ARA']))
    expect(getRecentPersons()).toEqual(['EKS', 'ARA'])
  })

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('recentPersons', 'not-json')
    expect(getRecentPersons()).toEqual([])
  })
})

describe('saveRecentPersons', () => {
  it('saves person codes', () => {
    saveRecentPersons(['EKS', 'ARA'])
    expect(getRecentPersons()).toEqual(['EKS', 'ARA'])
  })

  it('prepends new codes and deduplicates', () => {
    saveRecentPersons(['ARA'])
    saveRecentPersons(['EKS', 'ARA'])
    expect(getRecentPersons()).toEqual(['EKS', 'ARA'])
  })

  it('limits to 6 entries', () => {
    saveRecentPersons(['A', 'B', 'C', 'D', 'E', 'F'])
    saveRecentPersons(['G', 'H'])
    const result = getRecentPersons()
    expect(result).toHaveLength(6)
    expect(result[0]).toBe('G')
    expect(result[1]).toBe('H')
  })

  it('saves empty array without error', () => {
    saveRecentPersons(['EKS'])
    saveRecentPersons([])
    // Empty codes merged with existing keeps existing
    expect(getRecentPersons()).toEqual(['EKS'])
  })
})

/* ------------------------------------------------------------------ */
/*  getRecentCCPersons / saveRecentCCPersons                           */
/* ------------------------------------------------------------------ */
describe('getRecentCCPersons', () => {
  it('returns empty array when nothing saved', () => {
    expect(getRecentCCPersons()).toEqual([])
  })

  it('returns parsed array from localStorage', () => {
    localStorage.setItem('recentCCPersons', JSON.stringify(['ARA']))
    expect(getRecentCCPersons()).toEqual(['ARA'])
  })

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('recentCCPersons', 'bad-json')
    expect(getRecentCCPersons()).toEqual([])
  })
})

describe('saveRecentCCPersons', () => {
  it('saves and retrieves CC persons', () => {
    saveRecentCCPersons(['ARA', 'EKS'])
    expect(getRecentCCPersons()).toEqual(['ARA', 'EKS'])
  })

  it('prepends new codes and deduplicates', () => {
    saveRecentCCPersons(['ARA'])
    saveRecentCCPersons(['EKS', 'ARA'])
    expect(getRecentCCPersons()).toEqual(['EKS', 'ARA'])
  })

  it('limits to 6 entries', () => {
    saveRecentCCPersons(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(getRecentCCPersons()).toHaveLength(6)
  })

  it('does nothing when passed empty array', () => {
    saveRecentCCPersons(['ARA'])
    saveRecentCCPersons([])
    expect(getRecentCCPersons()).toEqual(['ARA'])
  })
})

/* ------------------------------------------------------------------ */
/*  window undefined checks (SSR)                                      */
/* ------------------------------------------------------------------ */
describe('when window is undefined (SSR)', () => {
  const origWindow = global.window

  beforeEach(() => {
    // Pre-populate localStorage so we can verify the guard works
    localStorageMock.clear()
    localStorage.setItem('recentActivityTypes', JSON.stringify(['PREFILLED']))
    localStorage.setItem('recentPersons', JSON.stringify(['PREFILLED']))
    localStorage.setItem('recentCCPersons', JSON.stringify(['PREFILLED']))
    // @ts-expect-error — simulating SSR where window is undefined
    global.window = undefined
  })

  afterEach(() => {
    Object.defineProperty(global, 'window', { value: origWindow, writable: true })
  })

  it('getRecentTypes returns empty array even when localStorage has data', () => {
    expect(getRecentTypes()).toEqual([])
  })

  it('getRecentPersons returns empty array even when localStorage has data', () => {
    expect(getRecentPersons()).toEqual([])
  })

  it('getRecentCCPersons returns empty array even when localStorage has data', () => {
    expect(getRecentCCPersons()).toEqual([])
  })

  it('saveRecentCCPersons does nothing when window is undefined', () => {
    jest.clearAllMocks()
    saveRecentCCPersons(['ARA'])
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })
})
