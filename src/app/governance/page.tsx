"use client";

import { useState } from "react";
import { ErrorBlock, Loading, Shell, useFamily, money, when, quorumOf, type FamilyView, type ProposalView } from "@/components/family";
import type { Rules } from "@/lib/risk/engine";

export default function GovernancePage() {
  return (
    <Shell>
      <Governance />
    </Shell>
  );
}

const RULE_LABELS: [keyof Rules, string, "vnd" | "n"][] = [
  ["perTx", "Per-transfer limit", "vnd"],
  ["daily", "Daily limit (24 hours)", "vnd"],
  ["weekly", "Weekly limit (7 days)", "vnd"],
  ["newRecipientCap", "Cap to a new recipient (7 days)", "vnd"],
  ["quorum", "Guardians needed for high risk", "n"],
  ["coolOffMin", "Cool-off for high risk (minutes)", "n"],
];

const fmtRule = (kind: "vnd" | "n", v: number) => (kind === "vnd" ? money(v) : String(v));

function describe(p: ProposalView, f: NonNullable<FamilyView["family"]>) {
  switch (p.type) {
    case "change_rules": {
      const parts = Object.entries(p.payload.rules ?? {}).map(([k, v]) => {
        const meta = RULE_LABELS.find((r) => r[0] === k);
        const kind = meta?.[2] ?? "n";
        return `${meta?.[1] ?? k}: ${fmtRule(kind, Number((f.rules as any)[k]))} → ${fmtRule(kind, Number(v))}`;
      });
      if (p.payload.unfreeze) parts.push("Unfreeze the account");
      return parts.join(" · ") || "(no change)";
    }
    case "remove_guardian": return `Remove guardian ${p.payload.username}`;
    case "unlock_savings": return `Move ${money(Number(p.payload.amount))} from locked savings to the spending account`;
    case "add_guardian": return "Reopen the list to invite another guardian";
  }
}

function needFor(p: ProposalView, f: NonNullable<FamilyView["family"]>) {
  if (p.type === "remove_guardian") return Math.max(1, Math.min(f.rules.quorum, f.guardians.length - 1));
  return quorumOf(f);
}

