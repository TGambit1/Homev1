/**
 * Calendar image module: fetch events, build SVG week grid, convert to PNG, upload to Storage, return public URL.
 * Used for MMS calendar view (e.g. "What's my schedule").
 * Embeds Inter font (woff2) in SVG so resvg/svg2png renders text reliably.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;
const BUCKET = "calendar-images";

/** Inter Latin 400 woff2 from jsDelivr (stable). Cached so resvg can load it via fontBuffers (text would not render otherwise in WASM). */
const INTER_WOFF2_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff2";

let cachedFontBuffer: Uint8Array | null = null;

async function getInterFontBuffer(): Promise<Uint8Array> {
  if (cachedFontBuffer) return cachedFontBuffer;
  const res = await fetch(INTER_WOFF2_URL);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  cachedFontBuffer = new Uint8Array(buf);
  return cachedFontBuffer;
}

/** Supported ranges: one stored image per (userId, partnerRole, range). */
export type CalendarRange = "1d" | "3d" | "1w" | "2w" | "1m";

const DEFAULT_RANGE: CalendarRange = "1w";

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  id: string;
}

/** Fetch events from existing /calendar/events endpoint. */
async function fetchEvents(
  userId: string,
  partnerRole: "person1" | "person2",
  range: CalendarRange = DEFAULT_RANGE
): Promise<CalendarEvent[]> {
  const timestamp = Date.now();
  const url = `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events?userId=${encodeURIComponent(userId)}&partnerRole=${partnerRole}&range=${range}&_t=${timestamp}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Cache-Control": "no-cache",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error || data?.details || res.statusText;
    throw new Error(`Calendar fetch failed: ${msg}`);
  }
  if (!Array.isArray(data.events)) {
    throw new Error("Calendar not connected or no events");
  }
  return data.events as CalendarEvent[];
}

const EMBEDDED_FONT_FAMILY = "Inter";
const DISPLAY_TIMEZONE = "America/New_York";
const TIME_AXIS_WIDTH = 44;

/** Build a 7-day week SVG (Mon–Sun) with event blocks. Size ~500px wide for phone. Uses font-family "Inter" so resvg (with font passed via options) can render text. Times in EST. */
function buildCalendarSvg(events: CalendarEvent[], options?: { title?: string }): string {
  const title = options?.title ?? "Your week";
  const totalWidth = 500;
  const gridWidth = totalWidth - TIME_AXIS_WIDTH;
  const dayW = gridWidth / 7;
  const headerH = 36;
  const dayLabelH = 24;
  const hourH = 22;
  const startHour = 0;
  const endHour = 24;
  const hours = 24;
  const gridH = hourH * hours;
  const totalH = headerH + dayLabelH + gridH;
  const timeLabelInterval = 2;

  const dateInTz = (d: Date) => {
    const s = d.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIMEZONE });
    const [y, m, day] = s.split("-").map(Number);
    return { y, m: m - 1, day };
  };
  const today = new Date();
  const t = dateInTz(today);
  const todayInTz = new Date(t.y, t.m, t.day);
  const todayDay = todayInTz.getDay();
  const mondayOffset = todayDay === 0 ? -6 : 1 - todayDay;
  const weekStartInTz = new Date(todayInTz);
  weekStartInTz.setDate(todayInTz.getDate() + mondayOffset);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayColumns: { date: Date; label: string; dateKey: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartInTz);
    d.setDate(weekStartInTz.getDate() + i);
    dayColumns.push({ date: d, label: dayLabels[i], dateKey: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` });
  }

  /** Parse hour/minute in display timezone (EST) so events position correctly regardless of server UTC. */
  function parseEventTime(iso: string): { hour: number; minute: number } {
    const d = new Date(iso);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let hour = 0,
      minute = 0;
    for (const p of parts) {
      if (p.type === "hour") hour = parseInt(p.value, 10);
      if (p.type === "minute") minute = parseInt(p.value, 10);
    }
    return { hour: hour + minute / 60, minute };
  }

  function eventToRect(ev: CalendarEvent): { dayIndex: number; y: number; h: number; label: string } | null {
    const start = parseEventTime(ev.start);
    const end = parseEventTime(ev.end);
    const startH = Math.max(0, Math.min(24, start.hour));
    let endH = Math.max(0, Math.min(24, end.hour));
    if (endH <= startH) endH = startH + 0.5;
    const startY = startH * hourH;
    const endY = endH * hourH;
    const h = Math.max(18, endY - startY);
    const evDateInTz = dateInTz(new Date(ev.start));
    const evDateKey = `${evDateInTz.y}-${evDateInTz.m}-${evDateInTz.day}`;
    let dayIndex = -1;
    for (let i = 0; i < dayColumns.length; i++) {
      if (dayColumns[i].dateKey === evDateKey) {
        dayIndex = i;
        break;
      }
    }
    if (dayIndex < 0) return null;
    const timeStr = ev.start.includes("T")
      ? new Date(ev.start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: DISPLAY_TIMEZONE,
        })
      : "All day";
    const label = `${timeStr} ${(ev.summary || "").slice(0, 20)}${(ev.summary || "").length > 20 ? "…" : ""}`;
    return { dayIndex, y: startY, h, label };
  }

  const eventRects = events.map(eventToRect).filter((r): r is NonNullable<typeof r> => r != null);

  let eventsSvg = "";
  eventRects.forEach((r, i) => {
    const x = TIME_AXIS_WIDTH + 2 + r.dayIndex * dayW;
    const y = headerH + dayLabelH + r.y;
    eventsSvg += `<rect x="${x}" y="${y}" width="${dayW - 4}" height="${r.h}" rx="4" fill="#3b82f6" opacity="0.85"/>`;
    eventsSvg += `<text x="${x + 4}" y="${y + 14}" font-family="${EMBEDDED_FONT_FAMILY}" font-size="11" fill="white">${escapeXml(r.label)}</text>`;
  });

  let dayHeaders = "";
  dayColumns.forEach((col, i) => {
    const x = TIME_AXIS_WIDTH + i * dayW + dayW / 2;
    dayHeaders += `<text x="${x}" y="${headerH + dayLabelH - 6}" text-anchor="middle" font-family="${EMBEDDED_FONT_FAMILY}" font-size="11" fill="#374151">${col.label} ${col.date.getDate()}</text>`;
  });

  let timeAxisSvg = "";
  for (let h = 0; h < 24; h += timeLabelInterval) {
    const y = headerH + dayLabelH + h * hourH;
    const label = h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;
    timeAxisSvg += `<text x="${TIME_AXIS_WIDTH - 4}" y="${y + 14}" text-anchor="end" font-family="${EMBEDDED_FONT_FAMILY}" font-size="10" fill="#6b7280">${escapeXml(label)}</text>`;
  }

  const gridLines: string[] = [];
  for (let h = 0; h <= hours; h++) {
    const y = headerH + dayLabelH + h * hourH;
    gridLines.push(`<line x1="${TIME_AXIS_WIDTH}" y1="${y}" x2="${totalWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
  }
  for (let d = 0; d <= 7; d++) {
    const x = TIME_AXIS_WIDTH + d * dayW;
    gridLines.push(`<line x1="${x}" y1="${headerH + dayLabelH}" x2="${x}" y2="${totalH}" stroke="#e5e7eb" stroke-width="1"/>`);
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalH}" viewBox="0 0 ${totalWidth} ${totalH}">
  <rect width="${totalWidth}" height="${totalH}" fill="#ffffff"/>
  <text x="${totalWidth/2}" y="24" text-anchor="middle" font-family="${EMBEDDED_FONT_FAMILY}" font-size="16" font-weight="bold" fill="#111827">${escapeXml(title)}</text>
  ${timeAxisSvg}
  ${dayHeaders}
  ${gridLines.join("\n  ")}
  ${eventsSvg}
</svg>`;
  return svg;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Convert SVG string to PNG bytes. Dynamic import keeps WASM out of the boot path. */
async function svgToPng(svgString: string, fontBuffer: Uint8Array): Promise<Uint8Array> {
  const { svg2png } = await import("jsr:@hugojosefson/svg2png");
  const pngBytes = await svg2png(svgString, {
    fitTo: { mode: "width", value: 500 },
    font: {
      fontBuffers: [fontBuffer],
      defaultFontFamily: EMBEDDED_FONT_FAMILY,
      loadSystemFonts: false,
    },
  });
  return pngBytes;
}

/** Upload PNG to Supabase Storage (one file per userId/partnerRole/range; overwritten on next request). */
async function uploadPngAndGetUrl(
  pngBytes: Uint8Array,
  userId: string,
  partnerRole: "person1" | "person2",
  range: CalendarRange
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const path = `calendar/${userId}/${partnerRole}/${range}.png`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, pngBytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so clients (MMS, CDN) don't show an old image with a stale title
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Single entry: fetch events → build SVG → convert to PNG → upload → return public URL.
 * Storage: one image per (userId, partnerRole, range); same path overwritten each time.
 * Throws on no token, fetch error, or upload error (caller should fall back to text).
 */
export async function getCalendarImageUrl(
  userId: string,
  partnerRole: "person1" | "person2",
  options?: { range?: CalendarRange; title?: string }
): Promise<string> {
  const range = options?.range ?? DEFAULT_RANGE;
  const [events, fontBuffer] = await Promise.all([
    fetchEvents(userId, partnerRole, range),
    getInterFontBuffer(),
  ]);
  const svg = buildCalendarSvg(events, { title: options?.title });
  const pngBytes = await svgToPng(svg, fontBuffer);
  const url = await uploadPngAndGetUrl(pngBytes, userId, partnerRole, range);
  return url;
}
