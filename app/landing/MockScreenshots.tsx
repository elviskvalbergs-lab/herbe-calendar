'use client'

import { CSSProperties } from 'react'

type ColorKey = 'rust' | 'amber' | 'moss' | 'indigo' | 'sky' | 'violet' | 'plum' | 'forest' | 'teal' | 'graphite'

const MOCK_COLORS: Record<ColorKey, string> = {
  rust: '#CD4C38',
  amber: '#C78A2B',
  moss: '#6B8E3D',
  indigo: '#4B5FAD',
  sky: '#0F8FB3',
  violet: '#7A4E9C',
  plum: '#A8446E',
  forest: '#2A8F6D',
  teal: '#2A8F94',
  graphite: '#4A4E53',
}

type Person = { code: string; name: string; color: ColorKey }

const MOCK_PEOPLE: Person[] = [
  { code: 'EK', name: 'Elvis K.', color: 'rust' },
  { code: 'ES', name: 'Edgars S.', color: 'moss' },
  { code: 'DA', name: 'Dace A.', color: 'plum' },
  { code: 'KV', name: 'Kārlis V.', color: 'indigo' },
]

type MockEvent = {
  start: number
  dur: number
  title: string
  letter: string
  color: ColorKey
  loc?: string
}

const MOCK_EVENTS: Record<string, MockEvent[]> = {
  EK: [
    { start: 0, dur: 4, title: 'DESK-21293 · Portal retro', letter: 'B', color: 'rust' },
    { start: 5, dur: 3, title: 'Ar Magnusu par NUF', letter: 'O', color: 'indigo' },
    { start: 9, dur: 4, title: 'Customer Success Weekly', letter: 'O', color: 'indigo', loc: 'Teams' },
    { start: 14, dur: 3, title: 'Ar KZ par ZPE tikšanām', letter: 'Z', color: 'sky' },
    { start: 18, dur: 2, title: 'Follow-up zīpēdi', letter: 'B', color: 'rust' },
  ],
  ES: [
    { start: 1, dur: 3, title: 'DEV event sync', letter: 'B', color: 'rust' },
    { start: 6, dur: 5, title: 'Product management sync', letter: 'G', color: 'moss' },
    { start: 12, dur: 3, title: 'Excellent Int Dev Meeting', letter: 'O', color: 'indigo', loc: 'Teams' },
    { start: 16, dur: 4, title: 'Portal DEV meeting', letter: 'O', color: 'indigo' },
  ],
  DA: [
    { start: 0, dur: 2, title: 'Ziņas', letter: 'B', color: 'rust' },
    { start: 3, dur: 4, title: 'Marketing monthly', letter: 'O', color: 'indigo' },
    { start: 8, dur: 3, title: 'Peldēšana Aleksa', letter: 'A', color: 'violet' },
    { start: 14, dur: 5, title: 'Par HR indikatoriem', letter: 'B', color: 'rust' },
  ],
  KV: [
    { start: 2, dur: 4, title: 'With Kove about roll-out', letter: 'O', color: 'indigo' },
    { start: 7, dur: 2, title: 'HW Weekly', letter: 'T', color: 'indigo', loc: 'Teams' },
    { start: 10, dur: 6, title: 'Par līzingu un kredītu', letter: 'Z', color: 'sky' },
    { start: 17, dur: 3, title: 'Operations Weekly', letter: 'O', color: 'indigo' },
  ],
}

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const SLOT_H = 28

function MockEventBlock({ ev, slotH }: { ev: MockEvent; slotH: number }) {
  const c = MOCK_COLORS[ev.color]
  const top = ev.start * slotH
  const h = ev.dur * slotH - 2
  return (
    <div
      style={{
        position: 'absolute',
        left: 3,
        right: 3,
        top,
        height: h,
        background: c + '22',
        borderLeft: `3px solid ${c}`,
        borderRadius: 4,
        padding: '3px 5px',
        overflow: 'hidden',
        fontSize: 9.5,
        lineHeight: 1.3,
        color: '#E8EEEB',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            background: c + '44',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            color: c,
            flexShrink: 0,
          }}
        >
          {ev.letter}
        </span>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ev.title}
        </span>
      </div>
      {h > 30 && ev.loc && (
        <div style={{ fontSize: 8.5, color: 'rgba(232,238,235,0.55)', marginTop: 2 }}>● {ev.loc}</div>
      )}
    </div>
  )
}