function Governance() {
  const { data, error, refresh, api } = useFamily();
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [unfreeze, setUnfreeze] = useState(false);
  const [unlock, setUnlock] = useState("");

  if (!api.authenticated) return <p className="empty">Please sign in.</p>;
  if (!data) return error ? <ErrorBlock message={error} onRetry={refresh} /> : <Loading />;
  const f = data.family;
  if (!f) return <div className="card"><p className="empty">You are not in a family yet. <a href="/">Set one up</a></p></div>;
  const me = String(api.getValueFromIdToken("sub") ?? "");
  const isGuardian = data.role === "guardian";
  const q = quorumOf(f);

  async function propose(type: string, payload: object) {
    setErr(""); setOk("");
    try {
      await api.call("/api/proposals", { type, payload });
      setOk("Proposal sent. It now needs the guardians' votes.");
      setDraft({}); setUnfreeze(false); setUnlock("");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function vote(p: ProposalView, decision: "approve" | "reject") {
    setErr("");
    try {
      await api.call(`/api/proposals/${p.id}/${decision}/${p.digest}`, {});
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function freeze() {
    await api.call("/api/family", { action: "freeze" }).catch((e) => setErr(e.message));
    refresh();
  }

  const ruleChanges = Object.fromEntries(
    Object.entries(draft).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v.replace(/[^\d]/g, ""))])
  );
  const open = data.proposals.filter((p) => p.status === "open").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Family rules</h1>
          <p className="lede">
            Anyone can tighten, at once. Loosening a limit, unfreezing, removing a guardian or unlocking savings needs {q} {q === 1 ? "guardian" : "guardians"} to agree.
            No admin, bank clerk, AI or caller can do it for them.
          </p>
        </div>
      </div>
      {err && <ErrorBlock message={err} />}
      {ok && <div className="notice info"><span>{ok}</span></div>}

      <div className="grid2">
        <div className="card">
          <div className="card-head"><h2>Current rules</h2><span className="meta">{f.frozen ? "Frozen" : "Active"}</span></div>
          <ul className="kv">
            {RULE_LABELS.map(([k, label, kind]) => (
              <li key={k}><span>{label}</span><strong>{fmtRule(kind, f.rules[k])}</strong></li>
            ))}
            <li><span>Account</span><strong>{f.frozen ? "Frozen" : "Active"}</strong></li>
            <li><span>Family-locked savings</span><strong>{money(f.lockedSavings)}</strong></li>
          </ul>
          <button className="btn danger block" style={{ marginTop: 16 }} disabled={f.frozen} onClick={freeze}>Freeze transfers (one person is enough)</button>
        </div>

        <div className="card">
          <div className="card-head"><h2>Propose a change</h2></div>
          <div className="grid2" style={{ gap: 12 }}>
            {RULE_LABELS.map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`r-${k}`} className="small">{label}</label>
                <input id={`r-${k}`} inputMode="numeric" placeholder={String(f.rules[k])} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          {f.frozen && (
            <label className="check"><input type="checkbox" checked={unfreeze} onChange={(e) => setUnfreeze(e.target.checked)} /> <span>Unfreeze the account</span></label>
          )}
          <button className="btn block" style={{ marginTop: 16 }} disabled={!Object.keys(ruleChanges).length && !unfreeze}
            onClick={() => propose("change_rules", { rules: ruleChanges, unfreeze })}>Send proposal</button>

          <hr className="divider" />
          <label htmlFor="unlock">Unlock savings (VND)</label>
          <div className="row">
            <input id="unlock" className="grow" inputMode="numeric" value={unlock} onChange={(e) => setUnlock(e.target.value)} placeholder="20000000" />
            <button className="btn secondary" disabled={!unlock} onClick={() => propose("unlock_savings", { amount: Number(unlock.replace(/[^\d]/g, "")) })}>Propose</button>
          </div>

          <div className="label" style={{ marginTop: 16 }}>Guardians</div>
          <div className="row" style={{ gap: 8 }}>
            {f.guardians.map((g) => (
              <button key={g.sub} className="btn secondary small" onClick={() => confirm(`Propose removing ${g.username}?`) && propose("remove_guardian", { sub: g.sub, username: g.username })}>
                Remove {g.username}
              </button>
            ))}
            {f.sealed && <button className="btn secondary small" onClick={() => propose("add_guardian", {})}>Invite another guardian</button>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Proposals</h2><span className="meta">{open} open</span></div>
        <ul className="list">
          {data.proposals.map((p) => {
            const need = needFor(p, f);
            const yes = p.receipts.filter((r) => r.decision === "approve").length;
            const mine = p.receipts.find((r) => r.sub === me);
            const canVote = isGuardian && p.status === "open" && !mine && !(p.type === "remove_guardian" && p.payload.sub === me);
            return (
              <li key={p.id}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <span className="grow strong">{describe(p, f)}</span>
                  <span className={`chip ${p.status === "applied" ? "green" : p.status === "rejected" ? "red" : "yellow"}`}>
                    {p.status === "applied" ? "Applied" : p.status === "rejected" ? "Rejected" : `Voting ${yes} of ${need}`}
                  </span>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  Proposed by {p.proposedBy} · {when(p.createdAt)}
                  {p.receipts.length > 0 && " · " + p.receipts.map((r) => `${r.username} ${r.decision === "approve" ? "approved" : "rejected"}`).join(", ")}
                </div>
                {p.status === "open" && (
                  <div className="quorum-bar" aria-hidden="true">
                    {Array.from({ length: need }, (_, i) => <span key={i} className={i < yes ? "on" : ""} />)}
                  </div>
                )}
                {canVote && (
                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <button className="btn danger small" onClick={() => vote(p, "reject")}>Reject</button>
                    <button className="btn small" onClick={() => vote(p, "approve")}>Approve</button>
                  </div>
                )}
              </li>
            );
          })}
          {data.proposals.length === 0 && <li className="empty">No proposals yet.</li>}
        </ul>
        {!isGuardian && <p className="hint" style={{ marginTop: 14 }}>You can propose, but only guardians vote. If a caller tells you to “raise your limit” or “remove your children”, they still have to convince the whole family.</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Family log</h2><span className="meta">{f.audit.length} entries</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {f.audit.map((a, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.who}</td>
                  <td>{a.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
