# Herbe Calendar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first Next.js calendar app that shows and manages Herbe ERP activities and Outlook/Teams calendar events side-by-side for multiple employees, deployed on Vercel.

**Architecture:** Next.js App Router on Vercel; all ERP and Graph API calls proxied through Next.js API routes so credentials never reach the browser. Herbe ERP uses OAuth client credentials cached server-side; MS Graph uses Azure AD app-only auth. Sessions managed by NextAuth.js v5 with Neon (Postgres) as the adapter store.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, NextAuth.js v5, `@auth/pg-adapter`, Neon (Postgres), Microsoft Graph API, Herbe ERP REST API.

**Spec:** `docs/superpowers/specs/2026-03-12-herbe-calendar-design.md`

---

## File Map

```
herbe-calendar/
├── app/
│   ├── layout.tsx                         # Root layout, session provider
│   ├── page.tsx                           # Main calendar page (auth-gated)
│   ├── login/
│   │   └── page.tsx                       # Email input + "link sent" state
│   └── api/
│       ├── auth/[...nextauth]/route.ts     # NextAuth handler
│       ├── users/route.ts                  # GET UserVc
│       ├── activity-types/route.ts         # GET ActTypeVc
│       ├── activities/
│       │   ├── route.ts                    # GET + POST ActVc
│       │   └── [id]/route.ts               # PUT + DELETE ActVc
│       ├── projects/route.ts               # GET PRVc (searchable)
│       ├── customers/route.ts              # GET CUVc (searchable)
│       └── outlook/
│           ├── route.ts                    # GET + POST Graph calendar
│           └── [id]/route.ts               # PUT + DELETE Graph calendar
├── components/
│   ├── CalendarShell.tsx                   # Client entry point: state, data fetching, form orchestration
│   ├── CalendarHeader.tsx                  # Toolbar: date nav, view toggle, person chips, + New
│   ├── PersonSelector.tsx                  # Modal: search + add/remove people
│   ├── CalendarGrid.tsx                    # Outer scroll container
│   ├── TimeColumn.tsx                      # Sticky left hour labels
│   ├── PersonColumn.tsx                    # One person's time column
│   ├── ActivityBlock.tsx                   # Positioned activity block (Herbe or Outlook)
│   ├── ActivityForm.tsx                    # Bottom sheet / modal: create, edit, duplicate
│   └── ErrorBanner.tsx                     # Inline error display inside ActivityForm
├── lib/
│   ├── herbe/
│   │   ├── client.ts                       # OAuth token cache + authenticated fetch
│   │   └── constants.ts                    # Register names, field constants
│   ├── graph/
│   │   └── client.ts                       # Azure AD app-only token + authenticated fetch
│   ├── auth.ts                             # NextAuth config + sendVerificationRequest
│   ├── colors.ts                           # Person → Burti brand color mapping
│   └── time.ts                             # Time math helpers (snap to 15min, px↔time)
├── types/
│   └── index.ts                            # Shared TS interfaces
├── __tests__/
│   ├── lib/herbe/client.test.ts
│   ├── lib/colors.test.ts
│   ├── lib/time.test.ts
│   └── api/activities.test.ts
├── .env.local.example
├── .gitignore
└── jest.config.ts
```

---

## Chunk 1: Project Foundation

### Task 1: Bootstrap Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local.example`

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Users/elviskvalbergs/AI/herbe-calendar
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --yes
```

- [ ] **Step 2: Install project dependencies**

```bash
npm install next-auth@beta @auth/pg-adapter pg date-fns
npm install --save-dev @types/pg jest jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom \
  ts-jest @types/jest
```

- [ ] **Step 3: Create `.env.local.example`**

```bash
# Herbe ERP
HERBE_API_BASE_URL=https://roniscloud.burti.lv:6012/api
HERBE_COMPANY_CODE=3
HERBE_CLIENT_ID=
HERBE_CLIENT_SECRET=
HERBE_TOKEN_URL=https://standard-id.hansaworld.com/oauth/token

# Microsoft (Azure AD app registration)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_SENDER_EMAIL=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Neon
DATABASE_URL=
```

- [ ] **Step 4: Update `.gitignore` to exclude secrets and brainstorm artifacts**

Add these lines to `.gitignore`:
```
.env.local
.superpowers/
```

- [ ] **Step 5: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest'
const config: Config = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
}
export default config
```

- [ ] **Step 6: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json next.config.ts .gitignore .env.local.example jest.config.ts
git commit -m "chore: bootstrap Next.js project with dependencies"
```

---

### Task 2: Shared types and Tailwind theme

**Files:**
- Create: `types/index.ts`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Write `types/index.ts`**

```typescript
export type Source = 'herbe' | 'outlook'

export interface Person {
  code: string      // e.g. "EKS"
  name: string
  email: string
}

export interface Activity {
  id: string
  source: Source
  personCode: string
  description: string
  date: string         // "YYYY-MM-DD"
  timeFrom: string     // "HH:mm"
  timeTo: string       // "HH:mm"
  activityTypeCode?: string
  activityTypeName?: string
  projectCode?: string
  projectName?: string
  customerCode?: string
  customerName?: string
  accessGroup?: string  // comma-separated person codes (Herbe)
  isOrganizer?: boolean // Outlook only
}

export interface ActivityType {
  code: string
  name: string
}

export interface SearchResult {
  code: string
  name: string
}

export interface CalendarState {
  view: 'day' | '3day'
  date: string           // "YYYY-MM-DD" — anchor date
  selectedPersons: Person[]
}
```

- [ ] **Step 2: Configure Tailwind with Burti brand tokens in `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#231f20',
        surface:   '#2d2829',
        border:    '#3a3435',
        primary:   '#cd4c38',
        'person-1': '#00ABCE',
        'person-2': '#cd4c38',
        'person-3': '#4db89a',
        'text-muted': '#6b6467',
      },
    },
  },
}
export default config
```

- [ ] **Step 3: Replace `app/globals.css` content**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  background-color: #231f20;
  color: #ffffff;
  height: 100%;
  overscroll-behavior: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add types/index.ts tailwind.config.ts app/globals.css
git commit -m "chore: add shared types and Burti brand Tailwind theme"
```

---

## Chunk 2: Herbe ERP Client

### Task 3: Herbe constants and OAuth client

**Files:**
- Create: `lib/herbe/constants.ts`, `lib/herbe/client.ts`
- Create: `__tests__/lib/herbe/client.test.ts`

- [ ] **Step 1: Write failing tests for the Herbe client**

Create `__tests__/lib/herbe/client.test.ts`:

