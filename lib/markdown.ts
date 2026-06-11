// Tiny, safe markdown renderer for basic formatting (headings, bold, italic,
// lists, links, inline code, tables, horizontal rules). Input is HTML-escaped
// FIRST, then a small set of markdown patterns are turned into a known, fixed
// set of tags — so the output can't contain injected HTML. Links are
// restricted to http(s)/mailto.
//
// Pass { inline: true } to emit inline `style=""` attributes instead of relying
// on the .markdown-body CSS class — required for HTML email, which strips
// stylesheets.

type Options = { inline?: boolean };

// Inline styles used for email rendering (must be self-contained).
const STYLE: Record<string, string> = {
  p: "margin:0 0 10px;font-size:14px;line-height:1.6;color:#111827;",
  h2: "margin:16px 0 6px;font-size:20px;font-weight:700;line-height:1.3;color:#111827;",
  h3: "margin:14px 0 5px;font-size:17px;font-weight:700;color:#111827;",
  h4: "margin:12px 0 4px;font-size:15px;font-weight:700;color:#111827;",
  h5: "margin:10px 0 4px;font-weight:600;color:#111827;",
  h6: "margin:10px 0 4px;font-weight:600;color:#111827;",
  ul: "margin:0 0 10px;padding-left:22px;",
  ol: "margin:0 0 10px;padding-left:22px;",
  li: "margin:0 0 3px;font-size:14px;line-height:1.6;color:#111827;",
  a: "color:#2563eb;text-decoration:underline;",
  hr: "border:0;border-top:1px solid #e5e7eb;margin:16px 0;",
  table: "width:100%;border-collapse:collapse;margin:10px 0;font-size:14px;",
  th: "border:1px solid #e5e7eb;background:#f9fafb;padding:6px 9px;text-align:left;font-weight:600;color:#111827;",
  td: "border:1px solid #e5e7eb;padding:6px 9px;text-align:left;vertical-align:top;color:#111827;",
  strong: "font-weight:700;",
  em: "font-style:italic;",
  code: "background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:0.85em;",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string, sty: (tag: string) => string): string {
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer"${sty("a")}>${text}</a>`
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, `<strong${sty("strong")}>$1</strong>`);
  s = s.replace(/__([^_]+)__/g, `<strong${sty("strong")}>$1</strong>`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, `$1<em${sty("em")}>$2</em>`);
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, `$1<em${sty("em")}>$2</em>`);
  s = s.replace(/`([^`]+)`/g, `<code${sty("code")}>$1</code>`);
  return s;
}

const isTableSep = (l: string) =>
  l.includes("-") && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l);

function splitRow(l: string): string[] {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function renderMarkdown(md: string, opts: Options = {}): string {
  if (!md) return "";
  const sty = (tag: string) => (opts.inline && STYLE[tag] ? ` style="${STYLE[tag]}"` : "");
  const lines = esc(md).replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      out.push(`<p${sty("p")}>${para.map((l) => inline(l, sty)).join("<br>")}</p>`);
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      flush();
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const header = splitRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        body.push(splitRow(lines[i]));
        i++;
      }
      const hasHeader = header.some((c) => c.trim() !== "");
      const thead = hasHeader
        ? `<thead><tr>${header.map((c) => `<th${sty("th")}>${inline(c, sty)}</th>`).join("")}</tr></thead>`
        : "";
      const tbody = `<tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td${sty("td")}>${inline(c, sty)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      out.push(`<table${sty("table")}>${thead}${tbody}</table>`);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      out.push(`<hr${sty("hr")}>`);
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}${sty(`h${level}`)}>${inline(heading[2], sty)}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li${sty("li")}>${inline(lines[i].replace(/^\s*[-*]\s+/, ""), sty)}</li>`);
        i++;
      }
      out.push(`<ul${sty("ul")}>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li${sty("li")}>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""), sty)}</li>`);
        i++;
      }
      out.push(`<ol${sty("ol")}>${items.join("")}</ol>`);
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return out.join("\n");
}

// Styling lives in globals.css (.markdown-body) — real CSS so it survives
// Tailwind's preflight reset of headings/tables.
export const markdownClass = "markdown-body";
