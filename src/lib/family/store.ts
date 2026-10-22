// Server-side state for TrustKey: families, transfers, approvals, governance proposals.
//
// What this server stores about a transfer: amount, a random recipient pseudonym, risk signals,
// and an opaque ciphertext of the human details (recipient name, account, note) that only the
// elder can decrypt through Tide (`doDecrypt`, tag "vault"). It has nothing to leak.
//
// Filesystem JSON so state survives Next.js dev hot reload (same approach as the template vault).
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes, randomUUID, createHash } from "crypto";
import { DEFAULT_RULES, type Rules, type Assessment, type HistoryTx, type RecipientStat } from "../risk/engine";

const DATA_DIR = join(process.cwd(), "data", "app");
const FILE = join(DATA_DIR, "state.json");

export interface Member {
  sub: string; // Tide-verified subject (from a JWT whose signature + DPoP binding were checked)
  username: string;
  joinedAt: number;
}

/**
 * An approval is not a row the server writes on its own say-so. It keeps the evidence: the
 * guardian's access token (threshold-signed by the Tide network, carrying cnf.jkt) and the DPoP
 * proof (signed by a non-extractable key in the guardian's browser, bound to the URL
 * /api/tx/<id>/<decision>/<digest>). Anyone holding the realm's public JWK can re-check that a
 * specific guardian approved this exact transfer. The server cannot mint either signature.
 */
export interface Receipt {
  sub: string;
  username: string;
  decision: "approve" | "reject";
  at: number;
  digest: string;
  token: string;
  proof: string;
  htu: string;
}

export interface Transfer {
  id: string;
  familyId: string;
  createdAt: number;
  amount: number;
  recipientPid: string;
  onCall: boolean;
  noteFlags: string[];
  blacklistHit: boolean;
  ciphertext: string; // Tide self-encrypted JSON {name, account, bank, note}; only the elder decrypts
  assessment: Assessment;
  digest: string; // sha256 over the canonical fields guardians approve
  status: "executed" | "pending" | "cooling" | "rejected" | "blocked";
  receipts: Receipt[];
  executeAfter: number | null;
  ai?: { text: string; model: string } | null;
}

export type ProposalType = "change_rules" | "remove_guardian" | "unlock_savings" | "add_guardian";

export interface Proposal {
  id: string;
  familyId: string;
  type: ProposalType;
  payload: Record<string, unknown>;
  proposedBy: string;
  createdAt: number;
  digest: string;
  receipts: Receipt[];
  status: "open" | "applied" | "rejected";
}

export interface Family {
  id: string;
  elder: Member;
  guardians: Member[];
  inviteCode: string;
  sealed: boolean; // once sealed, guardian changes need quorum
  rules: Rules;
  frozen: boolean; // anyone in the family can tighten instantly; loosening needs quorum
  balance: number; // mock bank
  lockedSavings: number; // Family Money Lock
  contactsCiphertext: string | null; // elder's self-encrypted address book (account -> pseudonym)
  recipients: Record<string, RecipientStat>;
  audit: { at: number; who: string; what: string }[];
}

interface State {
  families: Family[];
  transfers: Transfer[];
  proposals: Proposal[];
  blacklist: string[]; // sha256(bank:account), mock SIMO feed
}

function seedBlacklist(): string[] {
  // Synthetic "known mule" accounts used in the demo scenarios.
  return ["VCB:0011002233445", "MB:0889123456", "TCB:19033377788"].map(hashAccount);
}

export function hashAccount(s: string) {
  return createHash("sha256").update(s.replace(/\s+/g, "").toUpperCase()).digest("hex");
}

function load(): State {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return { families: [], transfers: [], proposals: [], blacklist: seedBlacklist() };
  }
}

