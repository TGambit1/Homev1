/** Shared with partner-invite Grok prompts and SMS send (strip UI-only line from outbound text). */
export const PARTNER_INVITE_DRAFT_CLOSING_LINE =
  "Does this sound like you? You can send it as is, or tell me what to change.";

export function stripPartnerInviteDraftClosing(message: string): string {
  const t = message.replace(/\r\n/g, "\n").trim();
  if (t.endsWith(PARTNER_INVITE_DRAFT_CLOSING_LINE)) {
    return t.slice(0, t.length - PARTNER_INVITE_DRAFT_CLOSING_LINE.length).replace(/\n+$/, "").trim();
  }
  return t;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const META_PREAMBLE_HINTS =
  /I hear you|I'm drafting|Thanks for sharing|I think it'll resonate|resonate with where you both|slip through the cracks when life|thinking about what you shared|tracking spending can easily|drafting a message for|That makes sense|I'd love to help you|If you're up for it|let's get started|Homebase is a quiet space|bring this vision to life|I'm glad you've\b|I'm glad you have\b|It makes sense that\b/i;

function stripMetaParagraphPreamble(t: string): string {
  const parts = t.split(/\n\n+/);
  if (parts.length < 2) return t.trim();
  const next = [...parts];
  while (next.length > 1 && META_PREAMBLE_HINTS.test(next[0])) {
    next.shift();
  }
  return next.join("\n\n").trim();
}

/** Drop leading sentences that read as the assistant talking to Partner 1, not P1 texting P2. */
function stripLeadingAssistantSentences(t: string, person1Name?: string): string {
  const trimmed = t.trim();
  if (!trimmed) return trimmed;

  const p1 = person1Name?.trim();
  const p1Vocative =
    p1 && p1.length > 0 && p1 !== "Partner 1"
      ? new RegExp(`,\\s*${escapeRe(p1)}\\s*\\.?\\s*$`, "i")
      : null;

  const isAssistantToP1Sentence = (s: string): boolean => {
    if (/^That makes sense\b/i.test(s)) return true;
    if (/^I'm glad you've\b/i.test(s)) return true;
    if (/^I'm glad you have\b/i.test(s)) return true;
    if (/^I'd love to help you\b/i.test(s)) return true;
    if (/^If you're up for it\b/i.test(s)) return true;
    if (/^I hear you\b/i.test(s)) return true;
    if (/^Thanks for sharing\b/i.test(s)) return true;
    if (/^I'm drafting\b/i.test(s)) return true;
    if (/^I think it'll resonate\b/i.test(s)) return true;
    if (/^Let's get started\b/i.test(s)) return true;
    if (/^Homebase is a quiet space\b/i.test(s)) return true;
    if (/^It makes sense that\b/i.test(s)) return true;
    if (p1Vocative && p1Vocative.test(s)) return true;
    return false;
  };

  const parts = trimmed.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return trimmed;

  let i = 0;
  while (i < parts.length && isAssistantToP1Sentence(parts[i])) {
    i++;
  }
  if (i >= parts.length) return "";
  const rest = parts.slice(i).join(" ").trim();
  return rest || trimmed;
}

/** SMS body only: no UI closing line, no assistant preamble to Partner 1. */
export function extractPartnerInviteSmsBody(
  raw: string,
  person2Name: string,
  person1Name?: string,
): string {
  let t = stripPartnerInviteDraftClosing(raw);
  t = stripLeadingAssistantSentences(t, person1Name);
  t = stripMetaParagraphPreamble(t);

  const name = (person2Name || "Partner 2").trim();
  if (name && name !== "Partner 2") {
    const escaped = escapeRe(name);
    const re = new RegExp(`(?:^|[\\r\\n]+)(Hi|Hey)[\\s,]+${escaped}\\b`, "i");
    const m = t.match(re);
    if (m?.index !== undefined && m.index > 0) {
      return t.slice(m.index).replace(/^\s+/, "").trim();
    }
  }
  return t.trim();
}
