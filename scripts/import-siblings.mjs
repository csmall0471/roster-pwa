// One-shot importer for the end-of-season party RSVP sheet.
//
// Each non-player attendee (the "Player" column = FALSE) is treated as a
// sibling. We link them to the family's parent(s) by matching their last name
// to a roster player, then upsert into the `siblings` table so future event
// signups pre-fill them (family-level model — see migration 0032).
//
// Read-only by default; pass --commit to actually write.
//
//   node scripts/import-siblings.mjs                # dry run, default CSV
//   node scripts/import-siblings.mjs path/to.csv    # dry run, custom CSV
//   node scripts/import-siblings.mjs --commit       # write to the DB
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const txt = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const csvArg = args.find((a) => !a.startsWith("--"));
const csvPath = csvArg ? path.resolve(csvArg) : path.join(__dirname, "data", "party-rsvp.csv");

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const norm = (s) => (s ?? "").trim().replace(/\s+/g, " ");
const lower = (s) => norm(s).toLowerCase();

// CSV last name (lowercased) → corrected roster last name. Used for both
// family matching and the stored sibling name.
const LAST_NAME_OVERRIDES = {
  hoffman: "Hoffmann",
  yslava: "Novalesi-Yslava",
};

function parseSiblings(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("First Name,"));
  if (headerIdx === -1) throw new Error('Could not find a "First Name," header row');
  const sibs = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const first = norm(cols[0]);
    const last = norm(cols[1]);
    if (!first && !last) break; // blank row = end of the people table
    if (norm(cols[5]).toUpperCase() === "FALSE") {
      sibs.push({ first, last, name: `${first} ${last}`.trim() });
    }
  }
  return sibs;
}

async function main() {
  const siblings = parseSiblings(csvPath);
  console.log(`Parsed ${siblings.length} siblings from ${path.relative(root, csvPath)}\n`);

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, first_name, last_name");
  if (pErr) throw pErr;
  const { data: links, error: lErr } = await supabase
    .from("player_parents")
    .select("player_id, parent_id, parents(first_name, last_name)");
  if (lErr) throw lErr;
  const { data: existingSibs } = await supabase.from("siblings").select("parent_id, name");

  const lastToPlayers = new Map();
  for (const pl of players) {
    const k = lower(pl.last_name);
    if (!lastToPlayers.has(k)) lastToPlayers.set(k, []);
    lastToPlayers.get(k).push(pl);
  }
  const parentsByPlayer = new Map();
  for (const l of links) {
    if (!parentsByPlayer.has(l.player_id)) parentsByPlayer.set(l.player_id, []);
    const par = Array.isArray(l.parents) ? l.parents[0] : l.parents;
    parentsByPlayer.get(l.player_id).push({
      id: l.parent_id,
      name: par ? `${par.first_name} ${par.last_name}`.trim() : "",
    });
  }
  // Player full names per parent, to skip a "sibling" who is really a player.
  const playerNamesByParent = new Map();
  for (const pl of players) {
    for (const par of parentsByPlayer.get(pl.id) ?? []) {
      if (!playerNamesByParent.has(par.id)) playerNamesByParent.set(par.id, new Set());
      playerNamesByParent.get(par.id).add(lower(`${pl.first_name} ${pl.last_name}`));
    }
  }

  // Every roster player's full name, to drop "siblings" who are actually players.
  const allPlayerNames = new Set(players.map((p) => lower(`${p.first_name} ${p.last_name}`)));

  const seen = new Set((existingSibs ?? []).map((s) => `${s.parent_id}::${lower(s.name)}`));
  const planned = [];
  const unmatched = [];
  const skippedAsPlayer = [];

  for (const sib of siblings) {
    const lastFixed = LAST_NAME_OVERRIDES[lower(sib.last)] ?? sib.last;
    const nameFixed = `${sib.first} ${lastFixed}`.trim();
    const display = { ...sib, name: nameFixed };

    if (allPlayerNames.has(lower(nameFixed))) {
      skippedAsPlayer.push(display);
      continue;
    }
    const fam = lastToPlayers.get(lower(lastFixed)) ?? [];
    const parents = new Map();
    for (const pl of fam) for (const par of parentsByPlayer.get(pl.id) ?? []) parents.set(par.id, par.name);
    if (parents.size === 0) {
      unmatched.push(display);
      continue;
    }
    for (const [parentId, parentName] of parents) {
      const dedupe = `${parentId}::${lower(nameFixed)}`;
      if (seen.has(dedupe)) continue;
      if ((playerNamesByParent.get(parentId) ?? new Set()).has(lower(nameFixed))) continue;
      seen.add(dedupe);
      planned.push({
        parent_id: parentId,
        name: nameFixed,
        _parent: parentName,
        _fam: fam.map((f) => `${f.first_name} ${f.last_name}`).join(", "),
      });
    }
  }

  console.log("Planned sibling inserts:");
  for (const p of planned) {
    console.log(`  ${p.name.padEnd(22)} → parent ${p._parent}  (family: ${p._fam})`);
  }
  if (skippedAsPlayer.length) {
    console.log("\nSkipped (already a roster player, not a sibling):");
    for (const s of skippedAsPlayer) console.log(`  ${s.name}`);
  }
  if (unmatched.length) {
    console.log("\nUnmatched (no roster family found — skipped):");
    for (const s of unmatched) console.log(`  ${s.name}`);
  }
  console.log(
    `\n${planned.length} insert(s) planned · ${skippedAsPlayer.length} are players · ${unmatched.length} unmatched.`
  );

  if (!commit) {
    console.log("\nDry run — re-run with --commit to write these to the siblings table.");
    return;
  }

  let ok = 0;
  for (const p of planned) {
    const { error } = await supabase
      .from("siblings")
      .insert({ parent_id: p.parent_id, name: p.name, attributes: {} });
    if (error) console.error(`  ! ${p.name} → ${p._parent}: ${error.message}`);
    else ok++;
  }
  console.log(`\nInserted ${ok}/${planned.length} sibling rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
