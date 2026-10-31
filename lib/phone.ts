// Digits-only key for de-duplicating parents regardless of how the phone was
// formatted on entry — "(623) 203-9378", "6232039378", and "+16232039378" all
// collapse to "6232039378". A leading US country code is dropped. Returns "" for
// blank/missing input (callers treat "" as "no phone to match on").
export function phoneKey(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

// A US/Canada number in E.164 ("+16232039378"), or null for anything else. An
// explicit "+" must be +1: phoneKey alone would let "+44 623 203 9378" pass as a
// parent's 10 digits and send the text overseas.
export function usPhoneE164(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  const d = t.replace(/\D/g, "");
  if (t.startsWith("+") && !(d.length === 11 && d.startsWith("1"))) return null;
  const key = phoneKey(d);
  return key.length === 10 ? `+1${key}` : null;
}
