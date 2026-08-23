/**
 * Garde-fou : tout mode qui demande des pièces doit être accepté par le serveur.
 *
 * `award_solo_coins` refuse les modes hors liste blanche (`bad game mode`), et
 * la file de synchro laisse tomber ce rejet en silence. C'est exactement ce qui
 * est arrivé au Quiz Pays : l'écran de fin appelait la RPC, le serveur refusait,
 * le joueur ne gagnait jamais rien et rien ne le signalait. Ce test relit les
 * appels dans les écrans et les confronte à la liste blanche SQL.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SQL = join(ROOT, '..', 'end_of_game.sql');

/** Les modes que la fonction SQL déployée accepte. */
function allowedModes(): string[] {
  const sql = readFileSync(SQL, 'utf8');
  const m = sql.match(/p_game_mode NOT IN \(([^)]+)\)/);
  if (!m) throw new Error('liste blanche introuvable dans end_of_game.sql');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

/** Les modes littéraux passés à award()/awardSoloCoins() dans les écrans. */
function requestedModes(): string[] {
  const dir = join(ROOT, 'screens');
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/(?:awardSoloCoins|award)\(\s*'([a-z-]+)'/g)) {
      found.add(m[1]);
    }
  }
  return [...found];
}

describe('pièces solo', () => {
  it('chaque mode qui demande des pièces est accepté par le serveur', () => {
    const allowed = allowedModes();
    const requested = requestedModes();
    // Sécurité : si le repérage ne trouve plus rien, c'est le test qui est cassé.
    expect(requested.length).toBeGreaterThan(5);
    expect(requested.filter((mode) => !allowed.includes(mode))).toEqual([]);
  });
});
