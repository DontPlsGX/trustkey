import { withAuthCtx, bad } from "@/lib/auth/context";
import { assess, type NoteFlag, type TxInput } from "@/lib/risk/engine";
import { explain } from "@/lib/risk/ai";
import {
  tx, findFamilyFor, roleIn, historyFor, newId, newPid, transferDigest, settle, type Transfer,
} from "@/lib/family/store";

// CUNGDUYET_DEMO_FAST=1 turns cool-off minutes into seconds so a 2-minute demo video can show the
// whole flow. Off by default; the UI shows the real release time either way.
const COOL_OFF_UNIT_MS = process.env.CUNGDUYET_DEMO_FAST === "1" ? 1000 : 60_000;

const FLAGS: NoteFlag[] = ["fee", "task", "refund", "penalty", "deposit", "investment", "authority"];

// POST /api/transfers
// Body: { amount, recipientPid | null, accountHash, onCall, noteFlags[], ciphertext }
// - recipientPid null means "a recipient not in my (encrypted) address book": the server mints a
//   fresh random pseudonym and returns it, and the elder's browser files it in the address book.
// - accountHash is sha256(bank:account), compared to the mock SIMO list. The account itself never arrives.
export const POST = withAuthCtx(async (req, { sub, username }) => {
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid JSON");
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount < 1000 || amount > 2_000_000_000) return bad("Invalid amount");
  if (typeof b.ciphertext !== "string" || !b.ciphertext) return bad("Missing encrypted details");
  const noteFlags = (Array.isArray(b.noteFlags) ? b.noteFlags : []).filter((f: string) => FLAGS.includes(f as NoteFlag));

  const prepared = tx((s): { err: Response } | { t: Transfer; input: TxInput } => {
    const f = findFamilyFor(s, sub);
    if (!f) return { err: bad("You have not created a family yet.", 404) };
    if (roleIn(f, sub) !== "elder") return { err: bad("Only the protected person can send from this account.", 403) };
    if (f.frozen) return { err: bad("The family has frozen this account. Unfreezing needs the guardian quorum.", 423) };

    let pid = typeof b.recipientPid === "string" && f.recipients[b.recipientPid] ? b.recipientPid : null;
    if (!pid) {
      pid = newPid();
      f.recipients[pid] = { pid, firstSeen: Date.now(), executedCount: 0 };
    }
    const now = Date.now();
    const input = {
      amount,
      recipientPid: pid,
      onCall: !!b.onCall,
      noteFlags,
      blacklistHit: typeof b.accountHash === "string" && s.blacklist.includes(b.accountHash),
      at: now,
    };
    const a = assess(input, historyFor(s, f.id), f.recipients[pid], f.rules, f.guardians.length);
    const id = newId();
    const t: Transfer = {
      id,
      familyId: f.id,
      createdAt: now,
      amount,
      recipientPid: pid,
      onCall: input.onCall,
      noteFlags,
      blacklistHit: input.blacklistHit,
      ciphertext: b.ciphertext,
      assessment: a,
      digest: transferDigest({ id, familyId: f.id, amount, recipientPid: pid, createdAt: now }),
      status: "pending",
      receipts: [],
      executeAfter: a.coolOffMin ? now + a.coolOffMin * COOL_OFF_UNIT_MS : null,
      ai: null,
    };
    s.transfers.push(t);
    f.audit.push({
      at: now,
      who: username,
      what: `Requested ${new Intl.NumberFormat("en-US").format(amount)} ₫ to ${pid}, tier ${a.tier} (score ${a.score})`,
    });
    settle(f, t, now); // green tier executes immediately
    return { t, input };
  });
  if ("err" in prepared) return prepared.err;

  const { t, input } = prepared;
  const ai = await explain(input, t.assessment);
  if (ai) {
    tx((s) => {
      const row = s.transfers.find((x) => x.id === t.id);
      if (row) row.ai = ai;
    });
    t.ai = ai;
  }
  return Response.json({ transfer: t }, { status: 201 });
});

export const dynamic = "force-dynamic";
