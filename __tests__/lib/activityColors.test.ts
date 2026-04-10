import {
  BRAND_PALETTE,
  HERBE_COLOR_NAMES,
  OUTLOOK_COLOR,
  FALLBACK_COLOR,
  calColNrToColor,
  buildClassGroupColorMap,
  getActivityColor,
  loadColorOverrides,
  saveColorOverride,
  resolveColorWithOverrides,
  readableAccentColor,
  textOnAccent,
  SOURCE_COLOR_CODES,
} from '@/lib/activityColors'
import type { Activity } from '@/types'

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
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  jest.clearAllMocks()
})

/* ------------------------------------------------------------------ */
/*  HERBE_COLOR_NAMES                                                  */
/* ------------------------------------------------------------------ */
describe('HERBE_COLOR_NAMES', () => {
  it('Deep Forest maps to green', () => {
    expect(HERBE_COLOR_NAMES['Deep Forest']).toBe('#22c55e')
  })
  it('Sky Blue maps to cyan', () => {
    expect(HERBE_COLOR_NAMES['Sky Blue']).toBe('#00ABCE')
  })
  it('Green maps to #22c55e', () => {
    expect(HERBE_COLOR_NAMES['Green']).toBe('#22c55e')
  })
  it('Desert Glow maps to orange', () => {
    expect(HERBE_COLOR_NAMES['Desert Glow']).toBe('#e8923a')
  })
  it('Coffee maps to purple', () => {
    expect(HERBE_COLOR_NAMES['Coffee']).toBe('#8b5cf6')
  })
})

/* ------------------------------------------------------------------ */
/*  BRAND_PALETTE                                                      */
/* ------------------------------------------------------------------ */
describe('BRAND_PALETTE', () => {
  it('has 20 entries', () => {
    expect(BRAND_PALETTE).toHaveLength(20)
  })
  it('index 0 is cyan', () => {
    expect(BRAND_PALETTE[0]).toBe('#00ABCE')
  })
  it('index 2 is green', () => {
    expect(BRAND_PALETTE[2]).toBe('#22c55e')
  })
  it('index 5 is blue', () => {
    expect(BRAND_PALETTE[5]).toBe('#3b82f6')
  })
})

