"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_SHIPMENT_STATUSES,
  hasFullAddress,
  recipientFor,
  settingsReady,
  shipmentMetadata,
  stateCode,
  zip5,
  type ShipmentRow,
  type ShippingSettings,
} from "@/lib/shipping";
import {
  createShipment,
  findTransactionForRate,
  getRefund,
  getShipment,
  getTransaction,
  messageText,
  purchaseLabel,
  requestRefund,
  shippoConfigured,
  shippoTestMode,
  ShippoError,
  type ShippoTransaction,
} from "@/lib/shippo";
import {
  canShip,
  isMissingTable,
  loadRosterPlayer,
  loadSettings,
  SHIPMENT_COLUMNS,
  toShipmentRow,
} from "./data";

const MIGRATION_HINT = "Shipping isn't set up in the database yet (migration 070).";

async function requireShipper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." } as const;
  if (!canShip(user)) return { error: "Only the account owner can buy shipping labels." } as const;
  return { supabase, user } as const;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

const clean = (v: unknown, max = 100) => String(v ?? "").trim().slice(0, max);

function cleanNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export async function saveShippingSettings(
  input: ShippingSettings
): Promise<{ error?: string; settings?: ShippingSettings }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const settings: ShippingSettings = {
    from_name: clean(input.from_name, 35),
    from_company: clean(input.from_company, 35),
    from_street1: clean(input.from_street1, 60),
    from_street2: clean(input.from_street2, 60),
    from_city: clean(input.from_city, 40),
    from_state: stateCode(clean(input.from_state, 30)),
    from_zip: clean(input.from_zip, 10),
    from_phone: clean(input.from_phone, 20),
    from_email: clean(input.from_email, 80),
    length_in: cleanNumber(input.length_in, 6, 1, 48),
    width_in: cleanNumber(input.width_in, 4, 1, 48),
    height_in: cleanNumber(input.height_in, 3, 0.25, 48),
    weight_oz: cleanNumber(input.weight_oz, 12, 0.5, 1120),
    label_format: input.label_format === "PDF_4x6" ? "PDF_4x6" : "PDF",
    name_on_label:
      input.name_on_label === "parent" || input.name_on_label === "player_co_parent"
        ? input.name_on_label
        : "player",
    service_token: clean(input.service_token, 60) || "usps_ground_advantage",
  };
  const { error } = await g.supabase
    .from("shipping_settings")
    .upsert({ user_id: g.user.id, ...settings, updated_at: new Date().toISOString() });
  if (error) return { error: isMissingTable(error) ? MIGRATION_HINT : error.message };
  return { settings };
}

export async function savePlayerAddress(input: {
  teamId: string;
  playerId: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}): Promise<{ error?: string; address?: { street: string; city: string; state: string; zip: string } }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const player = await loadRosterPlayer(g.supabase, input.teamId, input.playerId);
  if (!player) return { error: "That player isn't on this team." };
  const address = {
    street: clean(input.street, 100),
    city: clean(input.city, 60),
    state: stateCode(clean(input.state, 30)),
    zip: clean(input.zip, 10),
  };
  const { data, error } = await g.supabase
    .from("players")
    .update({
      street: address.street || null,
      city: address.city || null,
      state: address.state || null,
      zip: address.zip || null,
    })
    .eq("id", input.playerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change this player's address." };
  revalidatePath(`/players/${input.playerId}`);
  return { address };
}

export type QuoteRate = {
  rateId: string;
  amount: number;
  currency: string;
  provider: string;
  serviceName: string;
  serviceToken: string;
  days: number | null;
};

export type Quote = {
  shipmentId: string;
  recipientName: string;
  recipientCompany: string;
  // The address as Shippo has it (after its own corrections): what the label prints.
  address: string;
  rates: QuoteRate[];
  addressFlagged: boolean;
  addressIssue: string;
};