export function TeamViewScreenshot({ style }: { style?: CSSProperties }) {
  const slotH = SLOT_H
  const gridH = HOURS.length * slotH * 2
  return (
    <div
      style={{
        background: '#13201C',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        fontFamily: 'var(--font-sans)',
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: '#192924',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ color: '#CD4C38', fontSize: 10 }}>■</span>
          <span style={{ fontWeight: 700, color: '#E8EEEB', fontSize: 13 }}>herbe</span>
          <span style={{ fontSize: 9, color: 'rgba(232,238,235,0.4)', letterSpacing: '0.1em' }}>.calendar</span>
        </div>
        <div style={{ display: 'flex', gap: 2, background: '#1F332D', borderRadius: 6, padding: 2 }}>
          {['Day', '3D', '5D', 'Week', 'Month'].map(v => (
            <div
              key={v}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 500,
                background: v === 'Week' ? '#CD4C38' : 'transparent',
                color: v === 'Week' ? '#fff' : 'rgba(232,238,235,0.5)',
              }}
            >
              {v}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ color: '#E8EEEB', fontWeight: 600, fontSize: 13 }}>Mon 9 – Sun 15 Feb 2026</div>
        <div style={{ display: 'flex', gap: 3, marginLeft: 8 }}>
          {['◀', '▶'].map(arrow => (
            <div
              key={arrow}
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: '#1F332D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: 'rgba(232,238,235,0.5)',
              }}
            >
              {arrow}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#192924' }}>
        <div style={{ width: 44, flexShrink: 0 }}></div>
        {['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'].map(d => (
          <div
            key={d}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: 10,
              fontWeight: 600,
              color: d === 'Wed 11' ? '#CD4C38' : 'rgba(232,238,235,0.5)',
              borderRight: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {d}
            {d === 'Wed 11' && (
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#CD4C38', margin: '2px auto 0' }}></div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ width: 44, flexShrink: 0 }}></div>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, di) => (
          <div key={day} style={{ flex: 1, display: 'flex', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            {MOCK_PEOPLE.map((p, pi) => {
              const c = MOCK_COLORS[p.color]
              return (
                <div
                  key={p.code}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    padding: '5px 2px',
                    borderRight: pi < 3 ? '1px dashed rgba(255,255,255,0.04)' : 'none',
                    fontSize: 8.5,
                    color: 'rgba(232,238,235,0.6)',
                    fontWeight: 500,
                  }}
                >
                  {di === 0 && (
                    <>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: c + '33',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 7,
                          fontWeight: 700,
                          color: c,
                        }}
                      >
                        {p.code.charAt(0)}
                      </div>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', maxHeight: 320, overflow: 'hidden' }}>
        <div style={{ width: 44, flexShrink: 0 }}>
          {HOURS.map(h => (
            <div
              key={h}
              style={{
                height: slotH * 2,
                fontSize: 9,
                color: 'rgba(232,238,235,0.3)',
                textAlign: 'right',
                paddingRight: 6,
                paddingTop: 1,
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {[0, 1, 2, 3, 4].map(di => (
          <div
            key={di}
            style={{ flex: 1, display: 'flex', borderRight: '1px solid rgba(255,255,255,0.07)', position: 'relative' }}
          >
            {HOURS.map((h, hi) => (
              <div
                key={hi}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: hi * slotH * 2,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  height: slotH * 2,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: slotH,
                    borderBottom: '1px dotted rgba(255,255,255,0.02)',
                  }}
                ></div>
              </div>
            ))}
            {di === 2 && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 5.5 * slotH,
                  height: 2,
                  background: '#CD4C38',
                  zIndex: 10,
                  borderRadius: 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: -4,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#CD4C38',
                  }}
                ></div>
              </div>
            )}
            {MOCK_PEOPLE.map((p, pi) => {
              const evts = (MOCK_EVENTS[p.code] || [])
                .map(ev => ({ ...ev, start: ev.start + (di % 3) * 1.5 + (pi % 2) }))
                .filter(ev => ev.start >= 0 && ev.start + ev.dur <= 20)
              const shown = di === 0 ? evts : evts.filter((_, i) => (i + di) % 3 !== 0)
              return (
                <div
                  key={p.code}
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: gridH,
                    borderRight: pi < 3 ? '1px dashed rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  {shown.map((ev, ei) => (
                    <MockEventBlock key={ei} ev={ev} slotH={slotH} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '7px 14px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: '#192924',
          flexWrap: 'wrap',
        }}
      >
        {[
          { letter: 'B', label: 'ERP · Burti LV', color: '#CD4C38' },
          { letter: 'O', label: 'Outlook', color: '#4B5FAD' },
          { letter: 'G', label: 'Google', color: '#6B8E3D' },
          { letter: 'Z', label: 'Zoom', color: '#0F8FB3' },
          { letter: 'T', label: 'Teams', color: '#4B5FAD' },
        ].map(s => (
          <div
            key={s.letter}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'rgba(232,238,235,0.5)' }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: s.color + '33',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontWeight: 700,
                color: s.color,
              }}
            >
              {s.letter}
            </span>
            {s.label}
            <span style={{ color: '#6FAD6F', fontSize: 7 }}>●</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BookingScreenshot({ style }: { style?: CSSProperties }) {
  const slots = ['09:00', '09:45', '10:30', '11:15', '13:00', '13:45', '14:30', '15:15', '16:00']
  const disabledSlots = ['09:45', '13:00', '16:00']
  const today = 23
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - 2
    return day >= 1 && day <= 30 ? day : null
  })

  return (
    <div
      style={{
        display: 'flex',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        fontFamily: 'var(--font-sans)',
        maxWidth: 640,
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          width: '42%',
          background: '#13201C',
          color: '#E8EEEB',
          padding: '28px 22px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 18,
            height: 18,
            borderTop: '2px solid #CD4C38',
            borderLeft: '2px solid #CD4C38',
            opacity: 0.4,
          }}
        ></div>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 18,
            height: 18,
            borderTop: '2px solid #00AEE7',
            borderRight: '2px solid #00AEE7',
            opacity: 0.4,
          }}
        ></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 'auto' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            burti<span style={{ color: '#CD4C38' }}>.</span>
          </span>
          <span
            style={{
              fontSize: 8,
              color: 'rgba(232,238,235,0.4)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              borderLeft: '1px solid rgba(255,255,255,0.15)',
              paddingLeft: 6,
            }}
          >
            herbe.calendar
          </span>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(232,238,235,0.5)',
              marginBottom: 8,
            }}
          >
            Book a meeting · 45 min
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 }}>Fintech rollout kickoff</div>
          <div style={{ fontSize: 11, color: 'rgba(232,238,235,0.6)', lineHeight: 1.5, marginBottom: 16 }}>
            A short call to align on timeline and data migration approach.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#CD4C3833',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#CD4C38',
              }}
            >
              EK
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Elvis Kvalbergs</div>
              <div style={{ fontSize: 9, color: 'rgba(232,238,235,0.45)' }}>CEO · Burti LV</div>
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              color: 'rgba(232,238,235,0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div>⏱ 45 minutes</div>
            <div>📹 Microsoft Teams</div>
            <div>🌍 Europe/Riga · LV holidays</div>
          </div>
        </div>

        <div style={{ fontSize: 8, color: 'rgba(232,238,235,0.25)', marginTop: 20 }}>Powered by herbe.calendar</div>
      </div>

      <div style={{ flex: 1, background: '#F7F9F8', padding: '24px 20px' }}>
        <div style={{ fontSize: 10, color: '#9AA5A2', fontWeight: 500, marginBottom: 4 }}>Step 1 of 2</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#231F20', marginBottom: 16 }}>Pick a date & time</div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#231F20' }}>April 2026</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {['◀', '▶'].map(arrow => (
                  <div
                    key={arrow}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: '#E0E5E4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 8,
                      color: '#6B7B78',
                    }}
                  >
                    {arrow}
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 1,
                fontSize: 9,
                textAlign: 'center',
              }}
            >
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} style={{ color: '#9AA5A2', fontWeight: 500, padding: 3 }}>
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i}></div>
                const isWeekend = [5, 6, 12, 13, 19, 20, 26, 27].includes(i)
                const isSelected = day === today
                const avail = !isWeekend && day >= 21
                return (
                  <div
                    key={i}
                    style={{
                      padding: 4,
                      borderRadius: 5,
                      fontWeight: isSelected ? 700 : 400,
                      background: isSelected ? '#134A40' : 'transparent',
                      color: isSelected ? '#fff' : avail ? '#231F20' : '#ccc',
                    }}
                  >
                    {day}
                    {avail && !isSelected && (
                      <div
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          background: '#00AEE7',
                          margin: '1px auto 0',
                        }}
                      ></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ width: 90 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#231F20', marginBottom: 8 }}>Thu 23</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {slots.map(s => {
                const dis = disabledSlots.includes(s)
                const sel = s === '10:30'
                return (
                  <div
                    key={s}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 500,
                      textAlign: 'center',
                      background: sel ? '#134A40' : dis ? '#F0F0F0' : '#fff',
                      color: sel ? '#fff' : dis ? '#ccc' : '#231F20',
                      border: sel ? '1px solid #134A40' : '1px solid #E0E5E4',
                      textDecoration: dis ? 'line-through' : 'none',
                    }}
                  >
                    {s}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '6px 10px',
            background: '#E8F0EE',
            borderRadius: 6,
            fontSize: 8.5,
            color: '#6B7B78',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ color: '#2A8F94' }}>●</span> Availability checked across 4 sources in real-time
        </div>
      </div>
    </div>
  )
}

