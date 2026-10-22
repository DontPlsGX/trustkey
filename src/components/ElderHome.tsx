"use client";

import { useEffect, useMemo, useState } from "react";
import { noteFlags } from "@/lib/risk/engine";
import { accountKey, fillR, sha256Hex, type Contacts, type Details } from "@/lib/client/api";
import { Avatar, Quorum, StatusChip, TierChip, clock, money, when, type FamilyView, type Person, type TransferView } from "./family";

type Api = ReturnType<typeof import("@/lib/client/api").useApi>;

const BANKS = ["VCB", "BIDV", "VTB", "AGR", "TCB", "MB", "ACB", "VPB", "TPB", "STB"];

// Synthetic demo scenarios, modelled on the patterns Vietnam's Ministry of Public Security warns about.
// All names and accounts are made up; three accounts are on the mock SIMO blacklist. Notes stay in
// Vietnamese because that is what a real scammer dictates, and what the keyword check reads.
const SCENARIOS: { label: string; d: Details; amount: number; onCall: boolean }[] = [
  { label: "Pay the vegetable seller", d: { name: "Cô Lan bán rau", bank: "VCB", account: "0123456789", note: "tien rau thang 10" }, amount: 350_000, onCall: false },
  { label: "“Police” on the phone", d: { name: "TK tạm giữ - Cục Cảnh sát", bank: "TCB", account: "19035550123", note: "Chuyen vao tai khoan tam giu de phuc vu dieu tra" }, amount: 45_000_000, onCall: true },
  { label: "Holiday contract deposit", d: { name: "Cty Nghỉ dưỡng Sao Biển", bank: "ACB", account: "88886666", note: "Dat coc hop dong ky nghi gia dinh 5 sao" }, amount: 28_000_000, onCall: false },
  { label: "Task scam, split small", d: { name: "Nguyễn Thị H (CTV)", bank: "VPB", account: "123456789", note: "hoa hong nhiem vu so 3" }, amount: 2_900_000, onCall: false },
  { label: "Unknown shop (blacklisted)", d: { name: "Shop Online Giá Rẻ", bank: "VCB", account: "0011002233445", note: "mua hang" }, amount: 500_000, onCall: false },
];

const EMPTY: Details = { name: "", bank: "VCB", account: "", note: "" };
const digits = (s: string) => s.replace(/[^\d]/g, "");

