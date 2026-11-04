import "server-only";

// Thin Shippo REST client (https://docs.goshippo.com). Server-only: the token
// buys labels on the owner's account and must never reach the browser.

const BASE = "https://api.goshippo.com";

export type ShippoAddress = {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
  phone?: string;
  email?: string;
  validate?: boolean;
};

export type ShippoParcel = {
  length: string;
  width: string;
  height: string;
  distance_unit: "in";
  weight: string;
  mass_unit: "oz";
};

export type ShippoMessage = { source?: string; code?: string; text?: string };

export type ShippoRate = {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name?: string; token?: string };
  estimated_days?: number | null;
  duration_terms?: string | null;
  attributes?: string[];
};

export type ShippoShipment = {
  object_id: string;
  status: "SUCCESS" | "ERROR" | "QUEUED" | "WAITING";
  metadata?: string;
  address_to: ShippoAddress & {
    validation_results?: { is_valid?: boolean; messages?: ShippoMessage[] };
  };
  rates: ShippoRate[];
  messages: ShippoMessage[];
  test?: boolean;
};

export type ShippoTransaction = {
  object_id: string;
  status: "WAITING" | "QUEUED" | "SUCCESS" | "ERROR" | "REFUNDED" | "REFUNDPENDING" | "REFUNDREJECTED";
  tracking_number?: string | null;
  tracking_url_provider?: string | null;
  label_url?: string | null;
  messages?: ShippoMessage[];
  test?: boolean;
};

export type ShippoRefund = {
  object_id: string;
  status: "QUEUED" | "PENDING" | "SUCCESS" | "ERROR";
  transaction: string;
};

export function shippoConfigured(): boolean {
  return !!process.env.SHIPPO_API_KEY;
}

export function shippoTestMode(): boolean {
  return (process.env.SHIPPO_API_KEY ?? "").startsWith("shippo_test_");
}

// status is Shippo's HTTP status; absent when Shippo never answered (network
// error or timeout), in which case a purchase may or may not have gone through.
export class ShippoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function shippo<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = process.env.SHIPPO_API_KEY;
  if (!token) throw new ShippoError("Shippo isn't set up yet: SHIPPO_API_KEY is missing.");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ShippoError("Couldn't reach Shippo. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error body; fall through with the raw text.
  }
  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data && String((data as { detail: unknown }).detail)) ||
      (data && typeof data === "object" && JSON.stringify(data).slice(0, 300)) ||
      text.slice(0, 300) ||
      res.statusText;
    throw new ShippoError(`Shippo said: ${detail}`, res.status);
  }
  return data as T;
}

export function createShipment(input: {
  from: ShippoAddress;
  to: ShippoAddress;
  parcel: ShippoParcel;
  metadata: string;
}): Promise<ShippoShipment> {
  return shippo<ShippoShipment>("/shipments/", {
    method: "POST",
    body: {
      address_from: input.from,
      address_to: input.to,
      parcels: [input.parcel],
      metadata: input.metadata.slice(0, 100),
      async: false,
    },
  });
}

export function getShipment(id: string): Promise<ShippoShipment> {
  return shippo<ShippoShipment>(`/shipments/${encodeURIComponent(id)}`);
}

export function purchaseLabel(input: {
  rateId: string;
  labelFormat: "PDF" | "PDF_4x6";
  metadata: string;
}): Promise<ShippoTransaction> {
  return shippo<ShippoTransaction>("/transactions/", {
    method: "POST",
    body: {
      rate: input.rateId,
      label_file_type: input.labelFormat,
      metadata: input.metadata.slice(0, 100),
      async: false,
    },
  });
}

export function getTransaction(id: string): Promise<ShippoTransaction> {
  return shippo<ShippoTransaction>(`/transactions/${encodeURIComponent(id)}`);
}

// The label bought from a given price, if any (used when a purchase never
// answered and its transaction id wasn't recorded). Each result must carry
// this rate or our row id, so an ignored filter can't hand back another kid's label.
export async function findTransactionForRate(
  rateId: string,
  rowId: string
): Promise<ShippoTransaction | null> {
  const list = await shippo<{ results?: (ShippoTransaction & { rate?: unknown; metadata?: string })[] }>(
    `/transactions/?rate=${encodeURIComponent(rateId)}&results=25`
  );
  const rateOf = (t: { rate?: unknown }) =>
    typeof t.rate === "string" ? t.rate : (t.rate as { object_id?: string } | null)?.object_id;
  return list.results?.find((t) => t.metadata === rowId || rateOf(t) === rateId) ?? null;
}

export function requestRefund(transactionId: string): Promise<ShippoRefund> {
  return shippo<ShippoRefund>("/refunds/", {
    method: "POST",
    body: { transaction: transactionId, async: false },
  });
}

export function getRefund(id: string): Promise<ShippoRefund> {
  return shippo<ShippoRefund>(`/refunds/${encodeURIComponent(id)}`);
}

export function messageText(messages: ShippoMessage[] | undefined): string {
  return (messages ?? [])
    .map((m) => m.text?.trim())
    .filter(Boolean)
    .join(" ");
}
