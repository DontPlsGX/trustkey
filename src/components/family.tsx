"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApi } from "@/lib/client/api";
import type { Assessment, Rules } from "@/lib/risk/engine";
import { fmtVnd } from "@/lib/risk/engine";
import { SIMULATE } from "@/lib/simulate";

export interface ReceiptView {
  sub: string; username: string; decision: "approve" | "reject"; at: number; digest: string;
  token: string; proof: string; htu: string;
}
export interface TransferView {
  id: string; createdAt: number; amount: number; recipientPid: string; onCall: boolean;
  noteFlags: string[]; blacklistHit: boolean; ciphertext: string | null; assessment: Assessment;
  digest: string; status: "executed" | "pending" | "cooling" | "rejected" | "blocked";
  receipts: ReceiptView[]; executeAfter: number | null; ai?: { text: string; model: string } | null;
}
export interface ProposalView {
  id: string; type: "change_rules" | "remove_guardian" | "unlock_savings" | "add_guardian";
  payload: any; proposedBy: string; createdAt: number; digest: string; receipts: ReceiptView[];
  status: "open" | "applied" | "rejected";
}
export interface Person { sub: string; username: string }
export interface FamilyView {
  role: "elder" | "guardian" | null;
  family: null | {
    id: string; elder: Person; guardians: Person[];
    inviteCode: string | null; sealed: boolean; rules: Rules; frozen: boolean; balance: number;
    lockedSavings: number; contactsCiphertext: string | null; audit: { at: number; who: string; what: string }[];
  };
  transfers: TransferView[];
  proposals: ProposalView[];
}

// The shell names whose family you are looking at; the page's own family poll fills it in.
const ScopeContext = createContext<(s: string) => void>(() => {});

