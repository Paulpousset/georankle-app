import * as Updates from 'expo-updates';

import { applyOtaUpdate, isOtaUpdateAvailable } from '../otaUpdate';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

const U = Updates as jest.Mocked<typeof Updates>;
const g = globalThis as { __DEV__?: boolean };

describe('otaUpdate', () => {
  const dev = g.__DEV__;
  beforeEach(() => {
    jest.clearAllMocks();
    g.__DEV__ = false;
  });
  afterAll(() => {
    g.__DEV__ = dev;
  });

  it('reports an available update', async () => {
    U.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never);
    expect(await isOtaUpdateAvailable()).toBe(true);
  });

  it('fails open when the check throws', async () => {
    U.checkForUpdateAsync.mockRejectedValue(new Error('offline'));
    expect(await isOtaUpdateAvailable()).toBe(false);
  });

  it('never checks in development', async () => {
    g.__DEV__ = true;
    expect(await isOtaUpdateAvailable()).toBe(false);
    expect(U.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('reloads onto a freshly fetched update', async () => {
    U.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never);
    expect(await applyOtaUpdate()).toBe(true);
    expect(U.reloadAsync).toHaveBeenCalled();
  });

  it('does not reload when nothing new was fetched', async () => {
    U.fetchUpdateAsync.mockResolvedValue({ isNew: false } as never);
    expect(await applyOtaUpdate()).toBe(false);
    expect(U.reloadAsync).not.toHaveBeenCalled();
  });
});