// Ask Shippo for prices for each kid's box, a few at a time. Creating a
// shipment is free; Shippo also checks the address here, billed at a few cents.
export async function quoteShipments(input: {
  teamId: string;
  playerIds: string[];
}): Promise<{ error?: string; results?: Record<string, { quote?: Quote; error?: string }> }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  if (!shippoConfigured()) return { error: "SHIPPO_API_KEY isn't set." };

  const { settings, missingTable } = await loadSettings(g.supabase, g.user.id);
  if (missingTable) return { error: MIGRATION_HINT };
  if (!settingsReady(settings)) return { error: "Add your return address first." };

  const { supabase } = g;
  const ids = [...new Set(input.playerIds)].slice(0, 60);
  const results: Record<string, { quote?: Quote; error?: string }> = {};
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const playerId = ids[next++];
      results[playerId] = await quoteOne(supabase, settings, input.teamId, playerId);
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, ids.length) }, worker));
  return { results };
}

async function quoteOne(
  supabase: Supabase,
  settings: ShippingSettings,
  teamId: string,
  playerId: string
): Promise<{ quote?: Quote; error?: string }> {
  const player = await loadRosterPlayer(supabase, teamId, playerId);
  if (!player) return { error: "That player isn't on this team." };
  if (!hasFullAddress(player)) return { error: "No full mailing address on file." };

  const recipient = recipientFor(player, settings.name_on_label);
  try {
    const shipment = await createShipment({
      from: {
        name: settings.from_name,
        company: settings.from_company || undefined,
        street1: settings.from_street1,
        street2: settings.from_street2 || undefined,
        city: settings.from_city,
        state: stateCode(settings.from_state),
        zip: settings.from_zip,
        country: "US",
        phone: settings.from_phone || undefined,
        email: settings.from_email || undefined,
      },
      to: {
        name: recipient.name,
        company: recipient.company || undefined,
        street1: (player.street ?? "").trim(),
        city: (player.city ?? "").trim(),
        state: stateCode(player.state),
        zip: (player.zip ?? "").trim(),
        country: "US",
        validate: true,
      },
      parcel: {
        length: String(settings.length_in),
        width: String(settings.width_in),
        height: String(settings.height_in),
        distance_unit: "in",
        weight: String(settings.weight_oz),
        mass_unit: "oz",
      },
      metadata: shipmentMetadata(teamId, playerId, zip5(player.zip)),
    });

    const rates: QuoteRate[] = (shipment.rates ?? [])
      .filter((r) => r.servicelevel?.token && Number.isFinite(Number(r.amount)))
      .map((r) => ({
        rateId: r.object_id,
        amount: Number(r.amount),
        currency: r.currency || "USD",
        provider: r.provider,
        serviceName: `${r.provider} ${r.servicelevel.name ?? ""}`.trim(),
        serviceToken: r.servicelevel.token as string,
        days: r.estimated_days ?? null,
      }))
      .sort((a, b) => a.amount - b.amount);

    if (!rates.length) {
      return { error: messageText(shipment.messages) || "Shippo returned no prices for this address." };
    }
    const to = shipment.address_to;
    const v = to?.validation_results;
    return {
      quote: {
        shipmentId: shipment.object_id,
        recipientName: to?.name || recipient.name,
        recipientCompany: to?.company ?? recipient.company,
        address: [
          [to?.street1, to?.street2].filter(Boolean).join(" "),
          [to?.city, [to?.state, to?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(", "),
        rates,
        addressFlagged: v?.is_valid === false,
        addressIssue: v?.is_valid === false ? messageText(v.messages) : "",
      },
    };
  } catch (e) {
    return { error: errorText(e) };
  }
}

async function wait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function transactionUpdate(tx: ShippoTransaction) {
  if (tx.status === "SUCCESS") {
    return {
      status: "purchased" as const,
      shippo_transaction_id: tx.object_id,
      tracking_number: tx.tracking_number ?? null,
      tracking_url: tx.tracking_url_provider ?? null,
      label_url: tx.label_url ?? null,
      error: null,
    };
  }
  if (tx.status === "ERROR") {
    return {
      status: "failed" as const,
      shippo_transaction_id: tx.object_id,
      error: messageText(tx.messages) || "Shippo couldn't create this label.",
    };
  }
  if (tx.status === "REFUNDED") return { status: "refunded" as const, shippo_transaction_id: tx.object_id };
  if (tx.status === "REFUNDPENDING") {
    return { status: "refund_pending" as const, shippo_transaction_id: tx.object_id };
  }
  if (tx.status === "REFUNDREJECTED") {
    return {
      status: "refund_rejected" as const,
      shippo_transaction_id: tx.object_id,
      error: "Shippo rejected the refund.",
    };
  }
  return { status: "purchasing" as const, shippo_transaction_id: tx.object_id };
}

const UNCONFIRMED =
  "Shippo didn't confirm this purchase. Use Check before buying another label for this player.";

// Buy one label. requestKey is made once per kid per quote in the browser, so
// a retry after a lost response returns the first attempt instead of buying
// twice. allowRepeat is the coach choosing "ship again" for a kid who already
// has a label for this team; it never skips an unconfirmed purchase.
export async function buyLabel(input: {
  teamId: string;
  playerId: string;
  shipmentId: string;
  rateId: string;
  requestKey: string;
  allowRepeat?: boolean;
}): Promise<{ error?: string; shipment?: ShipmentRow }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const { supabase, user } = g;
  if (!shippoConfigured()) return { error: "SHIPPO_API_KEY isn't set." };
  if (!/^[A-Za-z0-9-]{8,80}$/.test(input.requestKey)) return { error: "Bad request." };

  const existing = await supabase
    .from("card_shipments")
    .select(SHIPMENT_COLUMNS)
    .eq("request_key", input.requestKey)
    .maybeSingle();
  if (existing.error) {
    return { error: isMissingTable(existing.error) ? MIGRATION_HINT : existing.error.message };
  }
  if (existing.data) return { shipment: toShipmentRow(existing.data) };

  const player = await loadRosterPlayer(supabase, input.teamId, input.playerId);
  if (!player) return { error: "That player isn't on this team." };

  const blocking = input.allowRepeat ? (["purchasing"] as const) : ACTIVE_SHIPMENT_STATUSES;
  const activeCheck = await supabase
    .from("card_shipments")
    .select("id, status")
    .eq("team_id", input.teamId)
    .eq("player_id", input.playerId)
    .in("status", [...blocking])
    .limit(1);
  if (activeCheck.error) return { error: activeCheck.error.message };
  if (activeCheck.data?.length) {
    return {
      error:
        activeCheck.data[0].status === "purchasing"
          ? "A label for this player is still waiting on Shippo. Use Check in the list first."
          : "This player already has a label for this team.",
    };
  }

  const { settings, missingTable } = await loadSettings(supabase, user.id);
  if (missingTable) return { error: MIGRATION_HINT };

  let shipment;
  try {
    shipment = await getShipment(input.shipmentId);
  } catch (e) {
    return { error: errorText(e) };
  }
  const tag = shipment.metadata ?? "";
  if (!tag.startsWith(`card-ship:${input.teamId}:${input.playerId}:`)) {
    return { error: "That price was for a different player. Get prices again." };
  }
  if (tag !== shipmentMetadata(input.teamId, input.playerId, zip5(player.zip))) {
    return { error: "The address changed after the price was checked. Get prices again." };
  }
  const rate = (shipment.rates ?? []).find((r) => r.object_id === input.rateId);
  if (!rate) return { error: "That price has expired. Get prices again." };

  const to = shipment.address_to;
  const inserted = await supabase
    .from("card_shipments")
    .insert({
      user_id: user.id,
      team_id: input.teamId,
      player_id: input.playerId,
      request_key: input.requestKey,
      status: "purchasing",
      recipient_name: to?.name ?? "",
      recipient_company: to?.company ?? "",
      street1: to?.street1 ?? "",
      street2: to?.street2 ?? "",
      city: to?.city ?? "",
      state: to?.state ?? "",
      zip: to?.zip ?? "",
      provider: rate.provider,
      service_name: `${rate.provider} ${rate.servicelevel?.name ?? ""}`.trim(),
      service_token: rate.servicelevel?.token ?? null,
      amount: Number(rate.amount),
      currency: rate.currency || "USD",
      label_format: settings.label_format,
      shippo_shipment_id: shipment.object_id,
      shippo_rate_id: rate.object_id,
      test_mode: shipment.test ?? shippoTestMode(),
    })
    .select("id")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const again = await supabase
        .from("card_shipments")
        .select(SHIPMENT_COLUMNS)
        .eq("request_key", input.requestKey)
        .maybeSingle();
      if (again.data) return { shipment: toShipmentRow(again.data) };
      return { error: "Another label for this player is being bought right now." };
    }
    return { error: isMissingTable(inserted.error) ? MIGRATION_HINT : inserted.error.message };
  }
  const rowId = inserted.data.id as string;

  // Closes the gap between the check above and this insert (another tab or
  // device buying the same kid): if someone else got in first, back out.
  if (!input.allowRepeat) {
    const others = await supabase
      .from("card_shipments")
      .select("id")
      .eq("team_id", input.teamId)
      .eq("player_id", input.playerId)
      .in("status", ACTIVE_SHIPMENT_STATUSES)
      .neq("id", rowId)
      .limit(1);
    if (others.error || others.data?.length) {
      await supabase.from("card_shipments").delete().eq("id", rowId);
      return {
        error: others.error ? others.error.message : "This player already has a label for this team.",
      };
    }
  }

  const finish = async (update: Record<string, unknown>, failure?: string) => {
    const saved = await saveShipment(supabase, rowId, update);
    if (saved.error) {
      return {
        error: `${failure ? `${failure} ` : ""}The result couldn't be saved here (${saved.error}). Reload the page and use Check before buying again.`,
      };
    }
    return { shipment: saved.shipment, error: failure };
  };

  let tx: ShippoTransaction;
  try {
    tx = await purchaseLabel({
      rateId: rate.object_id,
      labelFormat: settings.label_format,
      metadata: rowId,
    });
  } catch (e) {
    // A 4xx from the purchase itself means Shippo refused and nothing was
    // bought. No answer, or a server error, might have gone through, so the
    // row stays "purchasing" and keeps blocking another label until checked.
    const refused = e instanceof ShippoError && e.status != null && e.status < 500;
    if (refused) {
      const failure = errorText(e);
      return finish({ status: "failed", error: failure }, failure);
    }
    return finish({ error: UNCONFIRMED }, UNCONFIRMED);
  }

  // Shippo has the purchase: record its id before anything else can fail.
  await saveShipment(supabase, rowId, { shippo_transaction_id: tx.object_id });
  try {
    for (let i = 0; i < 4 && (tx.status === "QUEUED" || tx.status === "WAITING"); i++) {
      await wait(1500);
      tx = await getTransaction(tx.object_id);
    }
  } catch {
    // Still in progress at Shippo; Check picks it up later.
  }
  const update = transactionUpdate(tx);
  if (update.status === "purchasing") {
    return finish({ ...update, error: "Shippo is still making this label. Use Check in a minute." }, "Shippo is still making this label. Use Check in a minute.");
  }
  return finish(update, update.status === "failed" ? String(update.error) : undefined);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadOwnShipment(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("card_shipments")
    .select(`${SHIPMENT_COLUMNS}, shippo_transaction_id, shippo_refund_id, shippo_rate_id`)
    .eq("id", id)
    .maybeSingle();
  return data as
    | (Record<string, unknown> & {
        status: string;
        updated_at: string;
        shippo_transaction_id: string | null;
        shippo_refund_id: string | null;
        shippo_rate_id: string | null;
      })
    | null;
}

async function saveShipment(supabase: Supabase, id: string, update: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("card_shipments")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SHIPMENT_COLUMNS)
    .single();
  if (error) return { error: error.message };
  return { shipment: toShipmentRow(data) };
}

