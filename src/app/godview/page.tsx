"use client";

// Split screen for the demo: left is what the elder's own browser shows after Tide decryption,
// right is the raw record this server stores and the exact features the AI provider receives.
// If the server, its database, or the AI vendor is breached, the right column is the whole loot.
import { useEffect, useState } from "react";
import { ErrorBlock, Loading, Shell, useFamily, money, when, TierChip } from "@/components/family";
import type { Details } from "@/lib/client/api";

export default function GodViewPage() {
  return (
    <Shell>
      <GodView />
    </Shell>
  );
}

function GodView() {
  const { data, error, refresh, api } = useFamily(6000);
  const [raw, setRaw] = useState<any>(null);
  const [plain, setPlain] = useState<Record<string, Details | null>>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!api.authenticated || !api.token) return;
    api.call("/api/serverview").then(setRaw).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.authenticated, api.token, data?.transfers.length]);

  const recent = (data?.transfers ?? []).slice(0, 5);
  useEffect(() => {
    if (data?.role !== "elder") return;
    const todo = recent.filter((t) => t.ciphertext && !(t.id in plain));
    if (!todo.length) return;
    api.openMany<Details>(todo.map((t) => t.ciphertext!)).then((out) =>
      setPlain((p) => ({ ...p, ...Object.fromEntries(todo.map((t, i) => [t.id, out[i]])) }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.transfers.length, data?.role]);

  if (!api.authenticated) return <p className="empty">Please sign in.</p>;
  if (!data) return error ? <ErrorBlock message={error} onRetry={refresh} /> : <Loading />;
  if (!data.family) return <div className="card"><p className="empty">You are not in a family yet. <a href="/">Set one up</a></p></div>;
  const isElder = data.role === "elder";
  const elder = data.family.elder.username;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>What the server sees</h1>
          <p className="lede">
            Left: {isElder ? "your screen" : `${elder}'s screen`} after Tide decrypts on the device. Right: exactly what the TrustKey server stores,
            and exactly what the AI receives. An attacker who takes over the server only gets the right column.
          </p>
        </div>
      </div>
      {err && <ErrorBlock message={err} />}
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h2>{isElder ? "You see" : "Guardians see"}</h2><span className="meta">Decrypted on the device</span></div>
          <ul className="list">
            {recent.map((t) => {
              const d = plain[t.id];
              return (
                <li key={t.id}>
                  <div className="row"><strong className="grow money num">{money(t.amount)}</strong><TierChip tier={t.assessment.tier} /></div>
                  {isElder ? (
                    d ? (
                      <ul className="kv small" style={{ marginTop: 8 }}>
                        <li><span>Name</span><strong>{d.name}</strong></li>
                        <li><span>Bank</span><strong>{d.bank} · {d.account}</strong></li>
                        <li><span>Note</span><strong>“{d.note}”</strong></li>
                      </ul>
                    ) : <div className="skeleton" style={{ marginTop: 8 }} aria-label="Decrypting"><span style={{ height: 14, width: "60%" }} /></div>
                  ) : (
                    <p className="small muted" style={{ marginTop: 4 }}>Recipient <span className="mono">{t.recipientPid}</span>. Guardians cannot decrypt it; they only see behaviour.</p>
                  )}
                  <div className="tiny faint" style={{ marginTop: 6 }}>{when(t.createdAt)}</div>
                </li>
              );
            })}
            {recent.length === 0 && <li className="empty">No transfers yet.</li>}
          </ul>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>The server stores</h2><span className="meta">Raw records</span></div>
            <pre className="code">{raw ? JSON.stringify(raw.transfers?.map((t: any) => ({
              amount: t.amount, recipientPid: t.recipientPid, onCall: t.onCall, noteFlags: t.noteFlags,
              blacklistHit: t.blacklistHit, tier: t.assessment?.tier, score: t.assessment?.score, status: t.status,
              ciphertext: t.ciphertext, receipts: t.receipts?.map((r: any) => ({ username: r.username, decision: r.decision, token: r.token, proof: r.proof })),
            })).reverse(), null, 2) : "Loading…"}</pre>
          </div>
          <div className="card">
            <div className="card-head"><h2>The AI receives</h2><span className="meta">Latest transfer</span></div>
            <pre className="code">{raw ? JSON.stringify(raw.aiProviderSaw, null, 2) : "Loading…"}</pre>
            <p className="hint" style={{ marginTop: 12 }}>
              No names, account numbers or transfer notes. The AI only <em>explains</em>; it has no vote and cannot approve a transfer or lower its risk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
