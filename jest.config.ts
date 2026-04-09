import type { Config } from 'jest'
const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/activities/**/*.ts',
    'app/api/outlook/**/*.ts',
    '!lib/db.ts',
    '!lib/auth.ts',
    '!lib/graph/**',
    '!lib/herbe/client.ts',
    '!lib/herbe/auth-guard.ts',
    '!lib/herbe/config.ts',
    '!lib/icsParser.ts',
  ],
}
export default config
