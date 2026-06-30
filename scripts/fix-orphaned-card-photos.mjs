// One-off: repair player_photos rows whose user_id is NOT the player's coach
// (players.user_id). These happen when a granted parent saved a card to their
// kid before the savePlayerPhoto fix: the row was written under the parent's
// auth.uid(), so the coach's player page (which filters by user_id) never saw
// it — the "assignment didn't take" symptom. We re-point user_id to the coach
// and make the moved card the player's primary (that was the intent).
//
//   node scripts/fix-orphaned-card-photos.mjs            # dry run (default)
//   node scripts/fix-orphaned-card-photos.mjs --commit   # actually repair
//
// Idempotent: re-running after a commit finds nothing to fix.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const COMMIT = process.argv.includes("--commit");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: photos, error: pErr } = await sb
    .from("player_photos")
    .select("id, player_id, user_id, team_name, is_primary, created_at");
  if (pErr) throw pErr;

  const { data: players, error: plErr } = await sb
    .from("players")
    .select("id, user_id, first_name, last_name");
  if (plErr) throw plErr;

  const ownerOf = new Map(players.map((p) => [p.id, p.user_id]));
  const nameOf = new Map(players.map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));

  const orphans = photos.filter((ph) => {
    const owner = ownerOf.get(ph.player_id);
    return owner && ph.user_id !== owner;
  });

  if (orphans.length === 0) {
    console.log("No orphaned card photos found. Nothing to do.");
    return;
  }

  console.log(`Found ${orphans.length} card photo(s) owned by the wrong user:\n`);
  for (const o of orphans) {
    console.log(
      `  photo ${o.id}  player "${nameOf.get(o.player_id)}"  ` +
        `wrong_user=${o.user_id}  -> coach=${ownerOf.get(o.player_id)}  ` +
        `team="${o.team_name ?? ""}"  created=${o.created_at}`
    );
  }

  if (!COMMIT) {
    console.log(`\nDry run. Re-run with --commit to re-point these to the coach and set them primary.`);
    return;
  }

  // Oldest first, so the most recently created card ends up as the primary.
  orphans.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const o of orphans) {
    const coach = ownerOf.get(o.player_id);
    // Demote the coach's existing primary for this player so the moved card wins.
    await sb
      .from("player_photos")
      .update({ is_primary: false })
      .eq("player_id", o.player_id)
      .eq("user_id", coach);
    const { error } = await sb
      .from("player_photos")
      .update({ user_id: coach, is_primary: true })
      .eq("id", o.id);
    if (error) {
      console.log(`  FAILED ${o.id}: ${error.message}`);
    } else {
      console.log(`  fixed ${o.id} -> coach ${coach}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
