type EmailTemplateOptions = {
  body: string;
  teamName?: string;
  organization?: string | null;
  season?: string | null;
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEmailHtml({ body, teamName, organization, season }: EmailTemplateOptions): string {
  const subtitle = [organization, season].filter(Boolean).join(" · ");
  const bodyHtml = esc(body).replace(/\n/g, "<br>");

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
          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${esc(teamName)}</p>
              ${subtitle ? `<p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">${esc(subtitle)}</p>` : ""}
            </td>
          </tr>` : ""}

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;${teamName ? "" : "border-radius:12px 12px 0 0;"}">
              <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;">${bodyHtml}</p>
            </td>
          </tr>

          <!-- Footer -->
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
</html>`;
}
