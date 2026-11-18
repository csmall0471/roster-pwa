-- Sibling pricing for whole-series ("package") training: what each extra kid
-- from the same family pays. "50%" = that much off package_price; anything
-- else ("$50") = a flat price per sibling. NULL = every kid pays full price.
-- Stored on every session row of the series, like package_price.
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS package_sibling_price text;
