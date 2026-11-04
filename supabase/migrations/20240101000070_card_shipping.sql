-- ── Card shipping (Shippo labels) ─────────────────────────────────────────────
-- Teams → Ship cards buys a shipping label per kid through Shippo. Buying is
-- limited in the app to the emails in SHIPPING_ALLOWED_EMAILS (or NOTIFY_EMAIL),
-- because any Google account can sign in and create a team. RLS here is the
-- usual owner-only check.

-- One row per user: the return address, the box, and label preferences.
CREATE TABLE IF NOT EXISTS shipping_settings (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  from_name    text NOT NULL DEFAULT '',
  from_company text NOT NULL DEFAULT '',
  from_street1 text NOT NULL DEFAULT '',
  from_street2 text NOT NULL DEFAULT '',
  from_city    text NOT NULL DEFAULT '',
  from_state   text NOT NULL DEFAULT '',
  from_zip     text NOT NULL DEFAULT '',
  from_phone   text NOT NULL DEFAULT '',
  from_email   text NOT NULL DEFAULT '',
  length_in    numeric(5,2) NOT NULL DEFAULT 6,
  width_in     numeric(5,2) NOT NULL DEFAULT 4,
  height_in    numeric(5,2) NOT NULL DEFAULT 3,
  weight_oz    numeric(6,2) NOT NULL DEFAULT 12,
  label_format text NOT NULL DEFAULT 'PDF'
    CHECK (label_format IN ('PDF', 'PDF_4x6')),
  name_on_label text NOT NULL DEFAULT 'player'
    CHECK (name_on_label IN ('player', 'parent', 'player_co_parent')),
  service_token text NOT NULL DEFAULT 'usps_ground_advantage',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per label bought (or attempted). The address is copied in so the
-- record still says where the box went after the player's address changes.
-- request_key makes a retried purchase find its first attempt instead of
-- buying a second label.
CREATE TABLE IF NOT EXISTS card_shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id               uuid REFERENCES teams(id) ON DELETE SET NULL,
  player_id             uuid REFERENCES players(id) ON DELETE SET NULL,
  request_key           text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'purchasing'
    CHECK (status IN ('purchasing', 'purchased', 'failed', 'refund_pending', 'refunded', 'refund_rejected')),
  recipient_name        text NOT NULL DEFAULT '',
  recipient_company     text NOT NULL DEFAULT '',
  street1               text NOT NULL DEFAULT '',
  street2               text NOT NULL DEFAULT '',
  city                  text NOT NULL DEFAULT '',
  state                 text NOT NULL DEFAULT '',
  zip                   text NOT NULL DEFAULT '',
  provider              text,
  service_name          text,
  service_token         text,
  amount                numeric(10,2),
  currency              text,
  label_format          text,
  shippo_shipment_id    text,
  shippo_rate_id        text,
  shippo_transaction_id text,
  shippo_refund_id      text,
  tracking_number       text,
  tracking_url          text,
  label_url             text,
  test_mode             boolean NOT NULL DEFAULT false,
  error                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_shipments_user_team ON card_shipments (user_id, team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_shipments_player ON card_shipments (player_id);
-- At most one unconfirmed purchase per kid per team, so two tabs or devices
-- can't both be mid-purchase for the same box.
CREATE UNIQUE INDEX IF NOT EXISTS card_shipments_one_in_flight
  ON card_shipments (team_id, player_id) WHERE status = 'purchasing';

-- RLS: owner-only on both tables. DROP first so the migration stays re-runnable.
ALTER TABLE shipping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_shipments    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping_settings: owner full access" ON shipping_settings;
CREATE POLICY "shipping_settings: owner full access"
  ON shipping_settings FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_shipments: owner full access" ON card_shipments;
CREATE POLICY "card_shipments: owner full access"
  ON card_shipments FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
