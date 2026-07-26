"use client";

// Normalize a stored phone into an sms:-friendly E.164-ish string. US numbers
// (10 digits) get a +1; anything already international keeps its country code.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// Opens the Mac's Messages app (via the sms: URL scheme) with the player's
// guardians as recipients and the question(s) pre-filled as the draft body.
// Disabled when we have no phone number on file.
export default function TextParentsButton({
  phones,
  body,
  recipientsLabel,
  compact,
}: {
  phones: string[];
  body: string;
  recipientsLabel?: string;
  compact?: boolean;
}) {
  const cleaned = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors";

  if (cleaned.length === 0) {
    return (
      <button
        type="button"
        disabled
        title="No phone number on file"
        className={`${base} cursor-not-allowed text-gray-300 dark:text-gray-600`}
      >
        💬{!compact && <span>Text</span>}
      </button>
    );
  }

  // macOS Messages accepts comma-separated recipients and an &body= param.
  const href = `sms:${cleaned.join(",")}&body=${encodeURIComponent(body)}`;
  return (
    <a
      href={href}
      title={recipientsLabel ? `Text ${recipientsLabel}` : "Text parents"}
      className={`${base} text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30`}
    >
      💬{!compact && <span>Text</span>}
    </a>
  );
}
