import { withAuthCtx, bad } from "@/lib/auth/context";
import { read, findFamilyFor } from "@/lib/family/store";

// GET /api/serverview — the raw rows this server stores for your family, unprocessed.
// Powers the "God view": put it next to what the elder sees and the gap is the privacy story.
// A breach of this server, or of the AI provider, yields exactly this.
export const GET = withAuthCtx(async (_req, { sub }) => {
  const out = read((s) => {
    const f = findFamilyFor(s, sub);
    if (!f) return null;
    const short = (x: string) => (x && x.length > 48 ? x.slice(0, 48) + `… (${x.length} chars)` : x);
    return {
      family: { ...f, contactsCiphertext: f.contactsCiphertext && short(f.contactsCiphertext), audit: undefined },
      transfers: s.transfers
        .filter((t) => t.familyId === f.id)
        .slice(-5)
        .map((t) => ({
          ...t,
          ciphertext: short(t.ciphertext),
          receipts: t.receipts.map((r) => ({ ...r, token: short(r.token), proof: short(r.proof) })),
        })),
      aiProviderSaw: s.transfers
        .filter((t) => t.familyId === f.id)
        .slice(-1)
        .map((t) => ({
          amount_vnd: t.amount,
          recipient: "{R}",
          on_call: t.onCall,
          note_categories: t.noteFlags,
          signals: t.assessment.signals.map((x) => x.code),
        }))[0] ?? null,
    };
  });
  return out ? Response.json(out) : bad("You are not in a family yet.", 404);
});

export const dynamic = "force-dynamic";
