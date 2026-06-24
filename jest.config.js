/**
 * Jest configuration for GeoRankle.
 *
 * Uses the `jest-expo` preset so test files can import Expo/React Native modules
 * the same way the app does (also future-proofs component/render tests). The
 * current suite focuses on pure business logic in src/lib, src/data and src/i18n.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/data/**/*.ts',
    'src/i18n/**/*.ts',
    '!src/**/*.d.ts',
  ],
  // Transform the RN/Expo ESM packages that ship untranspiled.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
