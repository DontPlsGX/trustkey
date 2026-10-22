import { withAuthCtx, bad } from "@/lib/auth/context";
import { requireRole } from "@/lib/auth/roles";
import {
  tx, findFamilyFor, roleIn, newFamily, settle, settleProposal, newInvite, syncName,
  type Family, type Transfer, type Proposal,
} from "@/lib/family/store";

// The view a member gets. Nothing here is identity of a counterparty: transfers carry a
// pseudonym and a ciphertext only the elder can open.
function view(f: Family, sub: string, transfers: Transfer[], proposals: Proposal[]) {
  const role = roleIn(f, sub);
  return {
    role,
    family: {
      id: f.id,
      elder: { sub: f.elder.sub, username: f.elder.username },
      guardians: f.guardians.map((g) => ({ sub: g.sub, username: g.username })),
      inviteCode: f.sealed ? null : f.inviteCode,
      sealed: f.sealed,
      rules: f.rules,
      frozen: f.frozen,
      balance: f.balance,
      lockedSavings: f.lockedSavings,
      contactsCiphertext: role === "elder" ? f.contactsCiphertext : null,
      audit: f.audit.slice(-30).reverse(),
    },
    transfers: transfers
      .filter((t) => t.familyId === f.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((t) => ({
        ...t,
        // receipts are public evidence; tokens are DPoP-bound and useless without the guardian's device key
        ciphertext: role === "elder" ? t.ciphertext : null,
      })),
    proposals: proposals.filter((p) => p.familyId === f.id).sort((a, b) => b.createdAt - a.createdAt),
  };
}

export const GET = withAuthCtx(async (_req, { sub, username }) => {
  const out = tx((s) => {
    const f = findFamilyFor(s, sub);
    if (!f) return null;
    syncName(f, sub, username);
    s.transfers.filter((t) => t.familyId === f.id).forEach((t) => settle(f, t));
    s.proposals.filter((p) => p.familyId === f.id).forEach((p) => settleProposal(f, p));
    return view(f, sub, s.transfers, s.proposals);
  });
  return Response.json(out ?? { role: null, family: null, transfers: [], proposals: [] });
});

// POST /api/family  { action: "create" | "join" | "seal" | "freeze" | "contacts", ... }
export const POST = withAuthCtx(async (req, { jwt, sub, username }) => {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  // Token role first (TideCloak says who you are), then family membership below (whose family).
  const denied =
    action === "create" || action === "seal" || action === "contacts" ? requireRole(jwt, "elder")
    : action === "join" ? requireRole(jwt, "guardian")
    : null;
  if (denied) return denied;
  const me = { sub, username, joinedAt: Date.now() };

  const result = tx((s): Response => {
    const existing = findFamilyFor(s, sub);

    if (action === "create") {
      if (existing) return bad("You are already in a family.", 409);
      const f = newFamily(me);
      s.families.push(f);
      return Response.json(view(f, sub, s.transfers, s.proposals), { status: 201 });
    }

    if (action === "join") {
      if (existing) return bad("You are already in a family.", 409);
      const code = String(body.code ?? "").trim().toUpperCase();
      const f = s.families.find((x) => x.inviteCode === code && !x.sealed);
      if (!f) return bad("That invite code is wrong, or the family has sealed its guardian list.", 404);
      if (f.guardians.length >= 5) return bad("This family already has 5 guardians.", 409);
      f.guardians.push(me);
      f.audit.push({ at: Date.now(), who: username, what: "Joined as a guardian" });
      return Response.json(view(f, sub, s.transfers, s.proposals));
    }

    if (!existing) return bad("You are not in a family yet.", 404);
    const f = existing;
    const role = roleIn(f, sub);

    if (action === "seal") {
      // Sealing is a one-way door for the elder: after this, the guardian list changes only by quorum.
      if (role !== "elder") return bad("Only the protected person can seal the first guardian list.", 403);
      if (f.guardians.length < 2) return bad("Add at least 2 guardians before sealing.", 409);
      f.sealed = true;
      f.inviteCode = newInvite();
      f.audit.push({ at: Date.now(), who: username, what: "Sealed the guardian list (any change now needs the quorum)" });
      return Response.json(view(f, sub, s.transfers, s.proposals));
    }

    if (action === "freeze") {
      // Tightening is unilateral: any member can freeze outgoing transfers instantly.
      // Loosening (unfreeze) is a change_rules proposal that needs quorum.
      f.frozen = true;
      f.audit.push({ at: Date.now(), who: username, what: "Froze all transfers" });
      return Response.json(view(f, sub, s.transfers, s.proposals));
    }

    if (action === "contacts") {
      if (role !== "elder") return bad("Only the protected person has an address book.", 403);
      if (typeof body.ciphertext !== "string") return bad("Missing ciphertext");
      f.contactsCiphertext = body.ciphertext;
      return Response.json({ ok: true });
    }

    return bad("Unknown action");
  });
  return result;
});

export const dynamic = "force-dynamic";
