import "server-only";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SHIPPING_SETTINGS,
  type ShipmentRow,
  type ShippingSettings,
  type ShipPlayer,
} from "@/lib/shipping";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Labels spend money on the owner's Shippo account, and any Google account can
// sign in and make a team, so buying is limited to named emails. Falls back to
// NOTIFY_EMAIL (the owner's notification address) when the list isn't set.
export function canShip(user: User | null): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  const allowed = (process.env.SHIPPING_ALLOWED_EMAILS ?? process.env.NOTIFY_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase());
}

// PostgREST reports a table that isn't there (migration not applied yet) as
// 42P01 or PGRST205 ("not in the schema cache").
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

export const SHIPMENT_COLUMNS =
  "id, team_id, player_id, status, recipient_name, recipient_company, street1, street2, city, state, zip, provider, service_name, amount, currency, tracking_number, tracking_url, label_url, test_mode, error, created_at, updated_at";

export async function loadSettings(
  supabase: Supabase,
  userId: string
): Promise<{ settings: ShippingSettings; missingTable: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("shipping_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return {
      settings: DEFAULT_SHIPPING_SETTINGS,
      missingTable: isMissingTable(error),
      error: error.message,
    };
  }
  if (!data) return { settings: DEFAULT_SHIPPING_SETTINGS, missingTable: false };
  const d = data as Record<string, unknown>;
  const str = (k: keyof ShippingSettings) => String(d[k] ?? DEFAULT_SHIPPING_SETTINGS[k] ?? "");
  const num = (k: keyof ShippingSettings) => {
    const n = Number(d[k]);
    return Number.isFinite(n) ? n : (DEFAULT_SHIPPING_SETTINGS[k] as number);
  };
  return {
    missingTable: false,
    settings: {
      from_name: str("from_name"),
      from_company: str("from_company"),
      from_street1: str("from_street1"),
      from_street2: str("from_street2"),
      from_city: str("from_city"),
      from_state: str("from_state"),
      from_zip: str("from_zip"),
      from_phone: str("from_phone"),
      from_email: str("from_email"),
      length_in: num("length_in"),
      width_in: num("width_in"),
      height_in: num("height_in"),
      weight_oz: num("weight_oz"),
      label_format: d.label_format === "PDF_4x6" ? "PDF_4x6" : "PDF",
      name_on_label:
        d.name_on_label === "parent" || d.name_on_label === "player_co_parent"
          ? d.name_on_label
          : "player",
      service_token: str("service_token") || DEFAULT_SHIPPING_SETTINGS.service_token,
    },
  };
}

type RosterPlayerRow = {
  status: string;
  jersey_number: number | null;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    player_parents: { parents: { first_name: string | null; last_name: string | null } | null }[] | null;
  } | null;
};

const ROSTER_SELECT = `status, jersey_number,
  players(id, first_name, last_name, street, city, state, zip,
    player_parents(parents(first_name, last_name)))`;

function toShipPlayer(row: RosterPlayerRow): (ShipPlayer & { active: boolean; jersey: number | null }) | null {
  const p = row.players;
  if (!p) return null;
  return {
    id: p.id,
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    street: p.street,
    city: p.city,
    state: p.state,
    zip: p.zip,
    parents: (p.player_parents ?? [])
      .map((pp) => pp.parents)
      .filter((x): x is { first_name: string | null; last_name: string | null } => !!x),
    active: row.status !== "inactive",
    jersey: row.jersey_number,
  };
}

export async function loadTeamPlayers(supabase: Supabase, teamId: string) {
  const { data, error } = await supabase.from("roster").select(ROSTER_SELECT).eq("team_id", teamId);
  const players = ((data ?? []) as unknown as RosterPlayerRow[])
    .map(toShipPlayer)
    .filter((p): p is NonNullable<ReturnType<typeof toShipPlayer>> => !!p)
    .sort(
      (a, b) =>
        a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
    );
  return { players, error: error?.message };
}

// One kid, only if they're on this team's roster (RLS keeps it to the owner).
export async function loadRosterPlayer(supabase: Supabase, teamId: string, playerId: string) {
  const { data } = await supabase
    .from("roster")
    .select(ROSTER_SELECT)
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();
  return data ? toShipPlayer(data as unknown as RosterPlayerRow) : null;
}

export function toShipmentRow(d: Record<string, unknown>): ShipmentRow {
  return {
    ...(d as unknown as ShipmentRow),
    amount: d.amount == null ? null : Number(d.amount),
  };
}
