import { Platform } from 'react-native';

import { compareVersions, isBelowMinimum, isUpdateRequired, parseVersion } from '../forceUpdate';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

jest.mock('expo-application', () => ({ nativeApplicationVersion: '5.7.0' }));

const sb = supabase as unknown as SupabaseMock;

describe('version helpers', () => {
  it('parses partial and full versions', () => {
    expect(parseVersion('5.7.0')).toEqual([5, 7, 0]);
    expect(parseVersion('6')).toEqual([6, 0, 0]);
    expect(parseVersion('5.10')).toEqual([5, 10, 0]);
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('compares numerically, not as strings', () => {
    expect(compareVersions([5, 10, 0], [5, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([5, 7, 0], [5, 7, 0])).toBe(0);
    expect(isBelowMinimum('5.7.0', '5.8.0')).toBe(true);
    expect(isBelowMinimum('5.10.0', '5.9')).toBe(false);
    expect(isBelowMinimum('5.7.0', '0.0.0')).toBe(false);
  });

  it('never blocks on an unreadable version', () => {
    expect(isBelowMinimum(null, '9.0.0')).toBe(false);
    expect(isBelowMinimum('5.7.0', 'abc')).toBe(false);
  });
});

describe('isUpdateRequired', () => {
  const originalOS = Platform.OS;
  const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

  beforeEach(() => {
    sb.__reset();
    setOS('ios');
  });
  afterAll(() => setOS(originalOS));

  it('blocks when the installed version is below the minimum', async () => {
    sb.__setResult('app_min_version', { data: { min_version: '5.8.0' }, error: null });
    expect(await isUpdateRequired()).toBe(true);
    expect(sb.from).toHaveBeenCalledWith('app_min_version');
  });

  it('lets through an up-to-date install', async () => {
    sb.__setResult('app_min_version', { data: { min_version: '5.7.0' }, error: null });
    expect(await isUpdateRequired()).toBe(false);
  });

  it('fails open on error or missing row', async () => {
    sb.__setResult('app_min_version', { data: null, error: { message: 'down' } });
    expect(await isUpdateRequired()).toBe(false);
    sb.__setResult('app_min_version', { data: null, error: null });
    expect(await isUpdateRequired()).toBe(false);
  });

  it('never blocks the web', async () => {
    setOS('web');
    sb.__setResult('app_min_version', { data: { min_version: '99.0.0' }, error: null });
    expect(await isUpdateRequired()).toBe(false);
  });
});
