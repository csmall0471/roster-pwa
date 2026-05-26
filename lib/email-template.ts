export type EmailTemplateOptions = {
  body?: string       // plain text — auto-escaped, newlines → <br>
  htmlBody?: string   // raw HTML — takes precedence over body
  teamName?: string
  organization?: string | null
  season?: string | null
  headerColor?: string  // default: #2563eb (blue)
}

export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function btn(label: string, url: string, color = "#ea580c"): string {
  return `<a href="${url}" style="display:inline-block;padding:11px 22px;background:${color};color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px;margin:4px 4px 4px 0;">${esc(label)}</a>`
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:5px 16px 5px 0;font-size:14px;color:#6b7280;white-space:nowrap;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:5px 0;font-size:14px;color:#111827;vertical-align:top;">${esc(value)}</td>
  </tr>`
}

export function infoTable(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0 24px;">${rows}</table>`
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid #f3f4f6;margin:22px 0;">`
}

export function buildEmailHtml({
  body,
  htmlBody,
  teamName,
  organization,
  season,
  headerColor = "#2563eb",
}: EmailTemplateOptions): string {
  const subtitle = [organization, season].filter(Boolean).join(" · ")
  const content = htmlBody ?? (body != null ? esc(body).replace(/\n/g, "<br>") : "")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

          ${teamName ? `
          <tr>
            <td style="background:${headerColor};padding:24px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${esc(teamName)}</p>
              ${subtitle ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${esc(subtitle)}</p>` : ""}
            </td>
          </tr>` : ""}

          <tr>
            <td style="background:#ffffff;padding:32px;${teamName ? "" : "border-radius:12px 12px 0 0;"}">
              ${content}
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:0 32px 28px;border-radius:0 0 12px 12px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                — Connor Small, Coach<br>
                <a href="mailto:csmall0471@gmail.com" style="color:#6b7280;text-decoration:none;">csmall0471@gmail.com</a>
              </p>
              <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;">
                You received this because you are registered with a team coached by Connor Small.<br>
                Reply <strong>STOP</strong> to opt out of future messages.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
