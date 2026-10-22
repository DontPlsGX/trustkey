import { withAuthCtx, bad } from "@/lib/auth/context";
import { requireRole } from "@/lib/auth/roles";
import { tx, findFamilyFor, roleIn, settleProposal } from "@/lib/family/store";

// POST /api/proposals/<id>/<approve|reject>/<digest>
// Governance vote. Same receipt model as transfer approvals: the DPoP proof binds the vote to
// the proposal's digest. Only guardians vote, so a scammer who talks the elder into "removing the
// children from the app" or "raising the limit" still needs a quorum of the children.
export const POST = withAuthCtx(async (req, ctx) => {
  const denied = requireRole(ctx.jwt, "guardian");
  if (denied) return denied;
  const [, , id, decision, digest] = req.nextUrl.pathname.split("/").filter(Boolean);
  if (decision !== "approve" && decision !== "reject") return bad("decision must be approve|reject");

  return tx((s): Response => {
    const p = s.proposals.find((x) => x.id === id);
    if (!p) return bad("Proposal not found", 404);
    const f = findFamilyFor(s, ctx.sub);
    if (!f || f.id !== p.familyId) return bad("You are not in this family", 403);
    if (roleIn(f, ctx.sub) !== "guardian") return bad("Only guardians can vote.", 403);
    if (p.type === "remove_guardian" && p.payload.sub === ctx.sub) return bad("You cannot vote on removing yourself.", 403);
    if (digest !== p.digest) return bad("The proposal changed after you loaded it.", 409);
    if (p.status !== "open") return bad("This proposal is closed.", 409);
    if (p.receipts.some((r) => r.sub === ctx.sub)) return bad("You have already voted.", 409);

    p.receipts.push({
      sub: ctx.sub, username: ctx.username, decision, at: Date.now(), digest,
      token: ctx.token, proof: ctx.proof, htu: ctx.htu,
    });
    f.audit.push({ at: Date.now(), who: ctx.username, what: `${decision === "approve" ? "Approved" : "Rejected"} proposal ${p.type}` });
    settleProposal(f, p);
    return Response.json({ proposal: p });
  });
});

export const dynamic = "force-dynamic";
