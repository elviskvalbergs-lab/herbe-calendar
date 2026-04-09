describe('serpLink', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  describe('hasSerpConfig', () => {
    it('should be true when NEXT_PUBLIC_HERBE_SERP_UUID is set', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = 'test-uuid-123'
      const mod = await import('@/lib/serpLink')
      expect(mod.hasSerpConfig).toBe(true)
    })

    it('should be false when NEXT_PUBLIC_HERBE_SERP_UUID is not set', async () => {
      delete process.env.NEXT_PUBLIC_HERBE_SERP_UUID
      const mod = await import('@/lib/serpLink')
      expect(mod.hasSerpConfig).toBe(false)
    })

    it('should be false when NEXT_PUBLIC_HERBE_SERP_UUID is empty string', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = ''
      const mod = await import('@/lib/serpLink')
      expect(mod.hasSerpConfig).toBe(false)
    })
  })

  describe('serpLink()', () => {
    it('should build a valid hansa:// deep link', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = 'abc-def-123'
      const { serpLink } = await import('@/lib/serpLink')
      const result = serpLink('Activities', '42', 'COMP01')
      expect(result).toBe('hansa://abc-def-123/v1/COMP01/Activities/42')
    })

    it('should return null when SERP_UUID is not set', async () => {
      delete process.env.NEXT_PUBLIC_HERBE_SERP_UUID
      const { serpLink } = await import('@/lib/serpLink')
      const result = serpLink('Activities', '42', 'COMP01')
      expect(result).toBeNull()
    })

    it('should return null when id is empty string', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = 'abc-def-123'
      const { serpLink } = await import('@/lib/serpLink')
      const result = serpLink('Activities', '', 'COMP01')
      expect(result).toBeNull()
    })

    it('should handle special characters in register and id', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = 'uuid-1'
      const { serpLink } = await import('@/lib/serpLink')
      const result = serpLink('Some Register', '100/200', 'C1')
      expect(result).toBe('hansa://uuid-1/v1/C1/Some Register/100/200')
    })

    it('should use the companyCode parameter as-is', async () => {
      process.env.NEXT_PUBLIC_HERBE_SERP_UUID = 'uuid-2'
      const { serpLink } = await import('@/lib/serpLink')
      const result = serpLink('Contacts', '7', 'MY_COMPANY')
      expect(result).toBe('hansa://uuid-2/v1/MY_COMPANY/Contacts/7')
    })
  })
})