```typescript
import { getHerbeToken, herbeUrl } from '@/lib/herbe/client'

describe('herbeUrl', () => {
  it('constructs the correct ERP endpoint URL', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com/api'
    process.env.HERBE_COMPANY_CODE = '3'
    expect(herbeUrl('ActVc')).toBe('https://example.com/api/3/ActVc')
  })

  it('appends query string when provided', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com/api'
    process.env.HERBE_COMPANY_CODE = '3'
    expect(herbeUrl('ActVc', 'limit=100&offset=0')).toBe(
      'https://example.com/api/3/ActVc?limit=100&offset=0'
    )
  })
})

describe('getHerbeToken', () => {
  it('throws if HERBE_CLIENT_ID is missing', async () => {
    delete process.env.HERBE_CLIENT_ID
    await expect(getHerbeToken()).rejects.toThrow('HERBE_CLIENT_ID')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/lib/herbe/client.test.ts --no-coverage
```
Expected: FAIL — `getHerbeToken`, `herbeUrl` not defined

- [ ] **Step 3: Create `lib/herbe/constants.ts`**

```typescript
// Field name for multi-person activity assignment in ActVc.
// Verify against actual ActVc field list and update here if different.
export const ACTIVITY_ACCESS_GROUP_FIELD = 'AccessGroup'

export const REGISTERS = {
  activities:      'ActVc',
  users:           'UserVc',
  activityTypes:   'ActTypeVc',
  projects:        'PRVc',
  customers:       'CUVc',
} as const
```

- [ ] **Step 4: Create `lib/herbe/client.ts`**

```typescript
interface TokenCache {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

export function herbeUrl(register: string, query?: string): string {
  const base = process.env.HERBE_API_BASE_URL!
  const company = process.env.HERBE_COMPANY_CODE!
  const url = `${base}/${company}/${register}`
  return query ? `${url}?${query}` : url
}

export async function getHerbeToken(): Promise<string> {
  const clientId = process.env.HERBE_CLIENT_ID
  const clientSecret = process.env.HERBE_CLIENT_SECRET
  const tokenUrl = process.env.HERBE_TOKEN_URL

  if (!clientId) throw new Error('HERBE_CLIENT_ID is not set')
  if (!clientSecret) throw new Error('HERBE_CLIENT_SECRET is not set')
  if (!tokenUrl) throw new Error('HERBE_TOKEN_URL is not set')

  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) throw new Error(`Herbe OAuth failed: ${res.status}`)
  const data = await res.json()

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenCache.token
}

export async function herbeFetch(
  register: string,
  query?: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getHerbeToken()
  return fetch(herbeUrl(register, query), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

/** Fetch all pages for a register. Stops when a page has fewer records than limit. */
export async function herbeFetchAll(
  register: string,
  params: Record<string, string> = {},
  limit = 100
): Promise<unknown[]> {
  const results: unknown[] = []
  let offset = 0
  while (true) {
    const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) }).toString()
    const res = await herbeFetch(register, query)
    if (!res.ok) throw new Error(`Herbe ${register} fetch failed: ${res.status}`)
    const page: unknown[] = await res.json()
    results.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return results
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest __tests__/lib/herbe/client.test.ts --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/herbe/ __tests__/lib/herbe/
git commit -m "feat: add Herbe ERP OAuth client with token caching"
```

---

### Task 4: Herbe API proxy routes

**Files:**
- Create: `app/api/users/route.ts`
- Create: `app/api/activity-types/route.ts`
- Create: `app/api/activities/route.ts`
- Create: `app/api/activities/[id]/route.ts`
- Create: `app/api/projects/route.ts`
- Create: `app/api/customers/route.ts`
- Create: `__tests__/api/activities.test.ts`
- Create: `lib/herbe/auth-guard.ts`

- [ ] **Step 1: Write failing tests for activities route**

Create `__tests__/api/activities.test.ts`:

```typescript
import { GET, POST } from '@/app/api/activities/route'

// Mock Herbe client
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchAll: jest.fn().mockResolvedValue([]),
  herbeUrl: jest.fn().mockReturnValue('http://mock/3/ActVc'),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
}))

describe('GET /api/activities', () => {
  it('returns 400 if persons param is missing', async () => {
    const req = new Request('http://localhost/api/activities')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty array when no activities', async () => {
    const req = new Request('http://localhost/api/activities?persons=EKS&date=2026-03-12')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/activities.test.ts --no-coverage
```
Expected: FAIL — modules not found

- [ ] **Step 3: Create `lib/herbe/auth-guard.ts`**