// Ask Shippo to refund an unused label.
export async function voidLabel(input: {
  teamId: string;
  shipmentRowId: string;
}): Promise<{ error?: string; shipment?: ShipmentRow }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const row = await loadOwnShipment(g.supabase, input.shipmentRowId);
  if (!row) return { error: "Label not found." };
  if (row.status !== "purchased" || !row.shippo_transaction_id) {
    return { error: "Only a bought label can be voided." };
  }
  try {
    const refund = await requestRefund(row.shippo_transaction_id);
    const status =
      refund.status === "SUCCESS" ? "refunded" : refund.status === "ERROR" ? "refund_rejected" : "refund_pending";
    return saveShipment(g.supabase, input.shipmentRowId, {
      status,
      shippo_refund_id: refund.object_id,
      error: status === "refund_rejected" ? "Shippo rejected the refund." : null,
    });
  } catch (e) {
    // The refund may have gone through without an answer: ask the label.
    try {
      const update = transactionUpdate(await getTransaction(row.shippo_transaction_id));
      if (update.status !== "purchased" && update.status !== "purchasing") {
        const saved = await saveShipment(g.supabase, input.shipmentRowId, update);
        return saved.error ? saved : { shipment: saved.shipment };
      }
    } catch {
      // Fall through to the original error.
    }
    return { error: errorText(e) };
  }
}

