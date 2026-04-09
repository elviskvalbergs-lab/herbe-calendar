import { clearIcsCache } from '@/lib/icsParser'

// We can test clearIcsCache and the module-level cache behavior
describe('icsParser', () => {
  describe('clearIcsCache', () => {
    it('does not throw when called', () => {
      expect(() => clearIcsCache()).not.toThrow()
    })

    it('can be called multiple times', () => {
      clearIcsCache()
      clearIcsCache()
    })
  })
})