export function ElderHome({ data, api, refresh }: { data: FamilyView; api: Api; refresh: () => void }) {
  const f = data.family!;
  const [contacts, setContacts] = useState<Contacts>({});
  const [names, setNames] = useState<Record<string, string>>({}); // transfer id -> decrypted name
  const [d, setD] = useState<Details>(EMPTY);
  const [amount, setAmount] = useState("");
  const [onCall, setOnCall] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<TransferView | null>(null);
  const [resultName, setResultName] = useState("");

  // Decrypt the address book once per ciphertext change. Only this browser, signed in as the elder,
  // can open it: the server and the guardians hold ciphertext.
  useEffect(() => {
    if (!f.contactsCiphertext) return;
    api.open<Contacts>(f.contactsCiphertext).then(setContacts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.contactsCiphertext]);

  // Decrypt recipient names of recent transfers in one Tide round trip.
  useEffect(() => {
    const todo = data.transfers.slice(0, 12).filter((t) => t.ciphertext && !names[t.id]);
    if (!todo.length) return;
    api.openMany<Details>(todo.map((t) => t.ciphertext!)).then((out) => {
      setNames((n) => {
        const m = { ...n };
        todo.forEach((t, i) => (m[t.id] = out[i]?.name ?? "(could not decrypt)"));
        return m;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transfers]);

  const book = useMemo(() => Object.entries(contacts), [contacts]);
  const live = result ? data.transfers.find((t) => t.id === result.id) ?? result : null;
  const waiting = data.transfers.filter((t) => t.status === "pending" || t.status === "cooling").length;

  async function send() {
    setErr("");
    setResult(null);
    const amt = Math.round(Number(digits(amount)));
    if (!d.name || !d.account || !amt) return setErr("Enter the recipient's name, account number and amount.");
    try {
      setBusy("Encrypting the recipient's details on this device…");
      const key = accountKey(d.bank, d.account);
      const ciphertext = await api.seal(d); // name, bank, account, note: sealed before leaving the device
      const accountHash = await sha256Hex(key);
      setBusy("Checking the transfer for scam patterns…");
      const { transfer } = await api.call<{ transfer: TransferView }>("/api/transfers", {
        amount: amt,
        recipientPid: contacts[key]?.pid ?? null,
        accountHash,
        onCall,
        noteFlags: noteFlags(d.note), // categories only; the note text stays encrypted
        ciphertext,
      });
      if (!contacts[key]) {
        const next = { ...contacts, [key]: { pid: transfer.recipientPid, name: d.name, bank: d.bank, account: d.account } };
        setContacts(next);
        await api.call("/api/family", { action: "contacts", ciphertext: await api.seal(next) });
      }
      setResult(transfer);
      setResultName(d.name);
      setNames((n) => ({ ...n, [transfer.id]: d.name }));
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function freeze() {
    if (!confirm("Freeze all transfers now? Unfreezing needs your guardians to agree.")) return;
    await api.call("/api/family", { action: "freeze" }).catch((e) => setErr(e.message));
    refresh();
  }

  async function seal() {
    try {
      await api.call("/api/family", { action: "seal" });
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Send money</h1>
          <p className="lede">
            {f.frozen ? "Your account is frozen. No transfer can leave until your guardians unfreeze it."
              : waiting ? `${waiting} ${waiting === 1 ? "transfer is" : "transfers are"} waiting on your guardians.`
              : "Everyday payments go straight through. Risky ones wait for your family."}
          </p>
        </div>
      </div>

      {!f.sealed && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2>Invite your guardians</h2>
            <span className="meta">{f.guardians.length} of 5 joined</span>
          </div>
          <p className="muted">Send this code to two to five relatives. They sign in to TrustKey with their own Tide account and enter it.</p>
          <div className="invite">
            <span className="invite-code">{f.inviteCode}</span>
            <span className="small muted grow">Joined: {f.guardians.map((g) => g.username).join(", ") || "nobody yet"}</span>
          </div>
          <ol className="steps">
            <li className="done">Create the family</li>
            <li className={f.guardians.length >= 2 ? "done" : ""}>At least 2 guardians join</li>
            <li>Seal the list</li>
          </ol>
          <button className="btn" style={{ marginTop: 12 }} disabled={f.guardians.length < 2} onClick={seal}>Seal the guardian list</button>
          <p className="hint">Once sealed, nobody can add or remove a guardian alone: not you, not a caller, not an admin. It takes the family quorum.</p>
        </div>
      )}

      {f.frozen && <div className="notice frozen"><span>All transfers are stopped. Unfreezing needs {f.rules.quorum} guardians to agree on the Family rules page.</span></div>}

      <div className="kpis" style={{ ["--cols" as string]: 4 }}>
        <div className="kpi"><div className="kpi-label">Balance</div><div className="kpi-value">{money(f.balance)}</div><div className="kpi-note">Simulated bank</div></div>
        <div className="kpi"><div className="kpi-label">Family-locked savings</div><div className="kpi-value">{money(f.lockedSavings)}</div><div className="kpi-note">Opens only with the quorum</div></div>
        <div className="kpi"><div className="kpi-label">Per-transfer limit</div><div className="kpi-value">{money(f.rules.perTx)}</div><div className="kpi-note">Above this, a guardian confirms</div></div>
        <div className="kpi"><div className="kpi-label">Guardians</div><div className="kpi-value">{f.guardians.length}</div><div className="kpi-note">{quorumText(f.rules.quorum, f.guardians.length)}</div></div>
      </div>

      <div className="layout">
        <div>
          <div className="card">
            <div className="card-head"><h2>New transfer</h2></div>

            <div className="label">Try a demo scenario <span className="muted">(synthetic data)</span></div>
            <div className="scen">
              {SCENARIOS.map((s) => (
                <button key={s.label} type="button" onClick={() => { setD(s.d); setAmount(String(s.amount)); setOnCall(s.onCall); setResult(null); setErr(""); }}>
                  {s.label}
                </button>
              ))}
            </div>

            <hr className="divider" />

            {book.length > 0 && (
              <div className="field">
                <label htmlFor="book">Someone you have paid before</label>
                <select id="book" value="" onChange={(e) => { const c = contacts[e.target.value]; if (c) setD({ ...d, name: c.name, bank: c.bank, account: c.account }); }}>
                  <option value="">Choose a saved recipient</option>
                  {book.map(([k, c]) => <option key={k} value={k}>{c.name} · {c.bank} {c.account}</option>)}
                </select>
                <div className="hint">Your address book is encrypted. Only you can open it.</div>
              </div>
            )}

            <div className="field">
              <label htmlFor="name">Recipient's name</label>
              <input id="name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Cô Lan bán rau" />
            </div>
            <div className="field row" style={{ gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: "0 0 120px" }}>
                <label htmlFor="bank">Bank</label>
                <select id="bank" value={d.bank} onChange={(e) => setD({ ...d, bank: e.target.value })}>
                  {BANKS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="grow">
                <label htmlFor="acct">Account number</label>
                <input id="acct" inputMode="numeric" value={d.account} onChange={(e) => setD({ ...d, account: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="amt">Amount (VND)</label>
              <input id="amt" className="amount-input" inputMode="numeric"
                value={amount ? Number(digits(amount) || 0).toLocaleString("en-US") : ""}
                onChange={(e) => setAmount(e.target.value)} placeholder="350,000" />
            </div>
            <div className="field">
              <label htmlFor="note">Transfer note</label>
              <input id="note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} />
              <span>I am on a phone call right now <span className="muted">(simulates the phone's call signal)</span></span>
            </label>

            {err && <div className="inline-err" role="alert">{err}</div>}
            {busy && <div className="notice info" style={{ margin: "12px 0 0" }} aria-live="polite"><span>{busy}</span></div>}
            <button className="btn big block" style={{ marginTop: 16 }} disabled={!!busy || f.frozen} onClick={send}>Send transfer</button>
            <p className="hint">
              The name, account number and note are encrypted on this device with Tide before anything is sent.
              The server, the AI and even your family see only the amount, a pseudonym for the recipient and the risk signals.
            </p>
          </div>

          {live && <ResultCard t={live} name={resultName} guardians={f.guardians} />}
        </div>

        <div>
          <div className="card">
            <div className="card-head"><h2>Your guardians</h2><span className="meta">{f.sealed ? "List sealed" : "Not sealed yet"}</span></div>
            {f.guardians.length ? (
              <ul className="list">
                {f.guardians.map((g, i) => (
                  <li key={g.sub} className="row" style={{ gap: 10 }}>
                    <span className="face" style={{ border: 0, padding: 0 }}><Avatar name={g.username} index={i} /></span>
                    <span className="grow">{g.username}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="empty">No guardians yet. Share the invite code above.</p>}
            <button className="btn danger block" style={{ marginTop: 16 }} disabled={f.frozen} onClick={freeze}>I think I am being scammed: freeze now</button>
            <p className="hint">One tap, no approval needed. Unfreezing needs the family.</p>
          </div>

          <div className="card">
            <div className="card-head"><h2>Recent transfers</h2></div>
            <ul className="list">
              {data.transfers.slice(0, 12).map((t) => (
                <li key={t.id}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="grow strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[t.id] ?? "Decrypting…"}</span>
                    <span className="money num">{money(t.amount)}</span>
                  </div>
                  <div className="row tiny" style={{ marginTop: 6, gap: 6 }}>
                    <StatusChip t={t} />
                    {t.assessment.tier !== "green" && <TierChip tier={t.assessment.tier} />}
                    <span className="muted">{when(t.createdAt)}</span>
                  </div>
                  {(t.status === "pending" || t.status === "cooling") && <Quorum t={t} guardians={f.guardians} />}
                </li>
              ))}
              {data.transfers.length === 0 && <li className="empty">No transfers yet. Your first one will show here.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function quorumText(quorum: number, guardians: number) {
  const q = Math.max(1, Math.min(quorum, guardians));
  return guardians ? `${q} must approve a high-risk transfer` : "Invite at least 2";
}

function ResultCard({ t, name, guardians }: { t: TransferView; name: string; guardians: Person[] }) {
  const a = t.assessment;
  const head =
    t.status === "executed" ? "Sent" :
    t.status === "rejected" ? "A guardian blocked this transfer" :
    t.status === "blocked" ? "Not enough balance" :
    a.tier === "red" ? "Stop. This looks like a scam." : "A guardian needs to confirm this";
  const tone = t.status === "executed" ? "green" : t.status === "rejected" || t.status === "blocked" ? "red" : a.tier;
  return (
    <div className={`verdict ${tone}`} aria-live="polite">
      <div className="row">
        <h2 className="grow">{head}</h2>
        <TierChip tier={a.tier} />
      </div>
      <p style={{ marginTop: 8 }}>
        <span className="money num">{money(t.amount)}</span> to {name} <span className="small muted">· risk score {a.score}</span>
      </p>
      {a.tier !== "green" && <p>{fillR(a.summary, name)}</p>}
      {t.ai?.text && <p><em>{fillR(t.ai.text, name)}</em> <span className="small muted">({t.ai.model}, saw only anonymous features)</span></p>}
      {a.signals.length > 0 && (
        <ul className="signals">
          {a.signals.map((s) => (
            <li key={s.code}>
              <span className={`pts${s.points < 0 ? " neg" : ""}`}>{s.points > 0 ? "+" : ""}{s.points}</span>
              <span>{fillR(s.text, name)}</span>
            </li>
          ))}
        </ul>
      )}
      {a.series && <p className="small" style={{ marginTop: 10 }}>Series to this recipient: {a.series.count} transfers, {money(a.series.total)} in total.</p>}
      {a.requiredApprovals > 0 && t.status !== "rejected" && t.status !== "executed" && (
        <>
          <p style={{ marginTop: 12 }}>
            Sent to your family. It needs <strong>{a.requiredApprovals}</strong> {a.requiredApprovals === 1 ? "approval" : "approvals"}
            {t.executeAfter ? <> and a cool-off wait (no earlier than <strong>{clock(t.executeAfter)}</strong>)</> : null}. You do not need to do anything else.
          </p>
          <Quorum t={t} guardians={guardians} />
          {a.tier === "red" && (
            <div className="callout">
              If someone on the phone told you to send this, hang up and call your children. Police and banks never ask you to move money over the phone.
            </div>
          )}
        </>
      )}
    </div>
  );
}