```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export interface SessionUser {
  userCode: string
  email: string
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.email) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  return {
    userCode: (session.user as { userCode?: string }).userCode ?? '',
    email: session.user.email,
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

- [ ] **Step 4: Create `app/api/users/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  try {
    const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
    return NextResponse.json(users)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Create `app/api/activity-types/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  try {
    const types = await herbeFetchAll(REGISTERS.activityTypes, {}, 1000)
    return NextResponse.json(types)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 6: Create `app/api/activities/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch, herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? date
  const dateTo = searchParams.get('dateTo') ?? date

  if (!persons) return NextResponse.json({ error: 'persons required' }, { status: 400 })
  if (!dateFrom) return NextResponse.json({ error: 'date required' }, { status: 400 })

  try {
    // Fetch for each person in parallel
    const personList = persons.split(',').map(p => p.trim())
    const allActivities = await Promise.all(
      personList.map(code =>
        herbeFetchAll(REGISTERS.activities, {
          // Filter field names: verify against ActVc docs; see ACTIVITY_ACCESS_GROUP_FIELD in constants.ts
          // 'Person' and date fields may differ — update constants.ts if needed
          filter: `Person eq '${code}'`,
          dateFrom: dateFrom!,
          dateTo: dateTo!,
        })
      )
    )
    return NextResponse.json(allActivities.flat())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const body = await req.json()
    const res = await herbeFetch(REGISTERS.activities, undefined, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

> **Note:** The `filter` parameter format and field names for date/person filtering must be verified against the Herbe API docs and real ActVc responses during development. Adjust field names in `constants.ts` accordingly.

- [ ] **Step 7: Create `app/api/activities/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'

async function fetchActivity(id: string) {
  const res = await herbeFetch(REGISTERS.activities, `id=${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const owner = activity['Person'] as string | undefined
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
  if (owner === userCode) return true
  if (accessGroup?.split(',').map(s => s.trim()).includes(userCode)) return true
  return false
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const activity = await fetchActivity(params.id)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const body = await req.json()
    const res = await herbeFetch(REGISTERS.activities, `id=${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const activity = await fetchActivity(params.id)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const res = await herbeFetch(REGISTERS.activities, `id=${params.id}`, { method: 'DELETE' })
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 8: Create `app/api/projects/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])
  try {
    const results = await herbeFetchAll(REGISTERS.projects, { filter: `Name ct '${q}'` }, 20)
    return NextResponse.json(results)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 9: Create `app/api/customers/route.ts`** (same pattern as projects)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])
  try {
    const results = await herbeFetchAll(REGISTERS.customers, { filter: `Name ct '${q}'` }, 20)
    return NextResponse.json(results)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 10: Run all tests**

```bash
npx jest --no-coverage
```
Expected: PASS (all existing tests)

- [ ] **Step 11: Commit**

```bash
git add app/api/ lib/herbe/auth-guard.ts __tests__/api/
git commit -m "feat: add Herbe ERP proxy API routes with auth guard and fetch-before-mutate"
```

---

## Chunk 3: Auth & Login

### Task 5: NextAuth configuration + Neon setup

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/graph/client.ts`
- Create: `app/login/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `lib/graph/client.ts`** (needed by auth for email sending)

```typescript
interface GraphTokenCache {
  token: string
  expiresAt: number
}

let graphTokenCache: GraphTokenCache | null = null

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID!
  const clientId = process.env.AZURE_CLIENT_ID!
  const clientSecret = process.env.AZURE_CLIENT_SECRET!

  if (graphTokenCache && Date.now() < graphTokenCache.expiresAt - 30_000) {
    return graphTokenCache.token
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  if (!res.ok) throw new Error(`Graph OAuth failed: ${res.status}`)
  const data = await res.json()
  graphTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return graphTokenCache.token
}

export async function graphFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getGraphToken()
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const sender = process.env.AZURE_SENDER_EMAIL!
  const res = await graphFetch(`/users/${sender}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  })
  if (!res.ok) throw new Error(`sendMail failed: ${res.status} ${await res.text()}`)
}
```

- [ ] **Step 2: Create `lib/auth.ts`**

```typescript
import NextAuth from 'next-auth'
import { PgAdapter } from '@auth/pg-adapter'
import { Pool } from 'pg'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { sendMail } from '@/lib/graph/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function isEmailRegistered(email: string): Promise<{ registered: boolean; userCode: string }> {
  const users = await herbeFetchAll(REGISTERS.users, { filter: `Email eq '${email}'` }, 10)
  if (users.length === 0) return { registered: false, userCode: '' }
  const user = users[0] as Record<string, unknown>
  return { registered: true, userCode: String(user['Code'] ?? '') }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  providers: [
    {
      id: 'email',
      type: 'email',
      name: 'Email',
      from: process.env.AZURE_SENDER_EMAIL!,
      server: {},
      maxAge: 24 * 60 * 60,
      options: {},
      async sendVerificationRequest({ identifier: email, url }) {
        const { registered } = await isEmailRegistered(email)
        if (!registered) {
          // Do not send — the login page will show an error via the error query param
          // We throw here so NextAuth shows an error callback
          throw new Error('EMAIL_NOT_REGISTERED')
        }
        await sendMail(
          email,
          'Your Herbe Calendar sign-in link',
          `<p>Click the link below to sign in to Herbe Calendar. The link expires in 24 hours.</p>
           <p><a href="${url}" style="background:#cd4c38;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;display:inline-block;">Sign in</a></p>
           <p>If you did not request this, you can safely ignore this email.</p>`
        )
      },
    },
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach userCode to session; fall back to '' if ERP is temporarily unavailable
      try {
        const { userCode } = await isEmailRegistered(user.email)
        ;(session.user as { userCode?: string }).userCode = userCode
      } catch {
        ;(session.user as { userCode?: string }).userCode = ''
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
```

- [ ] **Step 3: Create `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 4: Create `app/login/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('email', { email, redirect: false })
    setLoading(false)
    if (res?.error === 'EMAIL_NOT_REGISTERED') {
      setError('This email is not registered in Herbe. Contact your administrator.')
    } else if (res?.error) {
      setError('Something went wrong. Please try again.')
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border p-8">
        <h1 className="text-2xl font-bold mb-1">herbe<span className="text-primary">.</span>calendar</h1>
        <p className="text-text-muted text-sm mb-6">Sign in with your company email</p>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-semibold mb-2">Check your email</p>
            <p className="text-text-muted text-sm">We sent a sign-in link to <strong>{email}</strong></p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@burti.lv"
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update `app/layout.tsx` to wrap with SessionProvider**

```tsx
import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

export const metadata: Metadata = { title: 'Herbe Calendar' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Run the dev server to verify login page renders without errors**

```bash
# Copy env example and fill in at least NEXTAUTH_SECRET and DATABASE_URL for local dev
cp .env.local.example .env.local
npm run dev
```
Open `http://localhost:3000/login` — expect to see the login form with Burti styling.

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts lib/graph/client.ts app/api/auth/ app/login/ app/layout.tsx
git commit -m "feat: add NextAuth magic link auth with MS Graph email and UserVc validation"
```

---

## Chunk 4: MS Graph Outlook Routes

### Task 6: Outlook calendar proxy routes

**Files:**
- Create: `app/api/outlook/route.ts`
- Create: `app/api/outlook/[id]/route.ts`

- [ ] **Step 1: Create `app/api/outlook/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'

// Cache the full user list for the lifetime of the server process (small list, rarely changes)
let userListCache: Record<string, string> | null = null  // code → email

async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache) {
    const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
    userListCache = Object.fromEntries(
      (users as Record<string, unknown>[])
        .filter(u => u['Code'] && u['Email'])
        .map(u => [u['Code'] as string, u['Email'] as string])
    )
  }
  return userListCache[code] ?? null
}

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? date
  const dateTo = searchParams.get('dateTo') ?? date

  if (!persons || !dateFrom) return NextResponse.json({ error: 'persons and date required' }, { status: 400 })

  const personList = persons.split(',').map(p => p.trim())

  try {
    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code)
      if (!email) return []

      // Use calendarView for date-range queries; exclude recurring series masters
      const startDt = `${dateFrom}T00:00:00`
      const endDt = `${dateTo ?? dateFrom}T23:59:59`
      const res = await graphFetch(
        `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$filter=type eq 'singleInstance'&$top=100`
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.value ?? []).map((ev: Record<string, unknown>) => ({
        ...ev,
        _personCode: code,
        _source: 'outlook',
      }))
    }))
    return NextResponse.json(results.flat())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const body = await req.json()
    const email = session.email
    const res = await graphFetch(`/users/${email}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 201 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/outlook/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    // Fetch the event to check organizer
    const check = await graphFetch(`/users/${session.email}/events/${params.id}`)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const body = await req.json()
    const res = await graphFetch(`/users/${session.email}/events/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const check = await graphFetch(`/users/${session.email}/events/${params.id}`)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const res = await graphFetch(`/users/${session.email}/events/${params.id}`, { method: 'DELETE' })
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write and run tests for Outlook organizer permission guard**

Create `__tests__/api/outlook.test.ts`:

```typescript
import { PUT, DELETE } from '@/app/api/outlook/[id]/route'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
  forbidden: jest.fn(() => new Response('Forbidden', { status: 403 })),
}))

const { graphFetch } = require('@/lib/graph/client')

describe('PUT /api/outlook/[id] — organizer guard', () => {
  it('returns 403 when session user is not the organizer', async () => {
    graphFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ organizer: { emailAddress: { address: 'other@example.com' } } }),
    })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'updated' }),
    })
    const res = await PUT(req, { params: { id: 'evt1' } })
    expect(res.status).toBe(403)
  })

  it('calls PATCH when session user is the organizer', async () => {
    graphFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizer: { emailAddress: { address: 'eks@example.com' } } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'updated' }),
    })
    const res = await PUT(req, { params: { id: 'evt1' } })
    expect(graphFetch).toHaveBeenCalledWith(
      expect.stringContaining('evt1'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})
```

```bash
npx jest __tests__/api/outlook.test.ts --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/outlook/ __tests__/api/outlook.test.ts
git commit -m "feat: add MS Graph Outlook calendar proxy routes with organizer permission guard"
```

---

## Chunk 5: Core Calendar UI

### Task 7: Time and color utilities

**Files:**
- Create: `lib/time.ts`
- Create: `lib/colors.ts`
- Create: `__tests__/lib/time.test.ts`
- Create: `__tests__/lib/colors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/time.test.ts`:
```typescript
import { timeToMinutes, minutesToPx, snapToQuarter, pxToMinutes } from '@/lib/time'

describe('timeToMinutes', () => {
  it('converts "08:00" to 480', () => expect(timeToMinutes('08:00')).toBe(480))
  it('converts "00:00" to 0', () => expect(timeToMinutes('00:00')).toBe(0))
  it('converts "22:30" to 1350', () => expect(timeToMinutes('22:30')).toBe(1350))
})

describe('snapToQuarter', () => {
  it('rounds 487 to 480 (08:00)', () => expect(snapToQuarter(487)).toBe(480))
  it('rounds 497 to 495 (08:15)', () => expect(snapToQuarter(497)).toBe(495))
  it('rounds 510 to 510 (08:30)', () => expect(snapToQuarter(510)).toBe(510))
})

describe('minutesToPx / pxToMinutes', () => {
  // Grid: 56px per hour = 56/60 px per minute
  it('converts 60 minutes to 56px', () => expect(minutesToPx(60)).toBeCloseTo(56))
  it('round-trips 120 minutes', () => expect(pxToMinutes(minutesToPx(120))).toBeCloseTo(120))
})
```

Create `__tests__/lib/colors.test.ts`:
```typescript
import { personColor } from '@/lib/colors'

describe('personColor', () => {
  it('returns High Sky for index 0', () => expect(personColor(0)).toBe('#00ABCE'))
  it('returns Rowanberry for index 1', () => expect(personColor(1)).toBe('#cd4c38'))
  it('returns Forest Green for index 2', () => expect(personColor(2)).toBe('#4db89a'))
  it('cycles back to index 0 color at index 3', () => {
    const color3 = personColor(3)
    expect(color3).toContain('rgba')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest __tests__/lib/time.test.ts __tests__/lib/colors.test.ts --no-coverage
```

- [ ] **Step 3: Create `lib/time.ts`**

```typescript
/** Convert "HH:mm" to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert minutes since midnight to "HH:mm" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const PX_PER_HOUR = 56
const PX_PER_MINUTE = PX_PER_HOUR / 60

/** Convert minutes to pixel offset in the time grid */
export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE
}

/** Convert pixel offset to minutes */
export function pxToMinutes(px: number): number {
  return px / PX_PER_MINUTE
}

/** Snap minutes to nearest 15-minute boundary */
export function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/** Grid start hour */
export const GRID_START_HOUR = 6
export const GRID_END_HOUR = 22
export const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60

/** Offset in px from top of grid for a given "HH:mm" time */
export function timeToTopPx(time: string): number {
  return minutesToPx(timeToMinutes(time) - GRID_START_HOUR * 60)
}

/** Height in px for a duration from timeFrom to timeTo */
export function durationToPx(timeFrom: string, timeTo: string): number {
  return minutesToPx(timeToMinutes(timeTo) - timeToMinutes(timeFrom))
}
```

- [ ] **Step 4: Create `lib/colors.ts`**

```typescript
const BASE_COLORS = ['#00ABCE', '#cd4c38', '#4db89a'] as const

/** Get a consistent brand color for a person by their zero-based index in the view. */
export function personColor(index: number): string {
  const base = BASE_COLORS[index % 3]
  if (index < 3) return base
  // 4th person onwards: tinted at 70% opacity as rgba
  const r = parseInt(base.slice(1, 3), 16)
  const g = parseInt(base.slice(3, 5), 16)
  const b = parseInt(base.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.7)`
}