/* ------------------------------------------------------------------ */
/*  calColNrToColor                                                    */
/* ------------------------------------------------------------------ */
describe('calColNrToColor', () => {
  it('returns undefined for undefined input', () => {
    expect(calColNrToColor(undefined)).toBeUndefined()
  })

  it('returns undefined for null input', () => {
    expect(calColNrToColor(null as unknown as undefined)).toBeUndefined()
  })

  it('resolves known color name string', () => {
    expect(calColNrToColor('Sky Blue')).toBe('#00ABCE')
  })

  it('resolves "Deep Forest" to green', () => {
    expect(calColNrToColor('Deep Forest')).toBe('#22c55e')
  })

  it('returns undefined for unknown color name string', () => {
    expect(calColNrToColor('Nonexistent Color')).toBeUndefined()
  })

  it('resolves numeric index 0 to palette[0]', () => {
    expect(calColNrToColor(0)).toBe(BRAND_PALETTE[0])
  })

  it('resolves numeric index 2 to palette[2]', () => {
    expect(calColNrToColor(2)).toBe(BRAND_PALETTE[2])
  })

  it('wraps numeric index beyond palette length', () => {
    expect(calColNrToColor(20)).toBe(BRAND_PALETTE[0])
    expect(calColNrToColor(21)).toBe(BRAND_PALETTE[1])
    expect(calColNrToColor(40)).toBe(BRAND_PALETTE[0])
  })

  it('handles negative numeric index via Math.abs + modulo', () => {
    expect(calColNrToColor(-3)).toBe(BRAND_PALETTE[3])
    expect(calColNrToColor(-20)).toBe(BRAND_PALETTE[0])
  })

  it('returns undefined for NaN', () => {
    expect(calColNrToColor(NaN)).toBeUndefined()
  })

  it('returns undefined for Infinity', () => {
    expect(calColNrToColor(Infinity)).toBeUndefined()
  })

  it('returns undefined for -Infinity', () => {
    expect(calColNrToColor(-Infinity)).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/*  buildClassGroupColorMap                                            */
/* ------------------------------------------------------------------ */
describe('buildClassGroupColorMap', () => {
  it('returns empty map for empty array', () => {
    const map = buildClassGroupColorMap([], {})
    expect(map.size).toBe(0)
  })

  it('assigns palette colors by index when no calColNr', () => {
    const groups = [
      { code: 'A' },
      { code: 'B' },
      { code: 'C' },
    ]
    const map = buildClassGroupColorMap(groups, {})
    expect(map.get('A')).toBe(BRAND_PALETTE[0])
    expect(map.get('B')).toBe(BRAND_PALETTE[1])
    expect(map.get('C')).toBe(BRAND_PALETTE[2])
  })

  it('uses calColNr color name when available', () => {
    const groups = [{ code: 'X', calColNr: 'Sky Blue' }]
    const map = buildClassGroupColorMap(groups, {})
    expect(map.get('X')).toBe('#00ABCE')
  })

  it('uses calColNr numeric index when available', () => {
    const groups = [{ code: 'X', calColNr: 5 }]
    const map = buildClassGroupColorMap(groups, {})
    expect(map.get('X')).toBe(BRAND_PALETTE[5])
  })

  it('falls back to palette index when calColNr name is unknown', () => {
    const groups = [{ code: 'X', calColNr: 'Unknown Color' }]
    const map = buildClassGroupColorMap(groups, {})
    expect(map.get('X')).toBe(BRAND_PALETTE[0]) // idx 0
  })

  it('applies overrides over base colors', () => {
    const groups = [
      { code: 'A', calColNr: 'Sky Blue' },
      { code: 'B' },
    ]
    const overrides = { A: '#ff0000', B: '#00ff00' }
    const map = buildClassGroupColorMap(groups, overrides)
    expect(map.get('A')).toBe('#ff0000')
    expect(map.get('B')).toBe('#00ff00')
  })

  it('skips groups with empty code', () => {
    const groups = [
      { code: '' },
      { code: 'VALID' },
    ]
    const map = buildClassGroupColorMap(groups, {})
    expect(map.size).toBe(1)
    expect(map.has('')).toBe(false)
    expect(map.get('VALID')).toBe(BRAND_PALETTE[1]) // idx 1 (idx 0 was skipped but idx still increments)
  })

  it('wraps palette index for many groups', () => {
    const groups = Array.from({ length: 25 }, (_, i) => ({ code: `G${i}` }))
    const map = buildClassGroupColorMap(groups, {})
    // G20 should wrap to BRAND_PALETTE[20 % 20] = BRAND_PALETTE[0]
    expect(map.get('G20')).toBe(BRAND_PALETTE[0])
  })
})

/* ------------------------------------------------------------------ */
/*  getActivityColor                                                   */
/* ------------------------------------------------------------------ */
describe('getActivityColor', () => {
  const typeToClassGroup = new Map([['LESSON', 'TEACHING'], ['MEETING', 'ADMIN']])
  const classGroupToColor = new Map([['TEACHING', '#22c55e'], ['ADMIN', '#e8923a']])

  function makeActivity(overrides: Partial<Activity>): Activity {
    return {
      id: '1',
      source: 'herbe',
      personCode: 'EKS',
      description: 'Test',
      date: '2026-04-02',
      timeFrom: '08:00',
      timeTo: '09:00',
      ...overrides,
    }
  }

  it('returns icsColor when present', () => {
    const a = makeActivity({ icsColor: '#abc123' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe('#abc123')
  })

  it('returns icsColor even for outlook source', () => {
    const a = makeActivity({ source: 'outlook', icsColor: '#abc123' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe('#abc123')
  })

  it('returns OUTLOOK_COLOR for outlook source without icsColor', () => {
    const a = makeActivity({ source: 'outlook' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe(OUTLOOK_COLOR)
  })

  it('returns FALLBACK_COLOR when no activityTypeCode', () => {
    const a = makeActivity({ activityTypeCode: undefined })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe(FALLBACK_COLOR)
  })

  it('returns FALLBACK_COLOR when activityTypeCode has no class group mapping', () => {
    const a = makeActivity({ activityTypeCode: 'UNKNOWN' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe(FALLBACK_COLOR)
  })

  it('returns FALLBACK_COLOR when class group has no color mapping', () => {
    const ttcg = new Map([['LESSON', 'UNMAPPED_GROUP']])
    const a = makeActivity({ activityTypeCode: 'LESSON' })
    expect(getActivityColor(a, ttcg, classGroupToColor)).toBe(FALLBACK_COLOR)
  })

  it('returns class group color for herbe activity with type', () => {
    const a = makeActivity({ activityTypeCode: 'LESSON' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe('#22c55e')
  })

  it('returns class group color for a different type', () => {
    const a = makeActivity({ activityTypeCode: 'MEETING' })
    expect(getActivityColor(a, typeToClassGroup, classGroupToColor)).toBe('#e8923a')
  })
})

/* ------------------------------------------------------------------ */
/*  loadColorOverrides / saveColorOverride                             */
/* ------------------------------------------------------------------ */
describe('loadColorOverrides', () => {
  it('returns empty object when nothing stored', () => {
    expect(loadColorOverrides()).toEqual({})
  })

  it('returns parsed overrides from localStorage', () => {
    localStorage.setItem('activityClassGroupColors', JSON.stringify({ A: '#ff0000' }))
    expect(loadColorOverrides()).toEqual({ A: '#ff0000' })
  })

  it('returns empty object on invalid JSON', () => {
    localStorage.setItem('activityClassGroupColors', 'not-json')
    expect(loadColorOverrides()).toEqual({})
  })
})

describe('saveColorOverride', () => {
  it('saves a new override', () => {
    saveColorOverride('GRP1', '#ff0000')
    expect(loadColorOverrides()).toEqual({ GRP1: '#ff0000' })
  })

  it('adds to existing overrides', () => {
    saveColorOverride('GRP1', '#ff0000')
    saveColorOverride('GRP2', '#00ff00')
    expect(loadColorOverrides()).toEqual({ GRP1: '#ff0000', GRP2: '#00ff00' })
  })

  it('overwrites existing override for same key', () => {
    saveColorOverride('GRP1', '#ff0000')
    saveColorOverride('GRP1', '#0000ff')
    expect(loadColorOverrides()).toEqual({ GRP1: '#0000ff' })
  })
})

/* ------------------------------------------------------------------ */
/*  resolveColorWithOverrides                                           */
/* ------------------------------------------------------------------ */
describe('resolveColorWithOverrides', () => {
  const classGroups = [
    { code: 'MTG', calColNr: 'Sky Blue' as string | number | undefined },
    { code: 'INT', calColNr: undefined },
  ]

  it('returns ERP color when no overrides exist', () => {
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, [])
    expect(result).toBe('#00ABCE') // Sky Blue
  })

  it('returns palette fallback when no calColNr and no overrides', () => {
    const result = resolveColorWithOverrides('INT', null, classGroups, 1, [])
    expect(result).toBe(BRAND_PALETTE[1])
  })

  it('user global override beats ERP color', () => {
    const overrides = [
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#ff0000')
  })

  it('user per-connection override beats user global', () => {
    const overrides = [
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
      { user_email: 'user@test.com', connection_id: 'conn-1', class_group_code: 'MTG', color: '#00ff00' },
    ]
    const result = resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)
    expect(result).toBe('#00ff00')
  })

  it('admin global override beats ERP color', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#0000ff')
  })

  it('user global beats admin global', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#ff0000')
  })

  it('admin per-connection beats admin global', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
      { user_email: null, connection_id: 'conn-1', class_group_code: 'MTG', color: '#00ff00' },
    ]
    const result = resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)
    expect(result).toBe('#00ff00')
  })

  it('falls back through hierarchy correctly: user-conn > user-global > admin-conn > admin-global > ERP > palette', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#admin' },
    ]
    expect(resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)).toBe('#admin')
  })
})

/* ------------------------------------------------------------------ */
/*  readableAccentColor                                                */
/* ------------------------------------------------------------------ */
describe('readableAccentColor', () => {
  it('dark theme: returns the original color for any input', () => {
    expect(readableAccentColor('#f59e0b', true)).toBe('#f59e0b')
    expect(readableAccentColor('#ffffff', true)).toBe('#ffffff')
    expect(readableAccentColor('#000000', true)).toBe('#000000')
    expect(readableAccentColor('#cd4c38', true)).toBe('#cd4c38')
  })

  it('light theme: returns original color for dark colors (e.g. #cd4c38 red)', () => {
    // #cd4c38 has luminance ~0.11, well below 0.4 threshold
    expect(readableAccentColor('#cd4c38', false)).toBe('#cd4c38')
  })

  it('light theme: darkens light colors (e.g. #f59e0b amber)', () => {
    const result = readableAccentColor('#f59e0b', false)
    // Should not return the original color — it should be darkened
    expect(result).not.toBe('#f59e0b')
    // Result should be a valid hex color
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
    // The darkened color should have lower RGB values than the original
    const parseHex = (h: string) => parseInt(h.replace('#', ''), 16)
    expect(parseHex(result)).toBeLessThan(parseHex('#f59e0b'))
  })

  it('light theme: darkens yellow (#ffff00 — high luminance color)', () => {
    const result = readableAccentColor('#ffff00', false)
    expect(result).not.toBe('#ffff00')
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('light theme: does not darken medium colors unnecessarily', () => {
    // #3b82f6 (blue) has luminance ~0.22, below 0.4 threshold
    expect(readableAccentColor('#3b82f6', false)).toBe('#3b82f6')
    // #6264a7 (Teams purple) has luminance ~0.13
    expect(readableAccentColor('#6264a7', false)).toBe('#6264a7')
  })
})

/* ------------------------------------------------------------------ */
/*  textOnAccent                                                       */
/* ------------------------------------------------------------------ */
describe('textOnAccent', () => {
  it('returns white for dark backgrounds', () => {
    expect(textOnAccent('#000000')).toBe('#ffffff')
    expect(textOnAccent('#cd4c38')).toBe('#ffffff')
    expect(textOnAccent('#6264a7')).toBe('#ffffff')
  })

  it('returns dark for light backgrounds', () => {
    expect(textOnAccent('#ffffff')).toBe('#1a1a1a')
    expect(textOnAccent('#f59e0b')).toBe('#1a1a1a')
    expect(textOnAccent('#ffff00')).toBe('#1a1a1a')
  })

  it('threshold is around 0.35 luminance', () => {
    // A color with luminance just above 0.35 should return dark text
    // #a0a0a0 has luminance ~0.36
    expect(textOnAccent('#a0a0a0')).toBe('#1a1a1a')
    // A color with luminance just below 0.35 should return white text
    // #909090 has luminance ~0.30
    expect(textOnAccent('#909090')).toBe('#ffffff')
  })
})

/* ------------------------------------------------------------------ */
/*  SOURCE_COLOR_CODES                                                 */
/* ------------------------------------------------------------------ */
describe('SOURCE_COLOR_CODES', () => {
  it('outlook key equals __outlook__', () => {
    expect(SOURCE_COLOR_CODES.outlook).toBe('__outlook__')
  })

  it('erp key equals __erp__', () => {
    expect(SOURCE_COLOR_CODES.erp).toBe('__erp__')
  })
})

/* ------------------------------------------------------------------ */
/*  getActivityColor with source overrides                             */
/* ------------------------------------------------------------------ */
describe('getActivityColor with source overrides', () => {
  const typeToClassGroup = new Map([['LESSON', 'TEACHING']])
  const baseClassGroupToColor = new Map([['TEACHING', '#22c55e']])

  function makeActivity(overrides: Partial<Activity>): Activity {
    return {
      id: '1',
      source: 'herbe',
      personCode: 'EKS',
      description: 'Test',
      date: '2026-04-02',
      timeFrom: '08:00',
      timeTo: '09:00',
      ...overrides,
    }
  }

  it('returns overridden outlook color when SOURCE_COLOR_CODES.outlook is in the color map', () => {
    const colorMap = new Map(baseClassGroupToColor)
    colorMap.set(SOURCE_COLOR_CODES.outlook, '#ff00ff')
    const a = makeActivity({ source: 'outlook' })
    expect(getActivityColor(a, typeToClassGroup, colorMap)).toBe('#ff00ff')
  })

  it('returns overridden erp color when SOURCE_COLOR_CODES.erp is in the color map', () => {
    const colorMap = new Map(baseClassGroupToColor)
    colorMap.set(SOURCE_COLOR_CODES.erp, '#00ffaa')
    // Activity with no activityTypeCode falls back to erp source color
    const a = makeActivity({ activityTypeCode: undefined })
    expect(getActivityColor(a, typeToClassGroup, colorMap)).toBe('#00ffaa')
  })

  it('falls back to OUTLOOK_COLOR when no override exists', () => {
    const a = makeActivity({ source: 'outlook' })
    expect(getActivityColor(a, typeToClassGroup, baseClassGroupToColor)).toBe(OUTLOOK_COLOR)
  })

  it('falls back to FALLBACK_COLOR when no override exists', () => {
    const a = makeActivity({ activityTypeCode: undefined })
    expect(getActivityColor(a, typeToClassGroup, baseClassGroupToColor)).toBe(FALLBACK_COLOR)
  })
})
