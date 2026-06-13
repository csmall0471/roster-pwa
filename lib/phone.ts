// Digits-only key for de-duplicating parents regardless of how the phone was
// formatted on entry — "(623) 203-9378", "6232039378", and "+16232039378" all
// collapse to "6232039378". A leading US country code is dropped. Returns "" for
// blank/missing input (callers treat "" as "no phone to match on").
export function phoneKey(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