/** Return Tailwind-compatible CSS variables for a person column */
export function personStyle(index: number): React.CSSProperties {
  const color = personColor(index)
  return { '--person-color': color } as React.CSSProperties
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/lib/time.test.ts __tests__/lib/colors.test.ts --no-coverage
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/time.ts lib/colors.ts __tests__/lib/time.test.ts __tests__/lib/colors.test.ts
git commit -m "feat: add time math and person color utilities"
```

---

### Task 8: Calendar page and header

**Files:**
- Create: `components/CalendarHeader.tsx`
- Create: `components/PersonSelector.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `app/page.tsx`** (auth-gated shell with data fetching)

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CalendarShell from '@/components/CalendarShell'

export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <CalendarShell userCode={(session.user as { userCode?: string }).userCode ?? ''} />
}
```

- [ ] **Step 2: Create `components/CalendarShell.tsx`** (client entry point)

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Person, Activity, CalendarState } from '@/types'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import ActivityForm from './ActivityForm'
import { format } from 'date-fns'

interface Props { userCode: string }

export default function CalendarShell({ userCode }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const [state, setState] = useState<CalendarState>({
    view: 'day',
    date: format(new Date(), 'yyyy-MM-dd'),
    selectedPersons: [],
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [formState, setFormState] = useState<{ open: boolean; initial?: Partial<Activity>; editId?: string }>({ open: false })

  // Load people list on mount
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((users: Record<string, unknown>[]) => {
      const list: Person[] = users.map(u => ({
        code: u['Code'] as string,
        name: u['Name'] as string,
        email: u['Email'] as string,
      }))
      setPeople(list)
      // Default: show logged-in user
      const me = list.find(p => p.code === userCode)
      if (me) setState(s => ({ ...s, selectedPersons: [me] }))
    })
  }, [userCode])

  const fetchActivities = useCallback(async () => {
    if (!state.selectedPersons.length) return
    setLoading(true)
    const codes = state.selectedPersons.map(p => p.code).join(',')
    // For 3-day view, fetch the full date range
    const dateFrom = state.date
    const dateTo = state.view === '3day'
      ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
      : state.date
    const dateParam = dateFrom === dateTo
      ? `date=${dateFrom}`
      : `dateFrom=${dateFrom}&dateTo=${dateTo}`
    const [herbeRes, outlookRes] = await Promise.all([
      fetch(`/api/activities?persons=${codes}&${dateParam}`),
      fetch(`/api/outlook?persons=${codes}&${dateParam}`),
    ])
    const herbe = herbeRes.ok ? await herbeRes.json() : []
    const outlook = outlookRes.ok ? await outlookRes.json() : []
    setActivities([...herbe, ...outlook])
    setLoading(false)
  }, [state.selectedPersons, state.date])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <CalendarHeader
        state={state}
        onStateChange={setState}
        people={people}
        onNewActivity={() => setFormState({ open: true })}
      />
      <CalendarGrid
        state={state}
        activities={activities}
        loading={loading}
        sessionUserCode={userCode}
        onRefresh={fetchActivities}
        onSlotClick={(personCode, time) =>
          setFormState({ open: true, initial: { personCode, timeFrom: time, date: state.date } })
        }
        onActivityClick={(activity) =>
          setFormState({ open: true, initial: activity, editId: activity.id })
        }
        onActivityUpdate={fetchActivities}
      />
      {formState.open && (
        <ActivityForm
          initial={formState.initial}
          editId={formState.editId}
          people={people}
          defaultPersonCode={userCode}
          todayActivities={activities.filter(a => a.date === state.date)}
          onClose={() => setFormState({ open: false })}
          onSaved={fetchActivities}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/CalendarHeader.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Person, CalendarState } from '@/types'
import { personColor } from '@/lib/colors'
import PersonSelector from './PersonSelector'

interface Props {
  state: CalendarState
  onStateChange: (s: CalendarState) => void
  people: Person[]
  onNewActivity: () => void
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity }: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)

  function navigate(delta: number) {
    const d = addDays(parseISO(state.date), delta)
    onStateChange({ ...state, date: format(d, 'yyyy-MM-dd') })
  }

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
      {/* Title */}
      <span className="font-bold text-base mr-auto">
        herbe<span className="text-primary">.</span>calendar
      </span>

      {/* Date navigation */}
      <button onClick={() => navigate(-1)} className="text-text-muted px-2 py-1 rounded hover:bg-border">‹</button>
      <span className="text-sm font-semibold whitespace-nowrap">
        {format(parseISO(state.date), 'd MMM yyyy')}
      </span>
      <button onClick={() => navigate(1)} className="text-text-muted px-2 py-1 rounded hover:bg-border">›</button>

      {/* View toggle */}
      <div className="flex rounded overflow-hidden border border-border text-xs font-bold">
        {(['day', '3day'] as const).map(v => (
          <button
            key={v}
            onClick={() => onStateChange({ ...state, view: v })}
            className={`px-3 py-1 ${state.view === v ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            {v === 'day' ? 'Day' : '3 Day'}
          </button>
        ))}
      </div>

      {/* Person chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {state.selectedPersons.map((p, i) => (
          <span
            key={p.code}
            className="px-2 py-0.5 rounded-full text-xs font-bold border"
            style={{ color: personColor(i), borderColor: personColor(i) + '44', background: personColor(i) + '22' }}
          >
            {p.code}
          </span>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="text-text-muted text-xl leading-none px-1"
          title="Add person"
        >+</button>
      </div>

      {/* New activity */}
      <button
        onClick={onNewActivity}
        className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg"
      >
        + New
      </button>

      {selectorOpen && (
        <PersonSelector
          people={people}
          selected={state.selectedPersons}
          onClose={() => setSelectorOpen(false)}
          onChange={persons => {
            onStateChange({ ...state, selectedPersons: persons })
            setSelectorOpen(false)
          }}
        />
      )}
    </header>
  )
}
```

- [ ] **Step 4: Create `components/PersonSelector.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Person } from '@/types'
import { personColor } from '@/lib/colors'

