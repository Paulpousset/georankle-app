/*
 * FFA (3–4 player) server-contract integration test.
 *
 * Drives 4 REAL authenticated supabase-js clients through the exact online-FFA
 * flow the app relies on, validating the reliability fixes in ffa_reliability.sql
 * + FfaMatch.tsx:
 *   1. host creates match + host_ffa_match  → seat 0
 *   2. 3 players join_ffa_match             → status flips to in_progress when full
 *   3. each round: everyone writes current_score+finished_round, any client
 *      finalize_round_ffa → current_round advances, flags cleared
 *   4. series end → status completed → apply_ffa_result → placement coins
 *   5. DEADLOCK FIXES:
 *      a) a player who join→leave_ffa_match frees the seat (match can still fill)
 *      b) gap-safe slot: the next joiner after a leave gets max(slot)+1 (no PK clash)
 *      c) host leave_ffa_match while waiting → match cancelled for everyone
 *
 * Usage:  FFA_ACCOUNTS='email1:pw1,email2:pw2,email3:pw3,email4:pw4' \
 *         node scripts/ffa-integration-test.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://exwfggaytrywnfzcqpel.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4d2ZnZ2F5dHJ5d25memNxcGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDA5NjAsImV4cCI6MjA5MjUxNjk2MH0.AZkKT-wiJppVpFl3Pz2i_nwHGCSEng7escy6aO_lFOs';

const accounts = (process.env.FFA_ACCOUNTS || '').split(',').map((s) => {
  const i = s.indexOf(':');
  return { email: s.slice(0, i).trim(), password: s.slice(i + 1).trim() };
}).filter((a) => a.email && a.password);

if (accounts.length < 4) {
  console.error('Need 4 accounts via FFA_ACCOUNTS="e1:p1,e2:p2,e3:p3,e4:p4"');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failures++; };

async function login({ email, password }) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { client: c, id: data.user.id, email };
}

// Read the authoritative matches row (service of truth the client polls).
async function matchRow(c, id) {
  const { data } = await c.from('matches').select('status, current_round, max_players, best_of').eq('id', id).single();
  return data;
}
async function playerRows(c, id) {
  const { data } = await c.from('match_players').select('slot, player_id, finished_round, current_score, rounds_won, total_score').eq('match_id', id).order('slot');
  return data || [];
}
// Poll until predicate true (mirrors the client's 5s reconciliation poll).
async function waitFor(fn, label, tries = 20, gap = 500) {
  for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(gap); }
  console.log(`   ⏱  timed out waiting: ${label}`);
  return false;
}

async function main() {
  console.log(`\n── Logging in ${accounts.length} clients ──`);
  const P = [];
  for (const a of accounts) { P.push(await login(a)); console.log(`   • ${a.email} → ${P[P.length - 1].id.slice(0, 8)}`); }
  const [host, a, b, cPlayer] = P;

  // Ensure each test user has a profiles row (matches.player1_id / match_players
  // FK it). Self-insert is allowed by RLS; idempotent via onConflict.
  for (let i = 0; i < P.length; i++) {
    await P[i].client.from('profiles').upsert({ id: P[i].id, username: `FFATest${i + 1}` }, { onConflict: 'id' });
  }

  // ══ SCENARIO 1: full 4-player match, 2 rounds, finalize + coins ══════════════
  console.log('\n══ Scenario 1 — full 4-player match ══');
  const modes = ['classic', 'streak']; // best_of = 2 rounds
  const seed = 12345;
  const { data: created, error: cErr } = await host.client.from('matches').insert([{
    player1_id: host.id, player2_id: null, game_mode: modes[0],
    is_public: true, is_ranked: false, status: 'waiting', best_of: modes.length,
    max_players: 4, game_data: { seed, modes, rounds: modes.map(() => ({ count: 3 })) },
  }]).select().single();
  ok(!cErr && created, `host created match ${created?.id?.slice(0, 8) || cErr?.message}`);
  const mid = created.id;
  const hSeat = await host.client.rpc('host_ffa_match', { p_match_id: mid });
  ok(!hSeat.error, 'host_ffa_match seated host at slot 0');

  for (const pl of [a, b]) {
    const r = await pl.client.rpc('join_ffa_match', { p_match_id: mid });
    ok(!r.error, `${pl.email} joined (slot ${r.data?.slot})`);
  }
  let row = await matchRow(host.client, mid);
  ok(row.status === 'waiting', `still waiting at 3/4 players (status=${row.status})`);

  const rLast = await cPlayer.client.rpc('join_ffa_match', { p_match_id: mid });
  ok(!rLast.error && rLast.data?.started === true, `4th join flips to in_progress (started=${rLast.data?.started})`);
  ok(await waitFor(async () => (await matchRow(host.client, mid)).status === 'in_progress', 'status=in_progress'),
    'match reached in_progress when full');

  // Play each round: everyone submits, one finalizes, round advances.
  for (let round = 1; round <= modes.length; round++) {
    for (let i = 0; i < P.length; i++) {
      const pl = P[i];
      const { error, data: upd } = await pl.client.from('match_players')
        .update({ current_score: 100 + i * 10 + round, finished_round: true })
        .eq('match_id', mid).eq('player_id', pl.id).select();
      ok(!error && upd && upd.length === 1, `round ${round}: ${pl.email} submitted score ${error ? '| ERR: ' + error.message : '| rows=' + (upd?.length ?? 0)}`);
    }
    const fin = await host.client.rpc('finalize_round_ffa', { p_match_id: mid });
    ok(!fin.error && fin.data?.finalized === true, `round ${round}: finalize_round_ffa finalized=${fin.data?.finalized}`);
    // Idempotency: a second finalize call must be a harmless no-op.
    const fin2 = await a.client.rpc('finalize_round_ffa', { p_match_id: mid });
    ok(!fin2.error && fin2.data?.finalized === false, `round ${round}: duplicate finalize is a no-op`);

    row = await matchRow(host.client, mid);
    if (round < modes.length) {
      ok(row.current_round === round + 1 && row.status === 'in_progress', `advanced to round ${row.current_round}`);
      const cleared = (await playerRows(host.client, mid)).every((p) => !p.finished_round && p.current_score === 0);
      ok(cleared, `round ${round}: finished flags + scores cleared for next round`);
    } else {
      ok(row.status === 'completed', `series completed after final round (status=${row.status})`);
    }
  }

  // Placement coins, idempotent.
  const res1 = await cPlayer.client.rpc('apply_ffa_result', { p_match_id: mid });
  ok(!res1.error && res1.data?.coins_awarded > 0, `apply_ffa_result granted coins (place ${res1.data?.place})`);
  const res2 = await host.client.rpc('apply_ffa_result', { p_match_id: mid });
  ok(!res2.error && res2.data?.already_awarded === true, 'apply_ffa_result is idempotent (already_awarded)');

  // ══ SCENARIO 2: leave frees the seat + gap-safe slot ═════════════════════════
  console.log('\n══ Scenario 2 — leave frees seat + gap-safe slot ══');
  const { data: m2 } = await host.client.from('matches').insert([{
    player1_id: host.id, game_mode: 'classic', is_public: true, is_ranked: false,
    status: 'waiting', best_of: 1, max_players: 3, game_data: { seed, modes: ['classic'] },
  }]).select().single();
  await host.client.rpc('host_ffa_match', { p_match_id: m2.id });     // slot 0 (host)
  const jA = await a.client.rpc('join_ffa_match', { p_match_id: m2.id }); // slot 1
  ok(jA.data?.slot === 1, `player A took slot ${jA.data?.slot}`);
  const lv = await a.client.rpc('leave_ffa_match', { p_match_id: m2.id }); // frees slot 1
  ok(!lv.error && lv.data?.left === true && !lv.data?.cancelled, 'player A left, seat freed (not cancelled)');
  ok((await playerRows(host.client, m2.id)).length === 1, 'only host remains in the lobby');

  const jB = await b.client.rpc('join_ffa_match', { p_match_id: m2.id });
  ok(!jB.error && jB.data?.slot >= 1, `player B rejoined with gap-safe slot ${jB.data?.slot} (no PK clash)`);
  const jC = await cPlayer.client.rpc('join_ffa_match', { p_match_id: m2.id });
  ok(!jC.error && jC.data?.started === true, `match fills to 3 and starts after a leave (started=${jC.data?.started})`);

  // ══ SCENARIO 3: host leaving a waiting lobby cancels it ══════════════════════
  console.log('\n══ Scenario 3 — host leave cancels the forming match ══');
  const { data: m3 } = await host.client.from('matches').insert([{
    player1_id: host.id, game_mode: 'classic', is_public: true, is_ranked: false,
    status: 'waiting', best_of: 1, max_players: 4, game_data: { seed, modes: ['classic'] },
  }]).select().single();
  await host.client.rpc('host_ffa_match', { p_match_id: m3.id });
  await a.client.rpc('join_ffa_match', { p_match_id: m3.id });
  const hLeave = await host.client.rpc('leave_ffa_match', { p_match_id: m3.id });
  ok(!hLeave.error && hLeave.data?.cancelled === true, 'host leave cancelled the match');
  ok(await waitFor(async () => (await matchRow(a.client, m3.id))?.status === 'cancelled', 'status=cancelled'),
    'other players see status=cancelled (client ejects them)');
  ok((await playerRows(host.client, m3.id)).length === 0, 'seats cleared on cancel');

  console.log(`\n${failures === 0 ? '🎉 ALL PASSED' : `⚠️  ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(3); });
