const load = (value: string | undefined) => {
  const prev = process.env.EXPO_PUBLIC_RECORDING_MODE;
  if (value === undefined) delete process.env.EXPO_PUBLIC_RECORDING_MODE;
  else process.env.EXPO_PUBLIC_RECORDING_MODE = value;
  let mod!: typeof import('../recordingMode');
  jest.isolateModules(() => {
    mod = require('../recordingMode');
  });
  if (prev === undefined) delete process.env.EXPO_PUBLIC_RECORDING_MODE;
  else process.env.EXPO_PUBLIC_RECORDING_MODE = prev;
  return mod;
};

describe('recordingMode', () => {
  it('is off in store builds: no answer is ever marked', () => {
    const m = load(undefined);
    expect(m.RECORDING_MODE).toBe(false);
    expect(m.recAnswerId(true)).toBeUndefined();
    expect(m.recAnswerId(false)).toBeUndefined();
  });

  it('marks right and wrong answers for Maestro in the recording build', () => {
    const m = load('1');
    expect(m.RECORDING_MODE).toBe(true);
    expect(m.recAnswerId(true)).toBe('rec-correct');
    expect(m.recAnswerId(false)).toBe('rec-wrong');
  });

  it('only accepts the exact value 1', () => {
    expect(load('true').RECORDING_MODE).toBe(false);
  });
});
