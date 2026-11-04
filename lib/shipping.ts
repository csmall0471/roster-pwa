// Shared shapes and pure helpers for Teams → Ship cards (used on the server and
// in the browser; nothing here touches Shippo or the database).

export type NameOnLabel = "player" | "parent" | "player_co_parent";
export type LabelFormat = "PDF" | "PDF_4x6";

export type ShippingSettings = {
  from_name: string;
  from_company: string;
  from_street1: string;
  from_street2: string;
  from_city: string;
  from_state: string;
  from_zip: string;
  from_phone: string;
  from_email: string;
  length_in: number;
  width_in: number;
  height_in: number;
  weight_oz: number;
  label_format: LabelFormat;
  name_on_label: NameOnLabel;
  service_token: string;
};

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  from_name: "",
  from_company: "",
  from_street1: "",
  from_street2: "",
  from_city: "",
  from_state: "",
  from_zip: "",
  from_phone: "",
  from_email: "",
  length_in: 6,
  width_in: 4,
  height_in: 3,
  weight_oz: 12,
  label_format: "PDF",
  name_on_label: "player",
  service_token: "usps_ground_advantage",
};

export type ShipmentStatus =
  | "purchasing"
  | "purchased"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "refund_rejected";

// A label that is out in the world (or might be): blocks buying another one for
// the same kid unless the coach says "ship again".
export const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "purchasing",
  "purchased",
  "refund_pending",
  "refund_rejected",
];

export type ShipmentRow = {
  id: string;
  team_id: string | null;
  player_id: string | null;
  status: ShipmentStatus;
  recipient_name: string;
  recipient_company: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  provider: string | null;
  service_name: string | null;
  amount: number | null;
  currency: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_url: string | null;
  test_mode: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipParent = { first_name: string | null; last_name: string | null };

export type ShipPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  parents: ShipParent[];
};

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR",
};

// "Arizona", "az", "Ariz." → "AZ". Unknown values pass through trimmed.
export function stateCode(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const key = s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (STATES[key]) return STATES[key];
  if (key === "ariz") return "AZ";
  return s;
}

export function zip5(raw: string | null | undefined): string {
  return ((raw ?? "").match(/\d{5}/) ?? [""])[0];
}

export function hasFullAddress(p: Pick<ShipPlayer, "street" | "city" | "state" | "zip">): boolean {
  return !!(p.street?.trim() && p.city?.trim() && stateCode(p.state).length === 2 && zip5(p.zip));
}

// USPS refuses a label unless the sender has a phone and an email.
export function senderContactReady(s: Pick<ShippingSettings, "from_phone" | "from_email">): boolean {
  return (s.from_phone.match(/\d/g) ?? []).length >= 10 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.from_email.trim());
}

export function settingsReady(s: ShippingSettings): boolean {
  return !!(
    s.from_name.trim() &&
    s.from_street1.trim() &&
    s.from_city.trim() &&
    stateCode(s.from_state).length === 2 &&
    zip5(s.from_zip) &&
    senderContactReady(s) &&
    s.weight_oz > 0 &&
    s.length_in > 0 &&
    s.width_in > 0 &&
    s.height_in > 0
  );
}

function fullName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
}

// The parent to name on the label: one who shares the kid's last name when
// there is one, else the first listed.
export function mainParent(player: ShipPlayer): string {
  const named = player.parents.filter((p) => fullName(p));
  const sameLast = named.find(
    (p) => (p.last_name ?? "").trim().toLowerCase() === player.last_name.trim().toLowerCase()
  );
  return fullName(sameLast ?? named[0] ?? { first_name: null, last_name: null });
}

// Name and second line ("company" in Shippo, printed under the name).
export function recipientFor(player: ShipPlayer, mode: NameOnLabel): { name: string; company: string } {
  const kid = fullName(player);
  const parent = mainParent(player);
  if (mode === "parent" && parent) return { name: parent, company: "" };
  if (mode === "player_co_parent" && parent) return { name: kid, company: `c/o ${parent}` };
  return { name: kid, company: "" };
}

// Tags a Shippo shipment with who it's for and the ZIP it was priced to, so a
// purchase can't use another kid's price or one made before an address change.
export function shipmentMetadata(teamId: string, playerId: string, zip: string): string {
  return `card-ship:${teamId}:${playerId}:${zip}`;
}

export function formatMoney(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
