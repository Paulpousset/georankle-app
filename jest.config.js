/**
 * Jest configuration for GeoRankle.
 *
 * Uses the `jest-expo` preset so test files can import Expo/React Native modules
 * the same way the app does (also future-proofs component/render tests). The
 * current suite focuses on pure business logic in src/lib, src/data and src/i18n.
 */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // jest-expo transforms the usual media assets but not .glb (the 3D cosmetic
  // models), so importing data/cosmeticModels.gen.ts had Jest parse a binary.
  // Spread the preset's own transforms — a bare `transform` key would replace
  // them and take every image/font asset down with it.
  transform: {
    ...expoPreset.transform,
    '^.+\\.glb$': 'jest-expo/src/preset/assetFileTransformer.js',
  },
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