function save(s: State) {
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** Read-modify-write helper. Next.js route handlers in dev run in one process, so this is enough. */
export function tx<T>(fn: (s: State) => T): T {
  const s = load();
  const out = fn(s);
  save(s);
  return out;
}

export function read<T>(fn: (s: State) => T): T {
  return fn(load());
}

export const newId = () => randomUUID();
export const newPid = () => "R_" + randomBytes(3).toString("hex");
export const newInvite = () => randomBytes(3).toString("hex").toUpperCase();

export function findFamilyFor(s: State, sub: string) {
  return s.families.find((f) => f.elder.sub === sub || f.guardians.some((g) => g.sub === sub));
}

export function roleIn(f: Family, sub: string): "elder" | "guardian" | null {
  if (f.elder.sub === sub) return "elder";
  if (f.guardians.some((g) => g.sub === sub)) return "guardian";
  return null;
}

/** Members join before they pick a display name, so refresh the stored label from each verified token. */
export function syncName(f: Family, sub: string, name: string) {
  for (const m of [f.elder, ...f.guardians]) if (m.sub === sub && m.username !== name) m.username = name;
}

export function newFamily(elder: Member): Family {
  return {
    id: newId(),
    elder,
    guardians: [],
    inviteCode: newInvite(),
    sealed: false,
    rules: { ...DEFAULT_RULES },
    frozen: false,
    balance: 120_000_000,
    lockedSavings: 300_000_000,
    contactsCiphertext: null,
    recipients: {},
    audit: [{ at: Date.now(), who: elder.username, what: "Created the family" }],
  };
}

export function historyFor(s: State, familyId: string): HistoryTx[] {
  return s.transfers
    .filter((t) => t.familyId === familyId)
    .map((t) => ({ amount: t.amount, recipientPid: t.recipientPid, at: t.createdAt, status: t.status }));
}

export function digestOf(fields: Record<string, unknown>) {
  const canon = JSON.stringify(Object.keys(fields).sort().map((k) => [k, fields[k]]));
  return createHash("sha256").update(canon).digest("base64url");
}

export function transferDigest(t: Pick<Transfer, "id" | "familyId" | "amount" | "recipientPid" | "createdAt">) {
  return digestOf({ id: t.id, familyId: t.familyId, amount: t.amount, recipientPid: t.recipientPid, createdAt: t.createdAt });
}

export function quorumOf(f: Family) {
  return Math.max(1, Math.min(f.rules.quorum, f.guardians.length));
}

/** Move a transfer forward if its approvals and cool-off allow it. Idempotent. */
export function settle(f: Family, t: Transfer, now = Date.now()) {
  if (t.status !== "pending" && t.status !== "cooling") return;
  const approvals = new Set(t.receipts.filter((r) => r.decision === "approve").map((r) => r.sub));
  if (t.receipts.some((r) => r.decision === "reject")) {
    t.status = "rejected";
    f.audit.push({ at: now, who: "system", what: `Transfer of ${fmt(t.amount)} blocked by a guardian` });
    return;
  }
  if (approvals.size < t.assessment.requiredApprovals) return;
  if (t.executeAfter && now < t.executeAfter) {
    t.status = "cooling";
    return;
  }
  if (f.balance < t.amount) {
    t.status = "blocked";
    return;
  }
  f.balance -= t.amount;
  t.status = "executed";
  const r = f.recipients[t.recipientPid];
  if (r) r.executedCount += 1;
  f.audit.push({ at: now, who: "bank (simulated)", what: `Sent ${fmt(t.amount)} to ${t.recipientPid}` });
}

/** The guardian being removed has no vote on it, so the quorum counts the others only. */
export function proposalQuorum(f: Family, p: Pick<Proposal, "type" | "payload">) {
  if (p.type !== "remove_guardian") return quorumOf(f);
  return Math.max(1, Math.min(f.rules.quorum, f.guardians.length - 1));
}

/** Apply a governance proposal once it reaches quorum. Returns true when applied. */
export function settleProposal(f: Family, p: Proposal, now = Date.now()) {
  if (p.status !== "open") return false;
  if (p.receipts.some((r) => r.decision === "reject")) {
    p.status = "rejected";
    return false;
  }
  const approvers = new Set(p.receipts.filter((r) => r.decision === "approve").map((r) => r.sub));
  if (approvers.size < proposalQuorum(f, p)) return false;
  switch (p.type) {
    case "change_rules":
      f.rules = { ...f.rules, ...(p.payload.rules as Partial<Rules>) };
      if (p.payload.unfreeze) f.frozen = false;
      break;
    case "remove_guardian":
      f.guardians = f.guardians.filter((g) => g.sub !== p.payload.sub);
      break;
    case "unlock_savings": {
      const amt = Math.min(Number(p.payload.amount) || 0, f.lockedSavings);
      f.lockedSavings -= amt;
      f.balance += amt;
      break;
    }
    case "add_guardian":
      // add_guardian proposals carry an invite slot; the invitee then joins with the code.
      f.sealed = false;
      break;
  }
  p.status = "applied";
  f.audit.push({ at: now, who: "family (quorum reached)", what: `Applied proposal: ${p.type}` });
  return true;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n) + " ₫";
