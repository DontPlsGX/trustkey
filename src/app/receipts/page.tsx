"use client";

// Receipt verifier. Runs entirely in the browser against the realm's public key, so it does not
// trust this app's server: a server that invented an approval, or edited the amount after the
// vote, fails here. Tokens are checked for signature only (they expire in minutes; a receipt is
// evidence of a past signature, not a live session).
import { useState } from "react";
import { compactVerify, importJWK, EmbeddedJWK, calculateJwkThumbprint, decodeJwt, decodeProtectedHeader, type JWK } from "jose";
import tcConfig from "@tide-adapter";
import { ErrorBlock, Loading, Shell, useFamily, money, when, type ReceiptView } from "@/components/family";
import { SIMULATE } from "@/lib/simulate";

export default function ReceiptsPage() {
  return (
    <Shell>
      <Receipts />
    </Shell>
  );
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256b64url = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Same canonical form as the server's digestOf(): sorted [key, value] pairs, JSON, sha256, base64url. */
const digestOf = (fields: Record<string, unknown>) =>
  sha256b64url(JSON.stringify(Object.keys(fields).sort().map((k) => [k, fields[k]])));

const PROPOSAL_NAMES: Record<string, string> = {
  change_rules: "change rules",
  remove_guardian: "remove a guardian",
  unlock_savings: "unlock savings",
  add_guardian: "invite another guardian",
};

interface Check { label: string; ok: boolean; detail?: string }

const REALM_LABEL = SIMULATE ? "Token signed by the realm key (simulated Tide network)" : "Token signed by the Tide network (realm key)";

/** The realm's public keys. Simulation mode adds the stand-in realm key (see src/lib/simulate.ts). */
async function realmKeys(): Promise<JWK[]> {
  const keys = (tcConfig as { jwk?: { keys: JWK[] } }).jwk?.keys ?? [];
  if (!SIMULATE) return keys;
  const sim = await fetch("/api/sim/jwks").then((r) => r.json());
  return [...keys, ...(sim.keys ?? [])];
}

async function verifyReceipt(r: ReceiptView, expectedDigest: string, pathPrefix: string, keys: JWK[]): Promise<Check[]> {
  const out: Check[] = [];
  const tokenClaims = decodeJwt(r.token) as Record<string, any>;

  // 1. The access token was signed by the Tide network for this realm (no single party holds that key).
  try {
    const { kid } = decodeProtectedHeader(r.token);
    const jwk = keys.find((k) => !kid || k.kid === kid) ?? keys[0];
    await compactVerify(r.token, await importJWK(jwk, jwk.alg ?? "EdDSA"));
    out.push({ label: REALM_LABEL, ok: true, detail: `kid ${String(jwk.kid ?? "").slice(0, 10)}…` });
  } catch (e) {
    out.push({ label: REALM_LABEL, ok: false, detail: String(e) });
  }
  out.push({ label: `Token belongs to ${r.username}`, ok: tokenClaims.sub === r.sub, detail: `sub ${String(tokenClaims.sub).slice(0, 8)}…` });

  // 2. The DPoP proof was signed by the key held in that guardian's browser, and is bound to the token.
  let proofClaims: Record<string, any> = {};
  try {
    const { payload, protectedHeader } = await compactVerify(r.proof, EmbeddedJWK);
    proofClaims = JSON.parse(new TextDecoder().decode(payload));
    out.push({ label: "DPoP proof signed by the key on the guardian's device", ok: true });
    const jkt = await calculateJwkThumbprint(protectedHeader.jwk as JWK);
    out.push({ label: "Device key matches cnf.jkt in the token", ok: jkt === tokenClaims.cnf?.jkt });
  } catch (e) {
    out.push({ label: "DPoP proof signed by the key on the guardian's device", ok: false, detail: String(e) });
  }
  out.push({ label: "Proof is bound to this exact token (ath)", ok: proofClaims.ath === (await sha256b64url(r.token)) });

  // 3. What was signed: POST <prefix>/<decision>/<digest>, and that digest matches the fields we see now.
  const htu = String(proofClaims.htu ?? "");
  const expectedTail = `${pathPrefix}/${r.decision}/${expectedDigest}`;
  out.push({ label: `Signed the action “${r.decision === "approve" ? "approve" : "block"}”`, ok: proofClaims.htm === "POST" && htu.endsWith(`/${r.decision}/${r.digest}`), detail: htu.replace(/^https?:\/\/[^/]+/, "") });
  out.push({ label: "Current contents match what was signed (digest)", ok: htu.endsWith(expectedTail) });
  return out;
}

function Receipts() {
  const { data, error, refresh, api } = useFamily(10_000);
  const [results, setResults] = useState<Record<string, Check[]>>({});
  const [tamper, setTamper] = useState(false);

  if (!api.authenticated) return <p className="empty">Please sign in.</p>;
  if (!data) return error ? <ErrorBlock message={error} onRetry={refresh} /> : <Loading />;
  if (!data.family) return <div className="card"><p className="empty">You are not in a family yet. <a href="/">Set one up</a></p></div>;

  const items = [
    ...data.transfers.filter((t) => t.receipts.length).map((t) => ({
      key: t.id,
      title: `Transfer of ${money(t.amount)} to ${t.recipientPid}`,
      at: t.createdAt,
      receipts: t.receipts,
      prefix: `/api/tx/${t.id}`,
      // The "tampered" toggle simulates a breached server that bumps the amount after the vote.
      fields: { id: t.id, familyId: (t as any).familyId, amount: tamper ? t.amount * 10 : t.amount, recipientPid: t.recipientPid, createdAt: t.createdAt },
    })),
    ...data.proposals.filter((p) => p.receipts.length).map((p) => ({
      key: p.id,
      title: `Rule proposal: ${PROPOSAL_NAMES[p.type] ?? p.type}`,
      at: p.createdAt,
      receipts: p.receipts,
      prefix: `/api/proposals/${p.id}`,
      fields: { id: p.id, familyId: (p as any).familyId, type: p.type, payload: JSON.stringify(tamper && p.payload.amount ? { ...p.payload, amount: p.payload.amount * 10 } : p.payload), createdAt: p.createdAt },
    })),
  ].sort((a, b) => b.at - a.at);

  async function verifyAll() {
    const next: Record<string, Check[]> = {};
    const keys = await realmKeys();
    for (const it of items) {
      const digest = await digestOf(it.fields);
      for (const r of it.receipts) next[`${it.key}:${r.sub}`] = await verifyReceipt(r, digest, it.prefix, keys);
    }
    setResults(next);
  }

  const checked = Object.keys(results).length;
  const failed = Object.values(results).filter((r) => !r.every((c) => c.ok)).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Approval receipts</h1>
          <p className="lede">
            Each time a guardian approves, their device signs a DPoP proof tied to that exact transfer and a hash of its contents,
            next to a token the Tide network signs together. The TrustKey server only <em>stores</em> these signatures; it cannot <em>make</em> them.
            This page re-checks every one in your browser.
          </p>
        </div>
        <button className="btn" onClick={verifyAll} disabled={!items.length}>Verify all</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={tamper} onChange={(e) => { setTamper(e.target.checked); setResults({}); }} />
          <span>Simulate a hacked server: multiply the amount by 10 after the vote</span>
        </label>
        {checked > 0 && (
          <p className="small" style={{ marginTop: 10 }}>
            {failed ? <span className="bad-mark">{failed} of {checked} receipts failed.</span> : <span className="ok-mark">All {checked} receipts are valid.</span>}
            {tamper && " The edited amount no longer matches what the guardians signed."}
          </p>
        )}
      </div>

      {items.length === 0 && <div className="card"><p className="empty">No receipts yet. They appear after a guardian approves or blocks something.</p></div>}
      {items.map((it) => (
        <div key={it.key} className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>{it.title}</h2><span className="meta">{when(it.at)}</span></div>
          <div className="stack">
            {it.receipts.map((r) => {
              const res = results[`${it.key}:${r.sub}`];
              const allOk = res?.every((c) => c.ok);
              return (
                <div key={r.sub} className="inset">
                  <div className="row">
                    <span className="grow"><strong>{r.username}</strong> {r.decision === "approve" ? "approved" : "blocked"} <span className="muted">· {when(r.at)}</span></span>
                    {res && <span className={`chip ${allOk ? "green" : "red"}`}>{allOk ? "Valid" : "Not valid"}</span>}
                  </div>
                  {res && (
                    <ul className="list small" style={{ marginTop: 8 }}>
                      {res.map((c) => (
                        <li key={c.label}>
                          <span className={c.ok ? "ok-mark" : "bad-mark"}>{c.ok ? "Pass" : "Fail"}</span> {c.label}
                          {c.detail && <div className="mono muted tiny">{c.detail}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <details style={{ marginTop: 6 }}>
                    <summary>Show raw data</summary>
                    <pre className="code">{`token: ${r.token}

dpop: ${r.proof}`}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
