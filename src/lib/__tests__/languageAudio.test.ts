jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// The factory must be self-contained: jest hoists jest.mock() above the imports,
// so a module-scope object would still be in its temporal dead zone here.
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: false, size: 0 })),
  downloadAsync: jest.fn(async (_url: string, target: string) => ({ status: 200, uri: target })),
  readDirectoryAsync: jest.fn(async () => [] as string[]),
  deleteAsync: jest.fn(async () => {}),
}));

import { Platform } from 'react-native';

const mockFs = jest.requireMock('expo-file-system/legacy') as {
  makeDirectoryAsync: jest.Mock;
  getInfoAsync: jest.Mock;
  downloadAsync: jest.Mock;
  readDirectoryAsync: jest.Mock;
  deleteAsync: jest.Mock;
};

import {
  fnv1a32, phraseHash, phraseAudioPath, phraseAudioUrl, ensureCached,
  cacheKeepSet, pruneAudioCache, __resetAudioCache,
} from '../languageAudio';
import { LANGUAGES, getLanguageDef } from '../../data/languages';

const fr = getLanguageDef('fr')!;
const phrase = fr.phrases[0];

beforeEach(() => {
  __resetAudioCache();
  jest.clearAllMocks();
  mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false, size: 0 }));
  mockFs.downloadAsync.mockImplementation(async (_u: string, t: string) => ({ status: 200, uri: t }));
});

describe('content-addressed paths', () => {
  it('pins the FNV-1a vector shared with scripts/gen_language_audio.mjs', () => {
    // The generator re-implements this hash in plain Node. If the two ever drift,
    // every uploaded clip becomes unreachable at once — hence a frozen vector.
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('hello')).toBe(0x4f9f2cab);
    expect(phraseHash('hello')).toBe('4f9f2cab');
    expect(phraseHash('hello')).toHaveLength(8);
  });

  it('builds languages/v1/<code>/<id>.<hash8>.mp3', () => {
    expect(phraseAudioPath('fr', phrase)).toBe(`languages/v1/fr/${phrase.id}.${phraseHash(phrase.text)}.mp3`);
    expect(phraseAudioPath('fr', phrase)).toMatch(/^languages\/v1\/fr\/fr-01\.[0-9a-f]{8}\.mp3$/);
  });

  it('agrees byte-for-byte with the generator on a real corpus phrase', () => {
    // Cross-checked against `DRY=1 node scripts/gen_language_audio.mjs`. If this
    // fails, the app and the uploader disagree on file names and EVERY clip is
    // silently unreachable — regenerate the vector only after re-running the
    // script and confirming the two still match.
    expect(phraseAudioPath('fr', phrase)).toBe('languages/v1/fr/fr-01.bc830378.mp3');
  });

  it('changes the file name when the phrase text is corrected', () => {
    // This is what makes every cache self-invalidating.
    const before = phraseAudioPath('fr', phrase);
    const after = phraseAudioPath('fr', { ...phrase, text: `${phrase.text} ` });
    expect(after).not.toBe(before);
  });

  it('gives every phrase in the catalogue a unique path', () => {
    const paths = LANGUAGES.flatMap((l) => l.phrases.map((p) => phraseAudioPath(l.code, p)));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('points at the public game-audio bucket', () => {
    expect(phraseAudioUrl('fr', phrase)).toContain('/storage/v1/object/public/game-audio/');
  });
});

describe('ensureCached', () => {
  it('downloads once and serves the local file afterwards', async () => {
    const first = await ensureCached('fr', phrase);
    expect(first).toContain('file:///cache/langaudio/');
    expect(mockFs.downloadAsync).toHaveBeenCalledTimes(1);

    // A second call is de-duplicated rather than re-downloaded.
    const second = await ensureCached('fr', phrase);
    expect(second).toBe(first);
    expect(mockFs.downloadAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses an already-cached file without hitting the network', async () => {
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: true, size: 1234 }));
    const uri = await ensureCached('fr', phrase);
    expect(uri).toContain('langaudio/');
    expect(mockFs.downloadAsync).not.toHaveBeenCalled();
  });

  it('falls back to the remote URL and NEVER throws when the download fails', async () => {
    // A 404 or a dead network must degrade the question, not crash the round.
    mockFs.downloadAsync.mockImplementation(async () => { throw new Error('offline'); });
    await expect(ensureCached('fr', phrase)).resolves.toBe(phraseAudioUrl('fr', phrase));
  });

  it('falls back on an HTTP error status too', async () => {
    mockFs.downloadAsync.mockImplementation(async (_u: string, t: string) => ({ status: 404, uri: t }));
    await expect(ensureCached('fr', phrase)).resolves.toBe(phraseAudioUrl('fr', phrase));
  });

  it('streams directly on web, where there is no FileSystem', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      await expect(ensureCached('fr', phrase)).resolves.toBe(phraseAudioUrl('fr', phrase));
      expect(mockFs.downloadAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('pruneAudioCache', () => {
  it('deletes only files the current catalogue can no longer produce', async () => {
    const keep = cacheKeepSet(LANGUAGES);
    const alive = [...keep][0];
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: true, size: 1 }));
    mockFs.readDirectoryAsync.mockImplementation(async () => [alive, 'languages_v1_fr_fr-01.deadbeef.mp3']);

    await pruneAudioCache(keep);

    const deleted = mockFs.deleteAsync.mock.calls.map((c) => c[0] as string);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain('deadbeef');
  });

  it('is a no-op when nothing was ever cached', async () => {
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false, size: 0 }));
    await expect(pruneAudioCache(new Set())).resolves.toBeUndefined();
    expect(mockFs.deleteAsync).not.toHaveBeenCalled();
  });
});
