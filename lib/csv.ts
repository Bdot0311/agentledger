/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

const ALIASES: Record<string, string> = {
  to: "recipient_email",
  recipient: "recipient_email",
  email: "recipient_email",
  agent: "agent_name",
  tool: "agent_name",
  date: "sent_at",
  timestamp: "sent_at",
  id: "external_id",
  message_id: "external_id",
  content: "body",
  text: "body",
  dnc: "do_not_contact",
};

/** Maps CSV rows (first row = headers) to ingest payload objects. */
export function csvToRecords(text: string): Record<string, unknown>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => {
    const k = h.trim().toLowerCase().replace(/\s+/g, "_");
    return ALIASES[k] ?? k;
  });
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      const v = (r[i] ?? "").trim();
      if (v === "") return;
      if (k === "do_not_contact") o[k] = /^(1|true|yes|y)$/i.test(v);
      else o[k] = v;
    });
    return o;
  });
}