interface Props {
  people: Person[]
  selected: Person[]
  onChange: (persons: Person[]) => void
  onClose: () => void
}

export default function PersonSelector({ people, selected, onChange, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState<Person[]>(selected)

  const filtered = people.filter(p =>
    p.code.toLowerCase().includes(query.toLowerCase()) ||
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  function toggle(person: Person) {
    setLocal(prev =>
      prev.find(p => p.code === person.code)
        ? prev.filter(p => p.code !== person.code)
        : [...prev, person]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-bold mb-3">Select people</h2>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.map((p, i) => {
            const isSelected = local.some(s => s.code === p.code)
            const colorIndex = local.findIndex(s => s.code === p.code)
            return (
              <button
                key={p.code}
                onClick={() => toggle(p)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-border text-left"
              >
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full border"
                  style={isSelected ? {
                    color: personColor(colorIndex),
                    borderColor: personColor(colorIndex) + '44',
                    background: personColor(colorIndex) + '22',
                  } : { color: '#6b6467', borderColor: '#3a3435' }}
                >
                  {p.code}
                </span>
                <span className="text-sm">{p.name}</span>
                {isSelected && <span className="ml-auto text-primary">✓</span>}
              </button>
            )
          })}
        </div>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => onChange(local)}
            className="w-full bg-primary text-white font-bold py-2.5 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/CalendarShell.tsx components/CalendarHeader.tsx components/PersonSelector.tsx
git commit -m "feat: add calendar page shell, header, and person selector"
```

---

### Task 9: Time grid and activity blocks

**Files:**
- Create: `components/CalendarGrid.tsx`
- Create: `components/TimeColumn.tsx`
- Create: `components/PersonColumn.tsx`
- Create: `components/ActivityBlock.tsx`

- [ ] **Step 1: Create `components/TimeColumn.tsx`**

```tsx
import { GRID_START_HOUR, GRID_END_HOUR } from '@/lib/time'

export default function TimeColumn() {
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, i) => GRID_START_HOUR + i
  )
  return (
    <div className="w-12 shrink-0 sticky left-0 z-10 bg-surface">
      <div className="h-10 border-b border-border" /> {/* header spacer */}
      {hours.map(h => (
        <div key={h} className="h-14 border-b border-border/30 relative">
          <span className="absolute -top-2 right-2 text-[10px] text-text-muted">
            {String(h).padStart(2, '0')}:00
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/ActivityBlock.tsx`**

```tsx
'use client'
import { Activity } from '@/types'
import { timeToTopPx, durationToPx } from '@/lib/time'

interface Props {
  activity: Activity
  color: string
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  style?: React.CSSProperties
}

export default function ActivityBlock({ activity, color, onClick, onDragStart, canEdit, style }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const height = Math.max(durationToPx(activity.timeFrom, activity.timeTo), 20)
  const isOutlook = activity.source === 'outlook'

  return (
    <div
      className="absolute left-1 right-1 rounded overflow-hidden cursor-pointer select-none"
      style={{
        top,
        height,
        background: color + '33',
        borderLeft: isOutlook ? `2px dashed ${color}` : `3px solid ${color}`,
        opacity: isOutlook ? 0.85 : 1,
        ...style,
      }}
      onClick={() => onClick(activity)}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      <div className="px-1.5 py-0.5">
        <p className="text-[10px] font-bold truncate" style={{ color }}>
          {isOutlook && '📅 '}{activity.description || '(no title)'}
        </p>
        <p className="text-[9px] text-text-muted truncate">
          {activity.timeFrom}–{activity.timeTo}
          {activity.customerName ? ` · ${activity.customerName}` : ''}
        </p>
      </div>
      {/* Resize handle */}
      {canEdit && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/PersonColumn.tsx`**

```tsx
'use client'
import { Activity } from '@/types'
import { GRID_START_HOUR, GRID_END_HOUR, minutesToTime, timeToMinutes, snapToQuarter, pxToMinutes } from '@/lib/time'
import ActivityBlock from './ActivityBlock'
import { personColor } from '@/lib/colors'
import { useRef, useState } from 'react'

interface Props {
  personCode: string
  personIndex: number
  date: string
  activities: Activity[]
  sessionUserCode: string
  onSlotClick: (personCode: string, time: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
}

interface DragState {
  activity: Activity
  type: 'move' | 'resize'
  startY: number
  originalFrom: string
  originalTo: string
  currentFrom: string
  currentTo: string
}

export default function PersonColumn({
  personCode, personIndex, date, activities, sessionUserCode,
  onSlotClick, onActivityClick, onActivityUpdate
}: Props) {
  const color = personColor(personIndex)
  const columnRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

  function canEdit(activity: Activity): boolean {
    if (activity.source === 'outlook') return !!activity.isOrganizer
    if (!activity.accessGroup) return activity.personCode === sessionUserCode
    return activity.personCode === sessionUserCode ||
      activity.accessGroup.split(',').map(s => s.trim()).includes(sessionUserCode)
  }

  function handleSlotClick(hour: number, e: React.MouseEvent) {
    if (drag) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const fraction = offsetY / rect.height
    const minute = snapToQuarter(hour * 60 + fraction * 60)
    onSlotClick(personCode, minutesToTime(minute))
  }

  function handleDragStart(e: React.PointerEvent, activity: Activity, type: 'move' | 'resize') {
    e.preventDefault()
    const state: DragState = {
      activity, type, startY: e.clientY,
      originalFrom: activity.timeFrom, originalTo: activity.timeTo,
      currentFrom: activity.timeFrom, currentTo: activity.timeTo,
    }
    setDrag(state)

    function onMove(me: PointerEvent) {
      if (!columnRef.current) return
      const deltaY = me.clientY - state.startY
      const deltaMins = snapToQuarter(Math.round(pxToMinutes(deltaY) / 15) * 15)
      if (type === 'move') {
        const fromMins = timeToMinutes(state.originalFrom) + deltaMins
        const toMins = timeToMinutes(state.originalTo) + deltaMins
        state.currentFrom = minutesToTime(Math.max(GRID_START_HOUR * 60, fromMins))
        state.currentTo = minutesToTime(Math.min(GRID_END_HOUR * 60, toMins))
      } else {
        const toMins = timeToMinutes(state.originalTo) + deltaMins
        state.currentTo = minutesToTime(Math.max(timeToMinutes(state.originalFrom) + 15, Math.min(GRID_END_HOUR * 60, toMins)))
      }
      setDrag({ ...state })
    }

    async function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (state.currentFrom === state.originalFrom && state.currentTo === state.originalTo) {
        setDrag(null)
        return
      }
      // Optimistically clear drag
      setDrag(null)
      // Save
      const source = activity.source
      const url = source === 'herbe' ? `/api/activities/${activity.id}` : `/api/outlook/${activity.id}`
      const body = source === 'herbe'
        ? { TimeFrom: state.currentFrom, TimeTo: state.currentTo }
        : { start: { dateTime: `${date}T${state.currentFrom}:00` }, end: { dateTime: `${date}T${state.currentTo}:00` } }
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        // Snap back — just refetch
        alert('Could not save time change: ' + (await res.json()).error ?? res.statusText)
      }
      onActivityUpdate()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Group overlapping activities into sub-columns
  const sorted = [...activities].sort((a, b) => a.timeFrom.localeCompare(b.timeFrom))
  const groups: Activity[][] = []
  for (const act of sorted) {
    const col = groups.find(g => timeToMinutes(g[g.length - 1].timeTo) <= timeToMinutes(act.timeFrom))
    if (col) col.push(act)
    else groups.push([act])
  }

  return (
    <div ref={columnRef} className="flex-1 min-w-[44vw] sm:min-w-0 border-r border-border relative">
      {/* Person header */}
      <div
        className="h-10 border-b border-border flex items-center justify-center text-xs font-bold sticky top-0 z-10 bg-surface"
        style={{ color }}
      >
        {personCode}
      </div>

      {/* Hour rows */}
      <div className="relative">
        {hours.map(h => (
          <div
            key={h}
            className="h-14 border-b border-border/30 hover:bg-white/5 cursor-pointer relative"
            onClick={(e) => handleSlotClick(h, e)}
          >
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
          </div>
        ))}

        {/* Activity blocks */}
        {groups.map((col, colIdx) =>
          col.map(act => {
            const isDragging = drag?.activity.id === act.id
            const displayActivity = isDragging
              ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
              : act
            return (
              <div
                key={act.id}
                className="absolute"
                style={{
                  left: `${(colIdx / groups.length) * 100}%`,
                  right: `${((groups.length - colIdx - 1) / groups.length) * 100}%`,
                  top: 0, bottom: 0,
                }}
              >
                <ActivityBlock
                  activity={displayActivity}
                  color={color}
                  onClick={onActivityClick}
                  onDragStart={handleDragStart}
                  canEdit={canEdit(act)}
                  // Ghost overlay: show updated time label while dragging
                  style={isDragging ? { opacity: 0.7, outline: `2px dashed ${color}` } : undefined}
                />
                {isDragging && (
                  <div
                    className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                    style={{ top: timeToTopPx(drag!.currentFrom) - 14, color }}
                  >
                    {drag!.currentFrom}–{drag!.currentTo}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/CalendarGrid.tsx`**

```tsx
'use client'
import { useRef } from 'react'
import { Activity, CalendarState } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import { addDays, format, parseISO } from 'date-fns'

interface Props {
  state: CalendarState
  activities: Activity[]
  loading: boolean
  sessionUserCode?: string
  onRefresh: () => void
  onSlotClick: (personCode: string, time: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '',
  onRefresh, onSlotClick, onActivityClick, onActivityUpdate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build date list for current view
  const dates = state.view === 'day'
    ? [state.date]
    : Array.from({ length: 3 }, (_, i) => format(addDays(parseISO(state.date), i), 'yyyy-MM-dd'))

  // Pull-to-refresh via touch
  let touchStartY = 0
  function handleTouchStart(e: React.TouchEvent) {
    if (scrollRef.current?.scrollTop === 0) touchStartY = e.touches[0].clientY
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientY - touchStartY
    if (delta > 60 && scrollRef.current?.scrollTop === 0) onRefresh()
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-pulse z-20" />
      )}

      <div className="flex min-w-0" style={{ minHeight: '100%' }}>
        <TimeColumn />

        {/* For each date, render each person's column */}
        {dates.map(date => (
          <div key={date} className="flex flex-1 min-w-0">
            {state.selectedPersons.map((person, personIdx) => {
              const personActivities = activities.filter(
                a => a.personCode === person.code && a.date === date
              )
              return (
                <PersonColumn
                  key={person.code}
                  personCode={person.code}
                  personIndex={personIdx}
                  date={date}
                  activities={personActivities}
                  sessionUserCode={sessionUserCode}
                  onSlotClick={onSlotClick}
                  onActivityClick={onActivityClick}
                  onActivityUpdate={onActivityUpdate}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run dev server and verify calendar renders**

```bash
npm run dev
```
Navigate to `http://localhost:3000` (after logging in). Expect to see the time grid with person columns.

- [ ] **Step 6: Commit**

```bash
git add components/TimeColumn.tsx components/PersonColumn.tsx components/ActivityBlock.tsx components/CalendarGrid.tsx
git commit -m "feat: add calendar grid with time column, person columns, activity blocks, and drag support"
```

---

## Chunk 6: Activity Form

### Task 10: ActivityForm bottom sheet

**Files:**
- Create: `components/ActivityForm.tsx`
- Create: `components/ErrorBanner.tsx`

- [ ] **Step 1: Create `components/ErrorBanner.tsx`**

```tsx
interface Props { errors: string[] }

export default function ErrorBanner({ errors }: Props) {
  if (!errors.length) return null
  return (
    <div className="bg-red-900/40 border border-red-500/50 rounded-lg p-3 text-sm text-red-300">
      <p className="font-bold mb-1">Please fix the following:</p>
      <ul className="list-disc list-inside space-y-0.5">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/ActivityForm.tsx`**

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, ActivityType, SearchResult, Person } from '@/types'
import ErrorBanner from './ErrorBanner'
import { format } from 'date-fns'

interface Props {
  initial?: Partial<Activity>
  editId?: string
  people: Person[]
  defaultPersonCode: string
  todayActivities: Activity[]
  onClose: () => void
  onSaved: () => void
}

export default function ActivityForm({
  initial, editId, people, defaultPersonCode, todayActivities, onClose, onSaved
}: Props) {
  const isEdit = !!editId
  const [source, setSource] = useState<'herbe' | 'outlook'>(initial?.source ?? 'herbe')
  const [selectedPersonCodes, setSelectedPersonCodes] = useState<string[]>(
    initial?.personCode ? [initial.personCode] : [defaultPersonCode]
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [timeFrom, setTimeFrom] = useState(initial?.timeFrom ?? smartDefaultStart())
  const [timeTo, setTimeTo] = useState(initial?.timeTo ?? '')
  const [activityTypeCode, setActivityTypeCode] = useState(initial?.activityTypeCode ?? '')
  const [projectCode, setProjectCode] = useState(initial?.projectCode ?? '')
  const [projectName, setProjectName] = useState(initial?.projectName ?? '')
  const [customerCode, setCustomerCode] = useState(initial?.customerCode ?? '')
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [projectResults, setProjectResults] = useState<SearchResult[]>([])
  const [customerResults, setCustomerResults] = useState<SearchResult[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Load activity types
  useEffect(() => {
    fetch('/api/activity-types').then(r => r.json()).then((types: Record<string, unknown>[]) => {
      setActivityTypes(types.map(t => ({ code: t['Code'] as string, name: t['Name'] as string })))
    })
  }, [])

  function smartDefaultStart(): string {
    // Find last activity of today for the default person
    const todayForPerson = todayActivities
      .filter(a => a.personCode === defaultPersonCode)
      .sort((a, b) => b.timeTo.localeCompare(a.timeTo))
    return todayForPerson[0]?.timeTo ?? '09:00'
  }

  async function searchProjects(q: string) {
    if (q.length < 2) { setProjectResults([]); return }
    const res = await fetch(`/api/projects?q=${encodeURIComponent(q)}`)
    const data = await res.json() as Record<string, unknown>[]
    setProjectResults(data.map(d => ({ code: d['Code'] as string, name: d['Name'] as string })))
  }

  async function searchCustomers(q: string) {
    if (q.length < 2) { setCustomerResults([]); return }
    const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`)
    const data = await res.json() as Record<string, unknown>[]
    setCustomerResults(data.map(d => ({ code: d['Code'] as string, name: d['Name'] as string })))
  }

  function buildHerbePayload() {
    return {
      Description: description,
      Date: date,
      TimeFrom: timeFrom,
      TimeTo: timeTo,
      ActivityType: activityTypeCode,
      Project: projectCode,
      Customer: customerCode,
      AccessGroup: selectedPersonCodes.join(','),
    }
  }

  function buildOutlookPayload() {
    return {
      subject: description,
      start: { dateTime: `${date}T${timeFrom}:00`, timeZone: 'Europe/Riga' },
      end: { dateTime: `${date}T${timeTo}:00`, timeZone: 'Europe/Riga' },
      attendees: selectedPersonCodes
        .map(code => people.find(p => p.code === code))
        .filter(Boolean)
        .map(p => ({ emailAddress: { address: p!.email, name: p!.name }, type: 'required' })),
    }
  }

  async function handleSave() {
    const errs: string[] = []
    if (!description) errs.push('Description is required')
    if (!timeFrom) errs.push('Start time is required')
    if (!timeTo) errs.push('End time is required')
    if (timeFrom >= timeTo) errs.push('End time must be after start time')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    setErrors([])

    try {
      const url = source === 'herbe'
        ? (isEdit ? `/api/activities/${editId}` : '/api/activities')
        : (isEdit ? `/api/outlook/${editId}` : '/api/outlook')
      const method = isEdit ? 'PUT' : 'POST'
      const body = source === 'herbe' ? buildHerbePayload() : buildOutlookPayload()

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        // Show API errors inline
        const apiErrors = Array.isArray(data?.errors)
          ? data.errors.map((e: { message?: string }) => e.message ?? String(e))
          : [data?.error ?? 'Unknown error from server']
        setErrors(apiErrors)
        setSaving(false)
        return
      }

      onSaved()
      onClose()
    } catch (e) {
      setErrors([String(e)])
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editId) return
    setSaving(true)
    const url = source === 'herbe' ? `/api/activities/${editId}` : `/api/outlook/${editId}`
    await fetch(url, { method: 'DELETE' })
    onSaved()
    onClose()
  }

  function handleDuplicate() {
    // Keep all fields except time; parent will re-open form in create mode
    onClose()
    // Signal duplicate via URL or callback — simplest: re-open form with initial (minus id)
    setTimeout(() => {
      // This is handled by parent CalendarShell re-opening with the duplicated state minus editId
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold">{isEdit ? 'Edit Activity' : 'New Activity'}</h2>
          <button onClick={onClose} className="text-text-muted text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Source toggle */}
          {!isEdit && (
            <div className="flex rounded overflow-hidden border border-border text-sm font-bold">
              {(['herbe', 'outlook'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex-1 py-2 ${source === s ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  {s === 'herbe' ? 'Herbe ERP' : 'Outlook'}
                </button>
              ))}
            </div>
          )}

          <ErrorBanner errors={errors} />

          {/* Person selector */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Person(s)</label>
            <div className="flex flex-wrap gap-1">
              {people.map(p => {
                const sel = selectedPersonCodes.includes(p.code)
                return (
                  <button
                    key={p.code}
                    onClick={() => setSelectedPersonCodes(prev =>
                      sel ? prev.filter(c => c !== p.code) : [...prev, p.code]
                    )}
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors ${sel ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted'}`}
                  >
                    {p.code}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="What are you working on?"
            />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">From</label>
              <input
                type="time"
                value={timeFrom}
                onChange={e => setTimeFrom(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">To</label>
              <input
                type="time"
                value={timeTo}
                onChange={e => setTimeTo(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Activity type (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Activity Type</label>
              <select
                value={activityTypeCode}
                onChange={e => setActivityTypeCode(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— select type —</option>
                {activityTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Project (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Project</label>
              <input
                value={projectName}
                onChange={e => { setProjectName(e.target.value); setProjectCode(''); searchProjects(e.target.value) }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type to search…"
              />
              {projectResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {projectResults.map(r => (
                    <button key={r.code} onClick={() => { setProjectCode(r.code); setProjectName(r.name); setProjectResults([]) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border"
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Customer</label>
              <input
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); setCustomerCode(''); searchCustomers(e.target.value) }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type to search…"
              />
              {customerResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {customerResults.map(r => (
                    <button key={r.code} onClick={() => { setCustomerCode(r.code); setCustomerName(r.name); setCustomerResults([]) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border"
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-border space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}
          </button>

          {isEdit && (
            <div className="flex gap-2">
              <button
                onClick={handleDuplicate}
                className="flex-1 border border-border text-text-muted font-bold py-2 rounded-xl text-sm"
              >
                Duplicate
              </button>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 border border-red-800 text-red-400 font-bold py-2 rounded-xl text-sm"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 bg-red-800 text-white font-bold py-2 rounded-xl text-sm"
                >
                  Confirm delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire up duplicate in `ActivityForm.tsx` and `CalendarShell.tsx`**

In `ActivityForm.tsx`, add `onDuplicate` to the `Props` interface and implement `handleDuplicate`:

```typescript
// Add to Props interface:
onDuplicate: (initial: Partial<Activity>) => void

// Replace the handleDuplicate stub with:
function handleDuplicate() {
  onClose()
  onDuplicate({
    source,
    personCode: selectedPersonCodes[0],
    description,
    date,
    activityTypeCode,
    projectCode,
    projectName,
    customerCode,
    customerName,
    // timeFrom and timeTo intentionally omitted — user sets them on the new form
  })
}
```

In `CalendarShell.tsx`, add `onDuplicate` to the `ActivityForm` usage:
```tsx
<ActivityForm
  initial={formState.initial}
  editId={formState.editId}
  people={people}
  defaultPersonCode={userCode}
  todayActivities={activities.filter(a => a.date === state.date)}
  onClose={() => setFormState({ open: false })}
  onSaved={fetchActivities}
  onDuplicate={(dup) => setFormState({ open: true, initial: dup })}
/>
```

- [ ] **Step 4: Run dev server and test full form flow**

```bash
npm run dev
```
- Click an empty slot → form opens with time pre-filled
- Click "+ New" → form opens with smart default start time
- Fill in and submit → verify activity appears on calendar (with real API credentials)
- Submit with missing required field → verify inline error shown

- [ ] **Step 5: Commit**

```bash
git add components/ActivityForm.tsx components/ErrorBanner.tsx components/CalendarShell.tsx
git commit -m "feat: add activity form with inline error handling, duplicate, and delete"
```

---

## Chunk 7: Polish & Deploy

### Task 11: Scroll to 08:00 on load + final polish

**Files:**
- Modify: `components/CalendarGrid.tsx`
- Create: `.gitignore` additions

- [ ] **Step 1: Auto-scroll calendar to 08:00 on mount**

In `CalendarGrid.tsx`, add `useEffect` after `scrollRef` declaration:

Also add this import at the top of `CalendarGrid.tsx`:
```typescript
import { minutesToPx, GRID_START_HOUR } from '@/lib/time'
```

```typescript
useEffect(() => {
  if (!scrollRef.current) return
  const HEADER_HEIGHT = 40  // person column header in px
  const TARGET_HOUR = 8
  scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - GRID_START_HOUR) * 60) + HEADER_HEIGHT
}, [])
```

- [ ] **Step 2: Run all tests one final time**

```bash
npx jest --no-coverage
```
Expected: all PASS

- [ ] **Step 3: Build to verify no TypeScript or compile errors**

```bash
npm run build
```
Expected: successful build with no errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: auto-scroll to 08:00 on calendar load"
```

---

### Task 12: Vercel deployment

**Files:**
- Create: `vercel.json` (optional, if custom config needed)

- [ ] **Step 1: Install Vercel CLI and link project**

```bash
npm install -g vercel
vercel link
```
Follow prompts: create new project, link to `/Users/elviskvalbergs/AI/herbe-calendar`.

- [ ] **Step 2: Set environment variables in Vercel dashboard**

Go to Vercel project → Settings → Environment Variables. Add all variables from `.env.local.example` with real values:
- `HERBE_API_BASE_URL`, `HERBE_COMPANY_CODE=3`, `HERBE_CLIENT_ID`, `HERBE_CLIENT_SECRET`, `HERBE_TOKEN_URL`
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SENDER_EMAIL`
- `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`), `NEXTAUTH_URL` (your Vercel URL)
- `DATABASE_URL` (from Neon dashboard — use the pooled connection string)

- [ ] **Step 3: Set up Neon database and run schema migration**

1. Create a Neon project at neon.tech
2. Copy the `DATABASE_URL` pooled connection string and add to Vercel env vars
3. Open the Neon SQL editor and run the `@auth/pg-adapter` required schema:

```sql
CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE accounts (
  id SERIAL,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE sessions (
  id SERIAL,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE users (
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  PRIMARY KEY (id)
);
```

4. Verify tables were created: run `\dt` in the Neon SQL editor, expect 4 tables.

- [ ] **Step 4: Deploy to Vercel**

```bash
vercel --prod
```
Expected: deployment URL printed, e.g. `https://herbe-calendar.vercel.app`

- [ ] **Step 5: Smoke test on deployed URL**
  - Open the URL on mobile
  - Navigate to `/login`, enter a registered email → verify magic link email arrives
  - Click the link → verify session created, calendar loads
  - Verify activities appear for the logged-in user's current date
  - Create a new activity → verify it saves and appears

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: finalize deployment configuration"
```

---

## Implementation Notes

### Verifying ActVc field names
When first connecting to the real API, run this to inspect the actual field names returned by ActVc:
```bash
curl -H "Authorization: Bearer <token>" \
  "https://roniscloud.burti.lv:6012/api/3/ActVc?limit=1" | jq '.[0] | keys'
```
Compare against the field names used in `lib/herbe/constants.ts` and the API route filter params. Update `ACTIVITY_ACCESS_GROUP_FIELD` and filter strings accordingly.

### Verifying filter syntax
The Herbe API filter format (`filter=Field eq 'Value'`) should be tested against a real register before relying on it. The documentation shows `filter` as a parameter — confirm the exact comparison operators (`eq`, `ct` for contains, etc.) supported.

### Azure AD setup checklist
Before deployment, ensure the Azure AD app registration has:
- `Mail.Send` application permission (for sending magic links)
- `Calendars.ReadWrite` application permission (for all users' calendars)
- Both permissions admin-consented in the tenant
