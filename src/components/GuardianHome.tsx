"use client";

import { useState } from "react";
import { fillR } from "@/lib/client/api";
import { ErrorBlock, Quorum, StatusChip, TierChip, money, when, type FamilyView, type TransferView } from "./family";

type Api = ReturnType<typeof import("@/lib/client/api").useApi>;

export function GuardianHome({ data, api, refresh, me }: { data: FamilyView; api: Api; refresh: () => void; me: string }) {
  const f = data.family!;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const waiting = data.transfers.filter((t) => (t.status === "pending" || t.status === "cooling") && t.assessment.requiredApprovals > 0);
  const needsMe = waiting.filter((t) => !t.receipts.some((r) => r.sub === me)).length;
  const openProps = data.proposals.filter((p) => p.status === "open");

  async function vote(t: TransferView, decision: "approve" | "reject") {
    setErr("");
    setBusy(t.id);
    try {
      // The digest rides in the URL, so this device's DPoP proof signs "approve transfer <id> with
      // exactly these fields". The server keeps that proof as the receipt.
      await api.call(`/api/tx/${t.id}/${decision}/${t.digest}`, {});
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function freeze() {
    if (!confirm(`Freeze ${f.elder.username}'s transfers now? Unfreezing needs the guardian quorum.`)) return;
    await api.call("/api/family", { action: "freeze" }).catch((e) => setErr(e.message));
    refresh();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p className="lede">
            {needsMe ? `${needsMe} ${needsMe === 1 ? "transfer needs" : "transfers need"} your decision. ` : "Nothing needs you right now. "}
            You protect {f.elder.username}{f.sealed ? "; the guardian list is sealed." : `; the list is not sealed yet (invite code ${f.inviteCode}).`}
          </p>
        </div>
        <button className="btn danger" onClick={freeze} disabled={f.frozen}>Freeze transfers</button>
      </div>

      {f.frozen && <div className="notice frozen"><span>{f.elder.username}'s transfers are frozen. To unfreeze, propose it on the Family rules page.</span></div>}
      {openProps.length > 0 && (
        <div className="notice info">
          <span>{openProps.length} rule {openProps.length === 1 ? "change is" : "changes are"} waiting for your vote.</span>
          <a className="btn secondary small" href="/governance">Review</a>
        </div>
      )}
      {err && <ErrorBlock message={err} />}

      {waiting.length === 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>Waiting for a decision</h2><span className="meta">0</span></div>
          <p className="empty">No transfer is waiting. A risky one shows here within seconds of {f.elder.username} pressing Send.</p>
        </div>
      )}

      {waiting.map((t) => {
        const mine = t.receipts.find((r) => r.sub === me);
        const a = t.assessment;
        return (
          <div key={t.id} className="card" style={{ marginBottom: 16 }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="money num" style={{ fontSize: 28 }}>{money(t.amount)}</div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  {when(t.createdAt)} · to <span className="mono">{t.recipientPid}</span>, a pseudonym. Only {f.elder.username} can see the real name.
                </div>
              </div>
              <span className="chips"><TierChip tier={a.tier} /><StatusChip t={t} /></span>
            </div>

            <div className={`verdict ${a.tier}`} style={{ marginTop: 14 }}>
              <p className="strong">{fillR(a.summary)}</p>
              {t.ai?.text && <p><em>{fillR(t.ai.text)}</em></p>}
              <ul className="signals">
                {a.signals.map((s) => (
                  <li key={s.code}>
                    <span className={`pts${s.points < 0 ? " neg" : ""}`}>{s.points > 0 ? "+" : ""}{s.points}</span>
                    <span>{fillR(s.text)}</span>
                  </li>
                ))}
              </ul>
              {a.series && <p className="small" style={{ marginTop: 10 }}>Series: {a.series.count} transfers to this recipient, {money(a.series.total)} in total.</p>}
            </div>

            <Quorum t={t} guardians={f.guardians} me={me} />

            <div className="inset" style={{ marginTop: 16 }}>
              <strong>Before you approve,</strong> call {f.elder.username} on the number you already have saved. Ask: “Who told you to send this? Is anyone on the phone with you?”
            </div>

            {mine ? (
              <p className="strong" style={{ marginTop: 14 }}>You {mine.decision === "approve" ? "approved" : "blocked"} this at {when(mine.at)}.</p>
            ) : (
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn danger big grow" disabled={busy === t.id} onClick={() => vote(t, "reject")}>Block transfer</button>
                <button className="btn big grow" disabled={busy === t.id} onClick={() => vote(t, "approve")}>I called and confirmed: approve</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <div className="card-head"><h2>History</h2><span className="meta">Last {Math.min(15, data.transfers.length)}</span></div>
        {data.transfers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>When</th><th>Recipient</th><th>Risk</th><th>Status</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {data.transfers.slice(0, 15).map((t) => (
                  <tr key={t.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(t.createdAt)}</td>
                    <td><span className="mono">{t.recipientPid}</span></td>
                    <td><TierChip tier={t.assessment.tier} /></td>
                    <td><StatusChip t={t} /></td>
                    <td className="right amount num">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No transfers yet.</p>}
        <p className="hint" style={{ marginTop: 14 }}>You see behaviour (amount, time, risk signals), never who the money goes to. Your parent's privacy stays theirs.</p>
      </div>
    </div>
  );
}
