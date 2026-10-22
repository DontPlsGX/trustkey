import { withAuthCtx, bad } from "@/lib/auth/context";
import { tx, findFamilyFor, roleIn, settle } from "@/lib/family/store";

// POST /api/tx/<id>/<approve|reject>/<digest>
//
// The URL carries the transfer's digest. The guardian's browser signs this URL into its DPoP
// proof (htu), so the stored receipt proves "guardian X approved transfer <id> with exactly these
// fields", not merely "guardian X made some request". A digest mismatch means the guardian was
// shown different data than the server holds, and the vote is refused.
export const POST = withAuthCtx(async (req, ctx) => {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean); // api, tx, id, decision, digest
  const [, , id, decision, digest] = parts;
  if (decision !== "approve" && decision !== "reject") return bad("decision must be approve|reject");

  return tx((s): Response => {
    const t = s.transfers.find((x) => x.id === id);
    if (!t) return bad("Transfer not found", 404);
    const f = findFamilyFor(s, ctx.sub);
    if (!f || f.id !== t.familyId) return bad("You are not in this family", 403);
    // The elder cannot approve their own flagged transfer (a scammer on the phone would simply
    // tell them to), and no service account or AI has a seat: only enrolled guardians vote.
    if (roleIn(f, ctx.sub) !== "guardian") return bad("Only guardians can approve.", 403);
    if (digest !== t.digest) return bad("The transfer changed after you loaded it. Reload before voting.", 409);
    if (t.status !== "pending" && t.status !== "cooling") return bad("This transfer is already settled.", 409);
    if (t.receipts.some((r) => r.sub === ctx.sub)) return bad("You have already voted on this transfer.", 409);

    t.receipts.push({
      sub: ctx.sub,
      username: ctx.username,
      decision,
      at: Date.now(),
      digest,
      token: ctx.token,
      proof: ctx.proof,
      htu: ctx.htu,
    });
    f.audit.push({
      at: Date.now(),
      who: ctx.username,
      what: `${decision === "approve" ? "Approved" : "Blocked"} transfer of ${new Intl.NumberFormat("en-US").format(t.amount)} ₫`,
    });
    settle(f, t);
    return Response.json({ transfer: { ...t, ciphertext: null } });
  });
});

export const dynamic = "force-dynamic";