/** Family state, polled so a guardian's phone lights up within seconds of the elder pressing "Send". */
export function useFamily(pollMs = 4000) {
  const api = useApi();
  const setScope = useContext(ScopeContext);
  const [data, setData] = useState<FamilyView | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!api.authenticated || !api.token) return;
    try {
      setData(await api.call<FamilyView>("/api/family"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api.authenticated, api.token, api.call]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const elder = data?.family?.elder.username;
  useEffect(() => setScope(elder ? `${elder}'s family` : ""), [elder, setScope]);

  return { data, error, refresh, setData, api };
}

export const quorumOf = (f: NonNullable<FamilyView["family"]>) =>
  Math.max(1, Math.min(f.rules.quorum, f.guardians.length));

const NAV = [
  ["/", "Home"],
  ["/governance", "Family rules"],
  ["/receipts", "Receipts"],
  ["/godview", "What the server sees"],
] as const;

/** The product mark: two overlapping rings, two people agreeing, on the family's teal. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="var(--accent)" />
      <circle cx="11" cy="14" r="5.6" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17" cy="14" r="5.6" fill="none" stroke="#fff" strokeWidth="2" opacity="0.75" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { authenticated, isInitializing, login, logout, getValueFromIdToken } = useApi();
  const path = usePathname();
  const [scope, setScope] = useState("");
  // If the Tide SDK never finishes starting (an ORK node or TideCloak unreachable), say so instead of
  // showing the skeleton forever.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!isInitializing) return setStalled(false);
    const t = setTimeout(() => setStalled(true), 12_000);
    return () => clearTimeout(t);
  }, [isInitializing]);

  const name = String(getValueFromIdToken("given_name") ?? getValueFromIdToken("preferred_username") ?? "");

  return (
    <ScopeContext.Provider value={setScope}>
      <header className="topbar">
        <div className="wrap topbar-in">
          <a className="brand" href="/">
            <Mark />
            <span className="brand-name">Cùng Duyệt</span>
            <span className="brand-sub">FamilyKey</span>
          </a>
          {authenticated && scope && <span className="scope">{scope}</span>}
          {authenticated && (
            <nav className="nav" aria-label="Main">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>{label}</a>
              ))}
            </nav>
          )}
          {!isInitializing && (
            <div className="account" style={authenticated ? undefined : { marginLeft: "auto" }}>
              {authenticated && <span className="who" title={name}>{name}</span>}
              <button className="btn secondary small" onClick={authenticated ? logout : login}>
                {authenticated ? "Sign out" : "Sign in"}
              </button>
            </div>
          )}
        </div>
      </header>
      {SIMULATE && (
        <div className="sim-strip">
          <div className="wrap">Simulation mode: Tide’s network is under heavy load, so sign-in and encryption run on local stand-ins. Every server check is unchanged.</div>
        </div>
      )}
      <main className="wrap">
        {!isInitializing ? children : stalled ? (
          <ErrorBlock
            message="Tide sign-in is not responding. Its network or the local TideCloak may be down. Check that TideCloak is running on localhost:8080, then try again."
            onRetry={() => location.reload()}
          />
        ) : <Loading />}
      </main>
    </ScopeContext.Provider>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="card skeleton" aria-busy="true" aria-label={label}>
      <span /><span /><span />
    </div>
  );
}

/** An error kept inside its block, with a way to try again. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice err" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn secondary small" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function TierChip({ tier }: { tier: string }) {
  const label = tier === "green" ? "Low risk" : tier === "yellow" ? "Needs 1 guardian" : "High risk";
  return <span className={`chip ${tier}`}>{label}</span>;
}

export function StatusChip({ t }: { t: Pick<TransferView, "status" | "executeAfter"> }) {
  const map: Record<string, [string, string]> = {
    executed: ["Sent", "green"],
    pending: ["Waiting on guardians", "yellow"],
    cooling: ["Approved, cooling off", "yellow"],
    rejected: ["Blocked", "red"],
    blocked: ["Insufficient balance", "red"],
  };
  const [label, cls] = map[t.status] ?? [t.status, ""];
  return <span className={`chip ${cls}`}>{label}</span>;
}

// Per-person pale tints, hues at least 60° apart, so a guardian keeps one colour everywhere.
const HUES = [172, 32, 214, 330, 95];
export const tintFor = (i: number) => ({
  background: `hsl(${HUES[i % HUES.length]} 55% 90%)`,
  color: `hsl(${HUES[i % HUES.length]} 55% 22%)`,
});
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function Avatar({ name, index }: { name: string; index: number }) {
  return <span className="avatar" style={tintFor(index)}>{initials(name)}</span>;
}

const TICK = (
  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1.2 4.2 3.1 6 6.8 2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CROSS = (
  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2 2l4 4M6 2 2 6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * The quorum strip: one face per guardian with their vote, and a segmented bar for how many of the
 * required approvals are in. This is the product's own object: who in the family has said yes.
 */
export function Quorum({ t, guardians, me }: { t: TransferView; guardians: Person[]; me?: string }) {
  const need = t.assessment.requiredApprovals;
  if (!need) return null;
  const yes = t.receipts.filter((r) => r.decision === "approve").length;
  const left = Math.max(0, need - yes);
  const rejected = t.receipts.some((r) => r.decision === "reject");
  const vote = (sub: string) => t.receipts.find((r) => r.sub === sub)?.decision;

  return (
    <div className="quorum">
      <div className="quorum-faces">
        {guardians.map((g, i) => {
          const v = vote(g.sub);
          return (
            <span key={g.sub} className={`face ${v ?? "wait"}`}>
              <span className="avatar" style={tintFor(i)}>
                {initials(g.username)}
                {v && <span className="tick">{v === "approve" ? TICK : CROSS}</span>}
              </span>
              <span>{g.sub === me ? "You" : g.username}</span>
              <span className="state">{v === "approve" ? "Approved" : v === "reject" ? "Blocked" : "Waiting"}</span>
            </span>
          );
        })}
      </div>
      <div className="quorum-bar" aria-hidden="true">
        {Array.from({ length: need }, (_, i) => <span key={i} className={i < yes ? "on" : ""} />)}
      </div>
      <div className="quorum-label">
        {rejected ? <strong>Blocked by a guardian</strong>
          : left > 0 ? <><strong>Waiting on {left} {left === 1 ? "guardian" : "guardians"}</strong> · {yes} of {need} approved</>
          : <><strong>Quorum reached</strong> · {yes} of {need} approved</>}
        {t.status === "cooling" && t.executeAfter && <> · sends automatically at {clock(t.executeAfter)}</>}
      </div>
    </div>
  );
}

export const money = fmtVnd;
export const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
