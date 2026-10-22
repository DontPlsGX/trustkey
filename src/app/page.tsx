"use client";

import { useState } from "react";
import { ErrorBlock, Loading, Shell, tintFor, useFamily } from "@/components/family";
import { ElderHome } from "@/components/ElderHome";
import { GuardianHome } from "@/components/GuardianHome";
import { ProfileOnboarding } from "@/components/ProfileOnboarding";

export default function HomePage() {
  return (
    <Shell>
      <ProfileOnboarding />
      <Home />
    </Shell>
  );
}

function Home() {
  const { data, error, refresh, setData, api } = useFamily();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  if (!api.authenticated) return <Landing onLogin={api.login} />;
  if (!data) return error ? <ErrorBlock message={error} onRetry={refresh} /> : <Loading label="Loading your family" />;

  if (!data.family) {
    const act = async (body: object) => {
      setErr("");
      try {
        setData(await api.call("/api/family", body));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    };
    return (
      <div className="narrow">
        <div className="page-head">
          <div>
            <h1>Set up your family</h1>
            <p className="lede">One person is protected. Two to five relatives become their guardians.</p>
          </div>
        </div>
        {err && <ErrorBlock message={err} />}
        <div className="grid2">
          <div className="card">
            <h2>I want to be protected</h2>
            <p className="muted" style={{ marginTop: 6 }}>For a parent or grandparent. You get an invite code to share with your children.</p>
            <button className="btn big block" style={{ marginTop: 8 }} onClick={() => act({ action: "create" })}>Create a family</button>
          </div>
          <div className="card">
            <h2>I am a guardian</h2>
            <p className="muted" style={{ marginTop: 6 }}>Enter the 6-character code your parent or grandparent sent you.</p>
            <label htmlFor="invite" className="sr-only">Invite code</label>
            <input id="invite" className="code-input" value={code} maxLength={6} autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="7F3A9C" />
            <button className="btn big block" style={{ marginTop: 12 }} disabled={code.length < 6} onClick={() => act({ action: "join", code })}>Join family</button>
          </div>
        </div>
      </div>
    );
  }

  const me = String(api.getValueFromIdToken("sub") ?? "");
  return data.role === "elder"
    ? <ElderHome data={data} api={api} refresh={refresh} />
    : <GuardianHome data={data} api={api} refresh={refresh} me={me} />;
}

function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div>
      <section className="hero">
        <h1>Send money as usual. The big ones, the family approves together.</h1>
        <p className="lede">
          Cùng Duyệt keeps everyday payments instant for older parents. An AI watches for scam patterns, and a risky transfer waits
          until enough of the family says yes. No one can release it alone: not a scammer on the phone, not an admin, not the AI.
        </p>
        <button className="btn big" style={{ minWidth: 240 }} onClick={onLogin}>Sign in with Tide</button>
      </section>

      <div className="points">
        <div>
          <h3>Everyday payments go straight through</h3>
          <p>Groceries, bills, people you have paid before: sent at once, nobody asked.</p>
        </div>
        <div>
          <h3>Risky ones wait for the family</h3>
          <p>On a call, a new payee, a “holding account”, many small transfers: guardians must approve first.</p>
        </div>
        <div>
          <h3>The AI sees behaviour, never identity</h3>
          <p>Names, account numbers and notes are encrypted with Tide on the device. A breached server leaks nothing.</p>
        </div>
      </div>

      <div className="card preview" aria-label="Example transfer waiting for approval">
        <div className="row">
          <div className="grow">
            <div className="small muted">Example · 45,000,000 ₫ to a new recipient</div>
            <div className="strong" style={{ marginTop: 2 }}>Someone on the phone is directing a transfer to an unfamiliar account.</div>
          </div>
          <span className="chip red">High risk</span>
        </div>
        <div className="quorum">
          <div className="quorum-faces">
            <span className="face approve"><span className="avatar" style={tintFor(0)}>CM</span><span>Con Minh</span><span className="state">Approved</span></span>
            <span className="face wait"><span className="avatar" style={tintFor(1)}>CH</span><span>Chị Hà</span><span className="state">Waiting</span></span>
          </div>
          <div className="quorum-bar"><span className="on" /><span /></div>
          <div className="quorum-label"><strong>Waiting on 1 guardian</strong> · 1 of 2 approved</div>
        </div>
      </div>
    </div>
  );
}
