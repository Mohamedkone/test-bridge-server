module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
      '**/__tests__/**/*.+(ts|tsx|js)',
      '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: {
      '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
      '!src/types/**',
      '!src/index.ts',
      '!src/server.ts',
      '!src/websocket.ts',
      '!src/worker.ts'
    ],
    setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/src/$1'
    },
    globals: {
      'ts-jest': {
        isolatedModules: true
      }
    }
  };