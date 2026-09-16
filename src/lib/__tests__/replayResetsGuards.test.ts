import fs from 'fs';
import path from 'path';

/**
 * Every game screen guards its answer handler with a ref — `picked`/`gameOver`
 * are async state, so two near-simultaneous taps would both get through. The
 * ref is armed on an answer and disarmed when the NEXT question opens… which
 * never happens on the answer that ENDS the run. So a "Rejouer" that forgets to
 * disarm it hands the player a live board that ignores every tap (Plus ou
 * moins, 09/2026). This test reads the screens and holds the invariant:
 *
 *   any ref used as an early-return guard must be cleared by every replay path.
 */
const SCREENS = path.join(__dirname, '../../screens');

/** Body of `const name = (…) => { … }` / `function name(…) { … }`, brace-matched. */
function functionBody(src: string, name: string): string | null {
  const head = new RegExp(`(?:const\\s+${name}\\s*=\\s*[^=]*=>|function\\s+${name}\\s*\\()`, 'g');
  const m = head.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

/** The body plus the bodies of the local helpers it calls (one level deep). */
function bodyWithDelegates(src: string, name: string): string {
  const body = functionBody(src, name);
  if (!body) return '';
  let all = body;
  for (const call of body.matchAll(/\b([a-z][A-Za-z0-9]*)\(/g)) {
    if (call[1] === name) continue;
    all += functionBody(src, call[1]) ?? '';
  }
  return all;
}

const files = fs.readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));

describe('a replay re-arms the board', () => {
  const cases: Array<[string, string, string]> = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(SCREENS, file), 'utf8');
    // Boolean guard refs the game ARMS and DISARMS as it plays. The cycling is
    // what tells them from a one-way latch (`submitted`, `completedRef`: one
    // online submission, one daily completion ever — those must not be cleared).
    const guards = [
      ...new Set(
        [...src.matchAll(/const\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*useRef\(false\)/g)].map((m) => m[1]),
      ),
    ].filter((g) => src.includes(`${g}.current = true`) && src.includes(`${g}.current = false`));
    if (!guards.length) continue;
    // …against every path the end screen wires to a fresh board.
    const replays = [
      ...new Set(
        [...src.matchAll(/on(?:NewGame|ReplaySame)=\{(?:[^{}]*:\s*)?([A-Za-z][A-Za-z0-9]*)\}/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    for (const r of replays) for (const g of guards) cases.push([file, r, g]);
  }

  it('covers the screens that guard their answer handler', () => {
    expect(new Set(cases.map((c) => c[0])).size).toBeGreaterThanOrEqual(4);
  });

  it.each(cases)('%s: %s() disarms %s', (file, replay, guard) => {
    const src = fs.readFileSync(path.join(SCREENS, file), 'utf8');
    expect(bodyWithDelegates(src, replay)).toContain(`${guard}.current = false`);
  });
});
