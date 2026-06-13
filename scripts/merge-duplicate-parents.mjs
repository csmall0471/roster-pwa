// One-off: merge duplicate `parents` rows (same person imported/created more
// than once, usually with the phone in different formats), which split a
// family's kids across copies so a signed-in parent only sees some of their
// kids. Groups by normalized phone (requiring matching names), picks a canonical
// record (the one their login points to, so auth keeps working), re-points every
// child table to it, then deletes the extra parent rows.
//
//   node scripts/merge-duplicate-parents.mjs            # dry run (default)
//   node scripts/merge-duplicate-parents.mjs --commit   # actually merge
//
// Idempotent: re-running after a commit finds no duplicates.

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

const normPhone = (s) => (s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const normName = (p) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");

// Child tables to re-point. Tables flagged conflict need per-row handling.
const SAFE_TABLES = ["snack_signups", "training_signups", "siblings", "event_signups", "event_views", "user_activity"];

async function countOn(table, col, ids) {
  const { count, error } = await sb.from(table).select(col, { count: "exact", head: true }).in("parent_id", ids);
  if (error) return error.code === "42P01" || /does not exist/i.test(error.message) ? null : `ERR:${error.message}`;
  return count ?? 0;
}

async function main() {
  const { data: parents, error } = await sb.from("parents").select("id, first_name, last_name, email, phone");
  if (error) throw error;

  // Group by normalized phone.
  const groups = new Map();
  for (const p of parents) {
    const k = normPhone(p.phone);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const dupGroups = [...groups.entries()].filter(([, v]) => v.length > 1);

  console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${parents.length} parents, ${dupGroups.length} duplicate phone groups\n`);

  for (const [phone, recs] of dupGroups) {
    // Safety: only merge when every copy is clearly the same person (same name).
    const names = new Set(recs.map(normName));
    if (names.size > 1) {
      console.log(`⚠️  SKIP phone ${phone}: names differ → ${[...names].join(" / ")} (manual review)\n`);
      continue;
    }
    const ids = recs.map((r) => r.id);

    // Pick canonical: prefer a record an auth account points to (keeps logins
    // working), then the one with the most kid links, then the lowest id.
    const { data: authRows } = await sb.from("parent_auth").select("parent_id").in("parent_id", ids);
    const authCount = new Map(ids.map((id) => [id, 0]));
    for (const a of authRows ?? []) authCount.set(a.parent_id, (authCount.get(a.parent_id) ?? 0) + 1);
    const ppCount = new Map(ids.map((id) => [id, 0]));
    for (const id of ids) {
      const { count } = await sb.from("player_parents").select("player_id", { count: "exact", head: true }).eq("parent_id", id);
      ppCount.set(id, count ?? 0);
    }
    const canonical = [...ids].sort((a, b) => {
      const av = authCount.get(a) * 1000 + ppCount.get(a);
      const bv = authCount.get(b) * 1000 + ppCount.get(b);
      return bv - av || (a < b ? -1 : 1);
    })[0];
    const dups = ids.filter((id) => id !== canonical);

    const who = recs.find((r) => r.id === canonical);
    console.log(`▶ ${who.first_name} ${who.last_name} (phone ${phone}) — ${recs.length} copies`);
    console.log(`   canonical ${canonical}  [auth=${authCount.get(canonical)}, kids=${ppCount.get(canonical)}, phone='${who.phone}']`);
    for (const d of dups) {
      const r = recs.find((x) => x.id === d);
      console.log(`   merge←   ${d}  [auth=${authCount.get(d)}, kids=${ppCount.get(d)}, phone='${r.phone}', email='${r.email}']`);
    }

    // Report what will move.
    const ppMove = await sb.from("player_parents").select("player_id, parent_id").in("parent_id", dups);
    const movePlayers = [...new Set((ppMove.data ?? []).map((r) => r.player_id))];
    console.log(`   player_parents: ${movePlayers.length} kid link(s) from copies`);
    for (const t of [...SAFE_TABLES, "parent_auth", "event_invites"]) {
      const c = await countOn(t, t === "parent_auth" ? "id" : "id", dups);
      if (c === null) continue; // table not present
      if (typeof c === "string") { console.log(`   ${t}: ${c}`); continue; }
      if (c > 0) console.log(`   ${t}: ${c} row(s) → canonical`);
    }

    if (!COMMIT) { console.log(""); continue; }

    // ── Perform the merge ─────────────────────────────────────────────────────
    // player_parents: re-point each kid link to canonical, PRESERVING the row's
    // user_id (NOT NULL) + relationship — a bare {player_id,parent_id} upsert
    // silently fails the user_id constraint and would orphan the kid.
    const { data: dupLinks } = await sb
      .from("player_parents")
      .select("player_id, user_id, relationship")
      .in("parent_id", dups);
    const seenPid = new Set();
    for (const l of dupLinks ?? []) {
      if (seenPid.has(l.player_id)) continue;
      seenPid.add(l.player_id);
      const { error: e } = await sb.from("player_parents").upsert(
        { player_id: l.player_id, parent_id: canonical, user_id: l.user_id, relationship: l.relationship ?? "parent" },
        { onConflict: "player_id,parent_id", ignoreDuplicates: true }
      );
      if (e) { console.log(`   ! ABORT player_parents re-point ${l.player_id.slice(0, 8)}: ${e.message}`); return; }
    }
    await sb.from("player_parents").delete().in("parent_id", dups);

    // parent_auth + safe tables: bulk re-point (no parent_id-based unique).
    for (const t of ["parent_auth", ...SAFE_TABLES]) {
      const { error: e } = await sb.from(t).update({ parent_id: canonical }).in("parent_id", dups);
      if (e && !/does not exist/i.test(e.message)) console.log(`   ! ${t} update: ${e.message}`);
    }

    // event_invites: unique(event_id,parent_id) — move unless canonical already
    // invited to that event, in which case drop the dup.
    const { data: invs } = await sb.from("event_invites").select("id, event_id").in("parent_id", dups);
    const { data: canonInvs } = await sb.from("event_invites").select("event_id").eq("parent_id", canonical);
    const canonEvents = new Set((canonInvs ?? []).map((r) => r.event_id));
    for (const inv of invs ?? []) {
      if (canonEvents.has(inv.event_id)) {
        await sb.from("event_invites").delete().eq("id", inv.id);
      } else {
        await sb.from("event_invites").update({ parent_id: canonical }).eq("id", inv.id);
        canonEvents.add(inv.event_id);
      }
    }

    // Finally, remove the now-orphaned duplicate parent rows.
    const { error: delErr } = await sb.from("parents").delete().in("id", dups);
    console.log(delErr ? `   ! delete parents: ${delErr.message}` : `   ✓ merged & removed ${dups.length} duplicate(s)`);
    console.log("");
  }

  if (!COMMIT) console.log("Dry run only — re-run with --commit to apply.");
}

main().catch((e) => { console.error(e); process.exit(1); });
