import { extractHerbeError } from '@/lib/herbe/errors'

describe('extractHerbeError', () => {
  describe('falsy inputs', () => {
    it('should return empty string for null', () => {
      expect(extractHerbeError(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(extractHerbeError(undefined)).toBe('')
    })

    it('should return empty string for empty string', () => {
      expect(extractHerbeError('')).toBe('')
    })

    it('should return empty string for 0', () => {
      expect(extractHerbeError(0)).toBe('')
    })

    it('should return empty string for false', () => {
      expect(extractHerbeError(false)).toBe('')
    })
  })

  describe('string inputs', () => {
    it('should return the string as-is', () => {
      expect(extractHerbeError('Something went wrong')).toBe('Something went wrong')
    })
  })

  describe('array inputs', () => {
    it('should join multiple error objects with semicolons', () => {
      const errors = [
        { message: 'Error one' },
        { message: 'Error two' },
      ]
      expect(extractHerbeError(errors)).toBe('Error one; Error two')
    })

    it('should filter out empty results', () => {
      const errors = ['Error', null, '', { message: 'Another' }]
      expect(extractHerbeError(errors)).toBe('Error; Another')
    })

    it('should handle nested arrays', () => {
      const errors = [['Nested error']]
      expect(extractHerbeError(errors)).toBe('Nested error')
    })

    it('should return empty string for empty array', () => {
      expect(extractHerbeError([])).toBe('')
    })
  })

  describe('object inputs with @-prefixed keys (Standard ERP)', () => {
    it('should use @description', () => {
      expect(extractHerbeError({ '@description': 'ERP error message' }))
        .toBe('ERP error message')
    })

    it('should prepend @field to message', () => {
      expect(extractHerbeError({ '@description': 'is required', '@field': 'Name' }))
        .toBe('Name: is required')
    })

    it('should map known @code to friendly message', () => {
      expect(extractHerbeError({ '@code': '1547' }))
        .toBe('Time conflict — an activity already exists at this time for this person')
    })

    it('should map code 1058 to friendly message', () => {
      expect(extractHerbeError({ '@code': '1058' }))
        .toBe('Mandatory field missing')
    })

    it('should prefer mapped code message over raw @description', () => {
      expect(extractHerbeError({ '@code': '1547', '@description': 'raw text' }))
        .toBe('Time conflict — an activity already exists at this time for this person')
    })

    it('should include @field with mapped code message', () => {
      // Code 1058 ("Mandatory field missing") gets a friendlier specific
      // format: "<Field> is required" rather than the generic
      // "<Field>: Mandatory field missing".
      expect(extractHerbeError({ '@code': '1058', '@field': 'StartDate' }))
        .toBe('StartDate is required')
    })
  })

  describe('object inputs with plain keys', () => {
    it('should use message property', () => {
      expect(extractHerbeError({ message: 'plain error' })).toBe('plain error')
    })

    it('should use text property', () => {
      expect(extractHerbeError({ text: 'text error' })).toBe('text error')
    })

    it('should use msg property', () => {
      expect(extractHerbeError({ msg: 'msg error' })).toBe('msg error')
    })

    it('should use description property', () => {
      expect(extractHerbeError({ description: 'desc error' })).toBe('desc error')
    })

    it('should use Error property (capital E)', () => {
      expect(extractHerbeError({ Error: 'Error prop' })).toBe('Error prop')
    })

    it('should use error property (lowercase)', () => {
      expect(extractHerbeError({ error: 'error prop' })).toBe('error prop')
    })

    it('should prepend field to message', () => {
      expect(extractHerbeError({ message: 'is invalid', field: 'Email' }))
        .toBe('Email: is invalid')
    })

    it('should use code property for mapping', () => {
      expect(extractHerbeError({ code: '1547' }))
        .toBe('Time conflict — an activity already exists at this time for this person')
    })

    it('should trim whitespace from raw message', () => {
      expect(extractHerbeError({ message: '  trimmed  ' })).toBe('trimmed')
    })
  })

  describe('object inputs with no message (fallback to parts)', () => {
    it('should show field and code when no message', () => {
      expect(extractHerbeError({ field: 'Qty', code: '9999' }))
        .toBe('field: Qty, code: 9999')
    })

    it('should show field only', () => {
      expect(extractHerbeError({ field: 'Amount' })).toBe('field: Amount')
    })

    it('should show code only', () => {
      expect(extractHerbeError({ code: '9999' })).toBe('code: 9999')
    })

    it('should show vc when present', () => {
      expect(extractHerbeError({ vc: 'ACT' })).toBe('vc: ACT')
    })

    it('should combine field, code, and vc', () => {
      expect(extractHerbeError({ field: 'X', code: '100', vc: 'INV' }))
        .toBe('field: X, code: 100, vc: INV')
    })

    it('should JSON.stringify when no parts match', () => {
      const input = { foo: 'bar' }
      expect(extractHerbeError(input)).toBe(JSON.stringify(input))
    })
  })

  describe('non-object, non-string, non-array inputs', () => {
    it('should convert number to string', () => {
      expect(extractHerbeError(42)).toBe('42')
    })

    it('should convert true to string', () => {
      expect(extractHerbeError(true)).toBe('true')
    })

    it('should convert symbol to string', () => {
      expect(extractHerbeError(Symbol('test'))).toBe('Symbol(test)')
    })
  })
})
