"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ACTIVE_SHIPMENT_STATUSES,
  formatMoney,
  hasFullAddress,
  mainParent,
  recipientFor,
  settingsReady,
  zip5,
  type NameOnLabel,
  type ShipmentRow,
  type ShipmentStatus,
  type ShippingSettings,
  type ShipPlayer,
} from "@/lib/shipping";
import {
  buyLabel,
  clearFailed,
  markNotBought,
  quoteShipments,
  refreshShipment,
  savePlayerAddress,
  saveShippingSettings,
  voidLabel,
  type Quote,
  type QuoteRate,
} from "./actions";

type Player = ShipPlayer & { active: boolean; jersey: number | null };
type QuoteState = { quote: Quote; key: string } | { error: string };
type Stage = "pick" | "quoting" | "review" | "confirm" | "buying" | "done";
type ServiceOption = { token: string; name: string; count: number; total: number; days: number | null };

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const secondaryButton =
  "rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

const STATUS_CHIP: Record<ShipmentStatus, { label: string; className: string }> = {
  purchased: { label: "Label bought", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  purchasing: { label: "Waiting on Shippo", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  failed: { label: "Not bought", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  refund_pending: { label: "Refund requested", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  refunded: { label: "Voided", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  refund_rejected: { label: "Refund rejected", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

function playerName(p: { first_name: string; last_name: string }) {
  return `${p.first_name} ${p.last_name}`.trim();
}

function addressLine(p: Pick<ShipPlayer, "street" | "city" | "state" | "zip">) {
  const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [p.street, cityLine].filter(Boolean).join(", ");
}

function addressKey(p: Pick<ShipPlayer, "street" | "zip">) {
  return `${(p.street ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${zip5(p.zip)}`;
}

function isOk(q: QuoteState | undefined): q is { quote: Quote; key: string } {
  return !!q && "quote" in q;
}

function cheapestFor(quote: Quote, token: string): QuoteRate | undefined {
  return quote.rates.find((r) => r.serviceToken === token);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// crypto.randomUUID only exists on https pages (not a phone hitting a dev server).
function newKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function labelsHref(teamId: string, ids: string[]) {
  return `/teams/${teamId}/ship/labels?ids=${ids.join(",")}`;
}

export default function ShipCards(props: {
  teamId: string;
  teamName: string;
  teamMeta: string;
  players: Player[];
  initialSettings: ShippingSettings;
  initialShipments: ShipmentRow[];
  shippoReady: boolean;
  testMode: boolean;
  missingTable: boolean;
}) {
  const { teamId, teamName, teamMeta, shippoReady, testMode, missingTable } = props;
  const [settings, setSettings] = useState(props.initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(!settingsReady(props.initialSettings));
  const [players, setPlayers] = useState(props.players);
  const [shipments, setShipments] = useState(props.initialShipments);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const shipped = new Set(
      props.initialShipments
        .filter((s) => s.player_id && ACTIVE_SHIPMENT_STATUSES.includes(s.status))
        .map((s) => s.player_id as string)
    );
    return new Set(
      props.players.filter((p) => p.active && hasFullAddress(p) && !shipped.has(p.id)).map((p) => p.id)
    );
  });
  const [shipAgain, setShipAgain] = useState<Set<string>>(new Set());
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [service, setService] = useState(props.initialSettings.service_token);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batch, setBatch] = useState<{ bought: ShipmentRow[]; failed: { name: string; error: string }[] }>({
    bought: [],
    failed: [],
  });
  const [error, setError] = useState<string | null>(null);

  // Newest active label per kid (shipments are newest first).
  const activeByPlayer = useMemo(() => {
    const m = new Map<string, ShipmentRow>();
    for (const s of shipments) {
      if (s.player_id && ACTIVE_SHIPMENT_STATUSES.includes(s.status) && !m.has(s.player_id)) {
        m.set(s.player_id, s);
      }
    }
    return m;
  }, [shipments]);

  const selectedPlayers = players.filter((p) => selected.has(p.id));
  const blocked = missingTable
    ? "Apply migration 070 in Supabase before buying labels."
    : !shippoReady
      ? "Add SHIPPO_API_KEY to the app's environment to connect Shippo."
      : !settingsReady(settings)
        ? "Add your return address to get prices."
        : null;

  // Kids in the current selection who share a mailing address (siblings).
  const sharedAddress = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const p of players) {
      if (!selected.has(p.id) || !hasFullAddress(p)) continue;
      const k = addressKey(p);
      groups.set(k, [...(groups.get(k) ?? []), p.id]);
    }
    const m = new Map<string, string[]>();
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        m.set(
          id,
          ids.filter((x) => x !== id).map((x) => players.find((p) => p.id === x)?.first_name ?? "")
        );
      }
    }
    return m;
  }, [players, selected]);

  // Totals cover the boxes that will be bought (flagged addresses left out).
  const serviceOptions = useMemo(() => {
    const m = new Map<string, ServiceOption>();
    const counted = Object.entries(quotes).filter(([id, q]) => isOk(q) && !skipped.has(id));
    const pool = counted.length ? counted : Object.entries(quotes);
    for (const [, q] of pool) {
      if (!isOk(q)) continue;
      const seen = new Set<string>();
      for (const r of q.quote.rates) {
        if (seen.has(r.serviceToken)) continue;
        seen.add(r.serviceToken);
        const o = m.get(r.serviceToken) ?? { token: r.serviceToken, name: r.serviceName, count: 0, total: 0, days: r.days };
        o.count += 1;
        o.total += r.amount;
        if (r.days != null) o.days = Math.max(o.days ?? 0, r.days);
        m.set(r.serviceToken, o);
      }
    }
    return { options: [...m.values()].sort((a, b) => b.count - a.count || a.total - b.total), boxes: pool.filter(([, q]) => isOk(q)).length };
  }, [quotes, skipped]);

  const reviewRows = selectedPlayers.filter((p) => quotes[p.id]);
  const toBuy = reviewRows.filter((p) => {
    const q = quotes[p.id];
    return isOk(q) && cheapestFor(q.quote, service) && !skipped.has(p.id);
  });
  const total = toBuy.reduce((sum, p) => {
    const q = quotes[p.id];
    return sum + (isOk(q) ? cheapestFor(q.quote, service)?.amount ?? 0 : 0);
  }, 0);

  function toggle(id: string) {
    const turningOff = selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (turningOff) next.delete(id);
      else next.add(id);
      return next;
    });
    if (turningOff) {
      setShipAgain((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Never includes a kid who already has a label; that takes "Ship again" on the row.
  function selectAllReady() {
    setSelected(
      new Set(players.filter((p) => p.active && hasFullAddress(p) && !activeByPlayer.has(p.id)).map((p) => p.id))
    );
    setShipAgain(new Set());
  }

  function upsertShipment(row: ShipmentRow) {
    setShipments((prev) => {
      const i = prev.findIndex((s) => s.id === row.id);
      if (i === -1) return [row, ...prev];
      const next = [...prev];
      next[i] = row;
      return next;
    });
  }

  async function getPrices() {
    setError(null);
    const ids = selectedPlayers.filter((p) => hasFullAddress(p)).map((p) => p.id);
    if (!ids.length) return;
    setStage("quoting");
    let res: Awaited<ReturnType<typeof quoteShipments>>;
    try {
      res = await quoteShipments({ teamId, playerIds: ids });
    } catch {
      res = { error: "Couldn't get prices. Check your connection and try again." };
    }
    if (res.error || !res.results) {
      setError(res.error ?? "Couldn't get prices.");
      setStage("pick");
      return;
    }
    const next: Record<string, QuoteState> = {};
    const skip = new Set<string>();
    for (const id of ids) {
      const r = res.results[id];
      if (r?.quote) {
        next[id] = { quote: r.quote, key: newKey() };
        if (r.quote.addressFlagged) skip.add(id);
      } else {
        next[id] = { error: r?.error ?? "No price came back." };
      }
    }
    // Keep the saved service when every box can use it; otherwise the
    // cheapest service that covers the most boxes.
    const okCount = Object.values(next).filter(isOk).length;
    const covers = (token: string) =>
      Object.values(next).filter((q) => isOk(q) && cheapestFor(q.quote, token)).length;
    let pick = settings.service_token;
    if (covers(pick) < okCount) {
      const totals = new Map<string, { count: number; total: number }>();
      for (const q of Object.values(next)) {
        if (!isOk(q)) continue;
        for (const r of q.quote.rates) {
          const t = totals.get(r.serviceToken) ?? { count: 0, total: 0 };
          t.count += 1;
          t.total += r.amount;
          totals.set(r.serviceToken, t);
        }
      }
      pick =
        [...totals.entries()].sort((a, b) => b[1].count - a[1].count || a[1].total - b[1].total)[0]?.[0] ??
        pick;
    }
    setQuotes(next);
    setSkipped(skip);
    setService(pick);
    setStage("review");
  }

  async function buyAll() {
    const list = toBuy.flatMap((p) => {
      const q = quotes[p.id];
      const rate = isOk(q) ? cheapestFor(q.quote, service) : undefined;
      return isOk(q) && rate ? [{ p, q, rate }] : [];
    });
    if (!list.length) return;
    setStage("buying");
    setError(null);
    setProgress({ done: 0, total: list.length });
    const bought: ShipmentRow[] = [];
    const failed: { name: string; error: string }[] = [];
    // Kids whose label exists or might: they leave the selection (and "ship
    // again") so a second label can't be bought by accident. Kids whose
    // attempt plainly failed stay selected to try again.
    const settled = new Set<string>();
    for (const [i, { p, q, rate }] of list.entries()) {
      const args = {
        teamId,
        playerId: p.id,
        shipmentId: q.quote.shipmentId,
        rateId: rate.rateId,
        requestKey: q.key,
        allowRepeat: shipAgain.has(p.id),
      };
      let res: Awaited<ReturnType<typeof buyLabel>>;
      let lost = false;
      try {
        res = await buyLabel(args);
      } catch {
        // Same request key, so a retry can't buy a second label.
        try {
          res = await buyLabel(args);
        } catch {
          lost = true;
          res = { error: "Lost the connection. Reload the page to see whether this label went through." };
        }
      }
      if (res.shipment) upsertShipment(res.shipment);
      const status = res.shipment?.status;
      if (lost || (status && status !== "failed")) settled.add(p.id);
      if (status === "purchased") {
        bought.push(res.shipment as ShipmentRow);
      } else {
        failed.push({
          name: playerName(p),
          error:
            status === "purchasing"
              ? res.shipment?.error ?? "Shippo didn't confirm this label. Use Check in the list below."
              : res.error ?? res.shipment?.error ?? "Not bought.",
        });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setSelected((prev) => new Set([...prev].filter((id) => !settled.has(id))));
    setShipAgain((prev) => new Set([...prev].filter((id) => !settled.has(id))));
    setQuotes({});
    setBatch({ bought, failed });
    setStage("done");
    if (service !== settings.service_token) {
      const saved = await saveShippingSettings({ ...settings, service_token: service }).catch(() => null);
      if (saved?.settings) setSettings(saved.settings);
    }
  }

  const busy = stage === "quoting" || stage === "buying";

  return (
    <div className="max-w-4xl pb-28">
      <Link href={`/teams/${teamId}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← {teamName}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ship cards</h1>
        {testMode && (
          <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            Test mode: labels are free and can&apos;t be mailed
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
        {teamName}
        {teamMeta ? ` · ${teamMeta}` : ""}. Pick the kids, check prices, then buy a label for each box.
      </p>

      {blocked && (missingTable || !shippoReady) && (
        <p className="mt-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {blocked}
        </p>
      )}

      <SettingsPanel
        open={settingsOpen}
        setOpen={setSettingsOpen}
        settings={settings}
        disabled={busy || missingTable}
        onSaved={(s) => {
          setSettings(s);
          setService(s.service_token);
          setQuotes({});
          setStage("pick");
        }}
      />

      {stage === "done" ? (
        <BatchResult
          teamId={teamId}
          batch={batch}
          onDone={() => {
            setBatch({ bought: [], failed: [] });
            setStage("pick");
          }}
        />
      ) : stage === "review" || stage === "confirm" || stage === "buying" ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review prices</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                One {settings.length_in}×{settings.width_in}×{settings.height_in} in box at {settings.weight_oz} oz per kid.
              </p>
            </div>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => setStage("pick")}
            >
              ← Change players
            </button>
          </div>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Service</span>
            <select
              className={`${inputClass} mt-1`}
              value={service}
              disabled={busy || stage === "confirm"}
              onChange={(e) => setService(e.target.value)}
            >
              {serviceOptions.options.map((o) => (
                <option key={o.token} value={o.token}>
                  {o.name} · {formatMoney(o.total)}
                  {o.days != null ? ` · about ${o.days} day${o.days === 1 ? "" : "s"}` : ""}
                  {o.count < serviceOptions.boxes ? ` · only ${o.count} of ${serviceOptions.boxes} boxes` : ""}
                </option>
              ))}
            </select>
          </label>
          {service.startsWith("ups") || service.startsWith("fedex") ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              UPS and FedEx can add a home-delivery charge after purchase. USPS doesn&apos;t have one.
            </p>
          ) : null}

          <ul className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {reviewRows.map((p) => {
              const q = quotes[p.id];
              const rate = isOk(q) ? cheapestFor(q.quote, service) : undefined;
              const canBuy = isOk(q) && !!rate;
              const included = canBuy && !skipped.has(p.id);
              return (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                    checked={included}
                    disabled={!canBuy || busy || stage === "confirm"}
                    onChange={() =>
                      setSkipped((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    aria-label={`Buy a label for ${playerName(p)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {playerName(p)}
                        {shipAgain.has(p.id) && (
                          <span className="ml-2 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                            Second label
                          </span>
                        )}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {rate ? formatMoney(rate.amount, rate.currency) : ""}
                      </p>
                    </div>
                    {isOk(q) ? (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          To {q.quote.recipientName}
                          {q.quote.recipientCompany ? `, ${q.quote.recipientCompany}` : ""} · {q.quote.address}
                        </p>
                        {!rate && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            This service isn&apos;t available for this address. Pick another service.
                          </p>
                        )}
                        {q.quote.addressFlagged && (
                          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                            Shippo couldn&apos;t confirm this address
                            {q.quote.addressIssue ? `: ${q.quote.addressIssue}` : "."} Check it, or tick the box to buy
                            anyway.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-red-600 dark:text-red-400">{q?.error}</p>
                    )}
                    {sharedAddress.has(p.id) && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Same address as {sharedAddress.get(p.id)?.join(", ")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Players</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Kids who already have a label for this team are left out unless you choose to ship again.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} disabled={busy} onClick={selectAllReady}>
                Select all ready
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => {
                  setSelected(new Set());
                  setShipAgain(new Set());
                }}
              >
                Clear
              </button>
            </div>
          </div>
          {players.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No players on this team yet.</p>
          ) : (
            <ul className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  teamId={teamId}
                  player={p}
                  nameMode={settings.name_on_label}
                  checked={selected.has(p.id)}
                  disabled={busy}
                  active={activeByPlayer.get(p.id) ?? null}
                  shipAgain={shipAgain.has(p.id)}
                  sharedWith={sharedAddress.get(p.id) ?? null}
                  onToggle={() => toggle(p.id)}
                  onShipAgain={() => {
                    setShipAgain((prev) => new Set(prev).add(p.id));
                    setSelected((prev) => new Set(prev).add(p.id));
                  }}
                  onAddressSaved={(addr) => {
                    setPlayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...addr } : x)));
                    setQuotes((prev) => {
                      const next = { ...prev };
                      delete next[p.id];
                      return next;
                    });
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <History
        teamId={teamId}
        shipments={shipments}
        players={players}
        onChange={upsertShipment}
        onRemove={(id) => setShipments((prev) => prev.filter((s) => s.id !== id))}
      />

      {stage !== "done" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="min-w-0 flex-1 text-sm">
              {stage === "buying" ? (
                <p className="font-semibold text-gray-900 dark:text-white">
                  Buying label {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                </p>
              ) : stage === "confirm" ? (
                <>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Buy {toBuy.length} label{toBuy.length === 1 ? "" : "s"} for {formatMoney(total)}?
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {testMode ? "Test mode: nothing is charged." : "Shippo charges the payment method on your account."}
                  </p>
                </>
              ) : stage === "review" ? (
                <p className="font-semibold text-gray-900 dark:text-white">
                  {toBuy.length} label{toBuy.length === 1 ? "" : "s"} · {formatMoney(total)}
                </p>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {stage === "quoting"
                      ? "Getting prices…"
                      : `${selectedPlayers.length} player${selectedPlayers.length === 1 ? "" : "s"} selected`}
                  </p>
                  {error ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  ) : blocked ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{blocked}</p>
                  ) : null}
                </>
              )}
            </div>
            {stage === "confirm" ? (
              <>
                <button type="button" className={secondaryButton} onClick={() => setStage("review")}>
                  Cancel
                </button>
                <button type="button" className={primaryButton} onClick={buyAll}>
                  Buy labels
                </button>
              </>
            ) : stage === "review" || stage === "buying" ? (
              <button
                type="button"
                className={primaryButton}
                disabled={busy || toBuy.length === 0}
                onClick={() => setStage("confirm")}
              >
                {stage === "buying" ? "Buying…" : `Buy ${toBuy.length} label${toBuy.length === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                type="button"
                className={primaryButton}
                disabled={!!blocked || busy || selectedPlayers.filter((p) => hasFullAddress(p)).length === 0}
                onClick={getPrices}
              >
                {stage === "quoting" ? "Getting prices…" : "Get prices"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  teamId,
  player,
  nameMode,
  checked,
  disabled,
  active,
  shipAgain,
  sharedWith,
  onToggle,
  onShipAgain,
  onAddressSaved,
}: {
  teamId: string;
  player: Player;
  nameMode: NameOnLabel;
  checked: boolean;
  disabled: boolean;
  active: ShipmentRow | null;
  shipAgain: boolean;
  sharedWith: string[] | null;
  onToggle: () => void;
  onShipAgain: () => void;
  onAddressSaved: (addr: { street: string; city: string; state: string; zip: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const full = hasFullAddress(player);
  const lockedByLabel = !!active && !shipAgain;
  const canShipAgain = !!active && active.status !== "purchasing";
  const recipient = recipientFor(player, nameMode);
  const parent = mainParent(player);

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
          checked={checked}
          disabled={disabled || !full || lockedByLabel}
          onChange={onToggle}
          aria-label={`Ship to ${playerName(player)}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium text-gray-900 dark:text-white">
              {playerName(player)}
              {player.jersey != null && (
                <span className="ml-1.5 text-sm font-normal text-gray-400 dark:text-gray-500">#{player.jersey}</span>
              )}
            </p>
            {!player.active && (
              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                Inactive
              </span>
            )}
            {active && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[active.status].className}`}>
                {STATUS_CHIP[active.status].label} {shortDate(active.created_at)}
              </span>
            )}
          </div>
          {editing ? (
            <AddressEditor
              teamId={teamId}
              player={player}
              onCancel={() => setEditing(false)}
              onSaved={(addr) => {
                onAddressSaved(addr);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {full ? (
                  <>
                    To {recipient.name}
                    {recipient.company ? `, ${recipient.company}` : ""} · {addressLine(player)}
                  </>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">
                    {player.street || player.city || player.zip ? `Incomplete address: ${addressLine(player)}` : "No address on file"}
                  </span>
                )}
              </p>
              {parent && nameMode === "player" && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Parent: {parent}</p>
              )}
              {checked && sharedWith && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Same address as {sharedWith.join(", ")}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                <button
                  type="button"
                  className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => setEditing(true)}
                >
                  {full ? "Edit address" : "Add address"}
                </button>
                {lockedByLabel && canShipAgain && full && (
                  <button
                    type="button"
                    className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    disabled={disabled}
                    onClick={onShipAgain}
                  >
                    Ship again
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function AddressEditor({
  teamId,
  player,
  onCancel,
  onSaved,
}: {
  teamId: string;
  player: Player;
  onCancel: () => void;
  onSaved: (addr: { street: string; city: string; state: string; zip: string }) => void;
}) {
  const [street, setStreet] = useState(player.street ?? "");
  const [city, setCity] = useState(player.city ?? "");
  const [state, setState] = useState(player.state ?? "");
  const [zip, setZip] = useState(player.zip ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await savePlayerAddress({ teamId, playerId: player.id, street, city, state, zip }).catch(() => ({
      error: "Couldn't save. Check your connection and try again.",
      address: undefined,
    }));
    setSaving(false);
    if (res.error || !res.address) {
      setErr(res.error ?? "Couldn't save.");
      return;
    }
    onSaved(res.address);
  }

  return (
    <div className="mt-2 grid grid-cols-6 gap-2">
      <input
        className={`${inputClass} col-span-6`}
        placeholder="Street and apartment"
        autoComplete="street-address"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
      />
      <input className={`${inputClass} col-span-3`} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
      <input
        className={`${inputClass} col-span-1`}
        placeholder="State"
        maxLength={20}
        value={state}
        onChange={(e) => setState(e.target.value)}
      />
      <input
        className={`${inputClass} col-span-2`}
        placeholder="ZIP"
        inputMode="numeric"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
      />
      <div className="col-span-6 flex items-center gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save address"}
        </button>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>
      <p className="col-span-6 text-xs text-gray-400 dark:text-gray-500">This updates the player&apos;s profile too.</p>
    </div>
  );
}

function SettingsPanel({
  open,
  setOpen,
  settings,
  disabled,
  onSaved,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  settings: ShippingSettings;
  disabled: boolean;
  onSaved: (s: ShippingSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ShippingSettings>(k: K, v: ShippingSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ready = settingsReady(settings);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await saveShippingSettings(draft).catch(() => ({
      error: "Couldn't save. Check your connection and try again.",
      settings: undefined,
    }));
    setSaving(false);
    if (res.error || !res.settings) {
      setErr(res.error ?? "Couldn't save.");
      return;
    }
    setDraft(res.settings);
    onSaved(res.settings);
    if (settingsReady(res.settings)) setOpen(false);
  }

  const fromLine = [
    settings.from_name,
    settings.from_street1,
    [settings.from_city, [settings.from_state, settings.from_zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  if (!open) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="min-w-0 text-sm">
          <p className="text-gray-900 dark:text-white">
            <span className="font-medium">From:</span> {ready ? fromLine : "No return address yet"}
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            {settings.length_in}×{settings.width_in}×{settings.height_in} in · {settings.weight_oz} oz ·{" "}
            {settings.label_format === "PDF_4x6" ? "4×6 label printer" : "Regular printer"} · Addressed to{" "}
            {settings.name_on_label === "parent"
              ? "the parent"
              : settings.name_on_label === "player_co_parent"
                ? "the player, c/o parent"
                : "the player"}
          </p>
        </div>
        <button
          type="button"
          className={secondaryButton}
          disabled={disabled}
          onClick={() => {
            setDraft(settings);
            setOpen(true);
          }}
        >
          Edit
        </button>
      </div>
    );
  }

  const field = (k: keyof ShippingSettings, label: string, extra?: Partial<React.InputHTMLAttributes<HTMLInputElement>>) => (
    <label className="block text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <input
        className={`${inputClass} mt-1`}
        value={String(draft[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
        {...extra}
      />
    </label>
  );
  const numberField = (k: "length_in" | "width_in" | "height_in" | "weight_oz", label: string) => (
    <label className="block text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <input
        className={`${inputClass} mt-1 tabular-nums`}
        type="number"
        inputMode="decimal"
        min={0}
        step={k === "weight_oz" ? 0.5 : 0.25}
        value={Number.isFinite(draft[k]) ? draft[k] : ""}
        onChange={(e) => set(k, Number(e.target.value))}
      />
    </label>
  );

  return (
    <section className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Return address</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div className="sm:col-span-3">{field("from_name", "Name", { autoComplete: "name" })}</div>
        <div className="sm:col-span-3">{field("from_company", "Company (optional)")}</div>
        <div className="sm:col-span-4">{field("from_street1", "Street", { autoComplete: "address-line1" })}</div>
        <div className="sm:col-span-2">{field("from_street2", "Apt or suite (optional)", { autoComplete: "address-line2" })}</div>
        <div className="sm:col-span-3">{field("from_city", "City", { autoComplete: "address-level2" })}</div>
        <div className="sm:col-span-1">{field("from_state", "State", { autoComplete: "address-level1", maxLength: 20 })}</div>
        <div className="sm:col-span-2">{field("from_zip", "ZIP", { autoComplete: "postal-code", inputMode: "numeric" })}</div>
        <div className="sm:col-span-3">{field("from_phone", "Phone (optional)", { autoComplete: "tel", inputMode: "tel" })}</div>
        <div className="sm:col-span-3">{field("from_email", "Email (optional)", { autoComplete: "email", type: "email" })}</div>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Box</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberField("length_in", "Length (in)")}
        {numberField("width_in", "Width (in)")}
        {numberField("height_in", "Height (in)")}
        {numberField("weight_oz", "Weight (oz)")}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        100 cards weigh about 6–7 oz before the box. Weigh one packed box: under-stated weight can come back as
        postage due, and USPS prices jump at 4, 8, 12 and 16 oz.
      </p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Labels</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-400">Printer</span>
          <select
            className={`${inputClass} mt-1`}
            value={draft.label_format}
            onChange={(e) => set("label_format", e.target.value === "PDF_4x6" ? "PDF_4x6" : "PDF")}
          >
            <option value="PDF">Regular printer (8.5×11 paper)</option>
            <option value="PDF_4x6">Label printer (4×6 labels)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-400">Name on the label</span>
          <select
            className={`${inputClass} mt-1`}
            value={draft.name_on_label}
            onChange={(e) => set("name_on_label", e.target.value as NameOnLabel)}
          >
            <option value="player">Player (Alex Smith)</option>
            <option value="player_co_parent">Player, c/o parent (Alex Smith, c/o Sam Smith)</option>
            <option value="parent">Parent (Sam Smith)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {ready && (
          <button type="button" className={secondaryButton} onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={save}
          disabled={saving || disabled}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>
    </section>
  );
}

function BatchResult({
  teamId,
  batch,
  onDone,
}: {
  teamId: string;
  batch: { bought: ShipmentRow[]; failed: { name: string; error: string }[] };
  onDone: () => void;
}) {
  const spent = batch.bought.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  return (
    <section className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {batch.bought.length
          ? `Bought ${batch.bought.length} label${batch.bought.length === 1 ? "" : "s"} for ${formatMoney(spent)}`
          : "No labels were bought"}
      </h2>
      {batch.bought.length > 0 && (
        <a
          href={labelsHref(
            teamId,
            batch.bought.map((s) => s.id)
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Print labels (PDF)
        </a>
      )}
      {batch.failed.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {batch.failed.length} didn&apos;t go through:
          </p>
          <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {batch.failed.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}:</span> {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className={`${secondaryButton} mt-4 block`} onClick={onDone}>
        Back to players
      </button>
    </section>
  );
}

function History({
  teamId,
  shipments,
  players,
  onChange,
  onRemove,
}: {
  teamId: string;
  shipments: ShipmentRow[];
  players: Player[];
  onChange: (row: ShipmentRow) => void;
  onRemove: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null);
  const [confirmMark, setConfirmMark] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  if (!shipments.length) return null;
  const printable = shipments.filter((s) => s.status === "purchased");

  async function run(id: string, fn: () => Promise<{ error?: string; shipment?: ShipmentRow }>) {
    setBusyId(id);
    setRowError((e) => ({ ...e, [id]: "" }));
    const res = await fn().catch(() => ({ error: "Couldn't reach the server. Try again.", shipment: undefined }));
    setBusyId(null);
    if (res.shipment) onChange(res.shipment);
    if (res.error) setRowError((e) => ({ ...e, [id]: res.error as string }));
  }

  const nameFor = (s: ShipmentRow) => {
    const p = players.find((x) => x.id === s.player_id);
    return p ? playerName(p) : s.recipient_name;
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Labels for this team</h2>
        {printable.length > 0 && (
          <a
            href={labelsHref(
              teamId,
              printable.map((s) => s.id)
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryButton}
          >
            Print all {printable.length}
          </a>
        )}
      </div>
      <ul className="mt-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {shipments.map((s) => {
          const chip = STATUS_CHIP[s.status];
          const busy = busyId === s.id;
          return (
            <li key={s.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-medium text-gray-900 dark:text-white">{nameFor(s)}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span>
                {s.test_mode && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">
                    Test
                  </span>
                )}
                <span className="ml-auto tabular-nums text-gray-500 dark:text-gray-400">
                  {shortDate(s.created_at)} · {formatMoney(s.amount, s.currency ?? "USD")}
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                {s.service_name ?? "—"} · to {s.recipient_name}
                {s.recipient_company ? `, ${s.recipient_company}` : ""}, {s.street1}
                {s.street2 ? ` ${s.street2}` : ""}, {s.city}, {s.state} {s.zip}
              </p>
              {s.error && s.status !== "purchased" && (
                <p className="mt-0.5 text-red-600 dark:text-red-400">{s.error}</p>
              )}
              {rowError[s.id] && <p className="mt-0.5 text-red-600 dark:text-red-400">{rowError[s.id]}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {s.status === "purchased" && (
                  <a
                    href={labelsHref(teamId, [s.id])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Label
                  </a>
                )}
                {s.tracking_number && (
                  <a
                    href={s.tracking_url ?? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${s.tracking_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline tabular-nums"
                  >
                    Track {s.tracking_number}
                  </a>
                )}
                {(s.status === "purchasing" || s.status === "refund_pending") && (
                  <button
                    type="button"
                    className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => run(s.id, () => refreshShipment({ teamId, shipmentRowId: s.id }))}
                  >
                    {busy ? "Checking…" : "Check"}
                  </button>
                )}
                {s.status === "purchasing" &&
                  (confirmMark === s.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-700 dark:text-gray-300">
                        Only if your Shippo dashboard has no label for this box.
                      </span>
                      <button
                        type="button"
                        className="font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={async () => {
                          await run(s.id, () => markNotBought({ teamId, shipmentRowId: s.id }));
                          setConfirmMark(null);
                        }}
                      >
                        Mark as not bought
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 dark:text-gray-400 hover:underline"
                        disabled={busy}
                        onClick={() => setConfirmMark(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-gray-600 dark:text-gray-400 hover:underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setConfirmMark(s.id)}
                    >
                      Not bought?
                    </button>
                  ))}
                {s.status === "purchased" &&
                  (confirmVoid === s.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-700 dark:text-gray-300">Void this label? Only for a box you haven&apos;t mailed.</span>
                      <button
                        type="button"
                        className="font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={async () => {
                          await run(s.id, () => voidLabel({ teamId, shipmentRowId: s.id }));
                          setConfirmVoid(null);
                        }}
                      >
                        {busy ? "Voiding…" : "Void label"}
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 dark:text-gray-400 hover:underline"
                        disabled={busy}
                        onClick={() => setConfirmVoid(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-gray-600 dark:text-gray-400 hover:underline"
                      onClick={() => setConfirmVoid(s.id)}
                    >
                      Void
                    </button>
                  ))}
                {s.status === "failed" && (
                  <button
                    type="button"
                    className="text-gray-600 dark:text-gray-400 hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={async () => {
                      setBusyId(s.id);
                      const res = await clearFailed({ teamId, shipmentRowId: s.id }).catch(() => ({
                        error: "Couldn't reach the server. Try again.",
                      }));
                      setBusyId(null);
                      if (res.error) setRowError((e) => ({ ...e, [s.id]: res.error as string }));
                      else onRemove(s.id);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
