import { getRecentCCPersons, saveRecentCCPersons } from '@/lib/recentItems'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

beforeEach(() => localStorageMock.clear())

describe('recentCCPersons', () => {
  it('returns empty array when nothing saved', () => {
    expect(getRecentCCPersons()).toEqual([])
  })

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
