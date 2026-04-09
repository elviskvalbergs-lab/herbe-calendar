import { icsId, loadHidden, saveHidden, HERBE_ID, OUTLOOK_ID, HERBE_COLOR } from '@/lib/calendarVisibility'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value }),
    removeItem: jest.fn((key: string) => { delete store[key] }),
    clear: jest.fn(() => { store = {} }),
    get _store() { return store },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('calendarVisibility', () => {
  beforeEach(() => {
    localStorageMock.clear()
    jest.clearAllMocks()
  })

  describe('constants', () => {
    it('should export HERBE_ID as "herbe"', () => {
      expect(HERBE_ID).toBe('herbe')
    })

    it('should export OUTLOOK_ID as "outlook"', () => {
      expect(OUTLOOK_ID).toBe('outlook')
    })

    it('should export HERBE_COLOR as a green hex code', () => {
      expect(HERBE_COLOR).toBe('#228B22')
    })
  })

  describe('icsId', () => {
    it('should prefix name with "ics:"', () => {
      expect(icsId('work')).toBe('ics:work')
    })

    it('should handle empty string', () => {
      expect(icsId('')).toBe('ics:')
    })

    it('should handle names with special characters', () => {
      expect(icsId('My Calendar / Test')).toBe('ics:My Calendar / Test')
    })
  })

  describe('loadHidden', () => {
    it('should return empty set when nothing is stored', () => {
      const result = loadHidden()
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('should return set with stored calendar IDs', () => {
      localStorageMock.setItem('calendarVisibility', JSON.stringify(['herbe', 'outlook']))
      const result = loadHidden()
      expect(result).toEqual(new Set(['herbe', 'outlook']))
    })

    it('should return empty set when localStorage has invalid JSON', () => {
      localStorageMock.getItem.mockReturnValueOnce('not valid json {{{')
      const result = loadHidden()
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('should return empty set when localStorage throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage access denied')
      })
      const result = loadHidden()
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('should return empty set when stored value is null', () => {
      // getItem returns null by default for unset keys
      const result = loadHidden()
      expect(result.size).toBe(0)
    })
  })

  describe('saveHidden', () => {
    it('should persist set to localStorage as JSON array', () => {
      saveHidden(new Set(['herbe', 'ics:work']))
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'calendarVisibility',
        expect.any(String)
      )
      const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1])
      expect(stored).toEqual(expect.arrayContaining(['herbe', 'ics:work']))
      expect(stored).toHaveLength(2)
    })

    it('should persist empty set as empty array', () => {
      saveHidden(new Set())
      const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1])
      expect(stored).toEqual([])
    })

    it('should not throw when localStorage throws', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => saveHidden(new Set(['herbe']))).not.toThrow()
    })
  })

  describe('roundtrip', () => {
    it('should load what was saved', () => {
      const hidden = new Set(['herbe', 'ics:personal', 'outlook'])
      saveHidden(hidden)
      // Manually set up the mock to return what was stored
      const storedValue = localStorageMock.setItem.mock.calls[0][1]
      localStorageMock.getItem.mockReturnValueOnce(storedValue)
      const loaded = loadHidden()
      expect(loaded).toEqual(hidden)
    })
  })
})
