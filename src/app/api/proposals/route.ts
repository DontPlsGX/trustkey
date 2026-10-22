import { withAuthCtx, bad } from "@/lib/auth/context";
import { tx, findFamilyFor, roleIn, newId, digestOf, type ProposalType } from "@/lib/family/store";

const TYPES: ProposalType[] = ["change_rules", "remove_guardian", "unlock_savings", "add_guardian"];
const RULE_KEYS = ["perTx", "daily", "weekly", "newRecipientCap", "quorum", "coolOffMin"] as const;

// POST /api/proposals { type, payload }
// Anyone in the family may PROPOSE a loosening change; nobody can APPLY one alone.
export const POST = withAuthCtx(async (req, { sub, username }) => {
  const b = await req.json().catch(() => null);
  if (!b || !TYPES.includes(b.type)) return bad("Unknown proposal type");

  let payload: Record<string, unknown> = {};
  if (b.type === "change_rules") {
    const rules: Record<string, number> = {};
    for (const k of RULE_KEYS) {
      const v = b.payload?.rules?.[k];
      if (v !== undefined) {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < 0) return bad(`Invalid value for ${k}`);
        rules[k] = n;
      }
    }
    if (rules.quorum !== undefined && rules.quorum < 1) return bad("The quorum must be at least 1");
    payload = { rules, unfreeze: !!b.payload?.unfreeze };
  } else if (b.type === "remove_guardian") {
    payload = { sub: String(b.payload?.sub ?? ""), username: String(b.payload?.username ?? "") };
  } else if (b.type === "unlock_savings") {
    const amount = Math.round(Number(b.payload?.amount));
    if (!Number.isFinite(amount) || amount <= 0) return bad("Invalid amount");
    payload = { amount };
  }

  return tx((s): Response => {
    const f = findFamilyFor(s, sub);
    if (!f || !roleIn(f, sub)) return bad("You are not in a family yet.", 404);
    if (b.type === "remove_guardian" && !f.guardians.some((g) => g.sub === payload.sub)) return bad("Guardian not found", 404);
    const id = newId();
    const createdAt = Date.now();
    const p = {
      id,
      familyId: f.id,
      type: b.type as ProposalType,
      payload,
      proposedBy: username,
      createdAt,
      digest: digestOf({ id, familyId: f.id, type: b.type, payload: JSON.stringify(payload), createdAt }),
      receipts: [],
      status: "open" as const,
    };
    s.proposals.push(p);
    f.audit.push({ at: createdAt, who: username, what: `Proposed ${b.type}: ${JSON.stringify(payload)}` });
    return Response.json({ proposal: p }, { status: 201 });
  });
});

export const dynamic = "force-dynamic";
