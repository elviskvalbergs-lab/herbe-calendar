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
