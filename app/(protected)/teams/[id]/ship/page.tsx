import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shippoConfigured, shippoTestMode } from "@/lib/shippo";
import type { ShipmentRow } from "@/lib/shipping";
import {
  canShip,
  isMissingTable,
  loadSettings,
  loadTeamPlayers,
  SHIPMENT_COLUMNS,
  toShipmentRow,
} from "./data";
import ShipCards from "./ShipCards";

// Server actions on this page wait on Shippo: a purchase can take a price
// lookup, the purchase and a few status checks. 60s is the Vercel Hobby
// ceiling without Fluid compute; a purchase cut off here stays recoverable
// through Check because its transaction id is saved first.
export const maxDuration = 60;

export default async function ShipCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canShip(user)) {
    return (
      <div className="max-w-xl">
        <Link href={`/teams/${id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← Team
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Ship cards</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Only the account owner can buy shipping labels.
        </p>
      </div>
    );
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, season, age_group, organization")
    .eq("id", id)
    .maybeSingle();
  if (!team) notFound();

  const [{ players }, settingsResult, shipmentsResult] = await Promise.all([
    loadTeamPlayers(supabase, id),
    loadSettings(supabase, user.id),
    supabase
      .from("card_shipments")
      .select(SHIPMENT_COLUMNS)
      .eq("team_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const missingTable = settingsResult.missingTable || isMissingTable(shipmentsResult.error);
  const shipments: ShipmentRow[] = shipmentsResult.error
    ? []
    : (shipmentsResult.data ?? []).map((r) => toShipmentRow(r as Record<string, unknown>));
  const meta = [team.organization, team.age_group, team.season].filter(Boolean).join(" · ");

  return (
    <ShipCards
      teamId={id}
      teamName={team.name as string}
      teamMeta={meta}
      players={players}
      initialSettings={settingsResult.settings}
      initialShipments={shipments}
      shippoReady={shippoConfigured()}
      testMode={shippoTestMode()}
      missingTable={missingTable}
    />
  );
}