// Re-check a label that's mid-purchase or mid-refund.
export async function refreshShipment(input: {
  teamId: string;
  shipmentRowId: string;
}): Promise<{ error?: string; shipment?: ShipmentRow }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const row = await loadOwnShipment(g.supabase, input.shipmentRowId);
  if (!row) return { error: "Label not found." };
  try {
    if (row.status === "purchasing") {
      // No transaction id means the purchase never answered; Shippo can still
      // find it by the price it was bought from.
      const tx = row.shippo_transaction_id
        ? await getTransaction(row.shippo_transaction_id)
        : row.shippo_rate_id
          ? await findTransactionForRate(row.shippo_rate_id, input.shipmentRowId)
          : null;
      if (!tx) {
        return {
          error:
            "Shippo has no label for this purchase yet. If it still doesn't show in a few minutes, mark it as not bought.",
        };
      }
      const update = transactionUpdate(tx);
      if (update.status === "purchasing") {
        await saveShipment(g.supabase, input.shipmentRowId, { shippo_transaction_id: tx.object_id });
        return { error: "Shippo is still making this label. Check again in a minute." };
      }
      return saveShipment(g.supabase, input.shipmentRowId, update);
    }
    if (row.status === "refund_pending" && row.shippo_transaction_id) {
      if (row.shippo_refund_id) {
        const r = await getRefund(row.shippo_refund_id);
        if (r.status === "SUCCESS") return saveShipment(g.supabase, input.shipmentRowId, { status: "refunded", error: null });
        if (r.status === "ERROR") {
          return saveShipment(g.supabase, input.shipmentRowId, {
            status: "refund_rejected",
            error: "Shippo rejected the refund.",
          });
        }
        return { shipment: toShipmentRow(row) };
      }
      const update = transactionUpdate(await getTransaction(row.shippo_transaction_id));
      if (update.status === "refunded" || update.status === "refund_rejected") {
        return saveShipment(g.supabase, input.shipmentRowId, update);
      }
    }
    return { shipment: toShipmentRow(row) };
  } catch (e) {
    return { error: errorText(e) };
  }
}

