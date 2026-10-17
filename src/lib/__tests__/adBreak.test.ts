import { announceAdBreak, setAdBreakHandler } from '../adBreak';

afterEach(() => setAdBreakHandler(null));

describe('announceAdBreak', () => {
  it('resolves immediately when no notice host is mounted', async () => {
    await expect(announceAdBreak()).resolves.toBeUndefined();
  });

  it('waits for the mounted host to finish its countdown', async () => {
    let finish: () => void = () => {};
    setAdBreakHandler(() => new Promise<void>((r) => (finish = r)));
    let done = false;
    const p = announceAdBreak().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await p;
    expect(done).toBe(true);
  });

  it('never throws when the host fails', async () => {
    setAdBreakHandler(() => Promise.reject(new Error('boom')));
    await expect(announceAdBreak()).resolves.toBeUndefined();
  });
});