// For a purchase Shippo never confirmed and Check couldn't find. Only once it
// has sat long enough that no request can still be working on it.
export async function markNotBought(input: {
  teamId: string;
  shipmentRowId: string;
}): Promise<{ error?: string; shipment?: ShipmentRow }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const row = await loadOwnShipment(g.supabase, input.shipmentRowId);
  if (!row) return { error: "Label not found." };
  if (row.status !== "purchasing") return { error: "Only an unconfirmed purchase can be marked." };
  if (row.shippo_transaction_id) return { error: "Shippo has this label. Use Check instead." };
  if (Date.now() - new Date(row.updated_at).getTime() < 5 * 60_000) {
    return { error: "Give Shippo 5 minutes, then use Check before marking this as not bought." };
  }
  if (row.shippo_rate_id) {
    try {
      const tx = await findTransactionForRate(row.shippo_rate_id, input.shipmentRowId);
      if (tx) {
        const update = transactionUpdate(tx);
        return saveShipment(g.supabase, input.shipmentRowId, update);
      }
    } catch (e) {
      // If Shippo's lookup keeps failing, the coach's own dashboard check
      // (the confirm step) is the way out after half an hour.
      if (Date.now() - new Date(row.updated_at).getTime() < 30 * 60_000) {
        return { error: `${errorText(e)} Try again later, or after 30 minutes this can be marked from your Shippo dashboard check alone.` };
      }
    }
  }
  return saveShipment(g.supabase, input.shipmentRowId, {
    status: "failed",
    error: "Marked as not bought.",
  });
}

// Remove a failed attempt from the list (nothing was bought).
export async function clearFailed(input: {
  teamId: string;
  shipmentRowId: string;
}): Promise<{ error?: string }> {
  const g = await requireShipper();
  if ("error" in g) return { error: g.error };
  const { error } = await g.supabase
    .from("card_shipments")
    .delete()
    .eq("id", input.shipmentRowId)
    .eq("status", "failed");
  if (error) return { error: error.message };
  return {};
}
