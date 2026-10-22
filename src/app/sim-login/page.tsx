"use client";

// Simulated Tide sign-in (simulation mode only, see src/lib/simulate.ts). Stands in for Tide's ORK
// login page: the browser makes a device key it cannot export, and gets back a token bound to it.
import { useEffect, useState } from "react";
import { Shell } from "@/components/family";
import { SIMULATE } from "@/lib/simulate";
import { useSimTide } from "@/lib/client/simTide";

const PEOPLE = [
  ["Grandma Hoa", "The parent being protected"],
  ["Minh", "Son, guardian"],
  ["Lan", "Daughter, guardian"],
] as const;

export default function SimLoginPage() {
  if (!SIMULATE) return <Shell><p className="empty">Simulation mode is off. Use “Sign in with Tide”.</p></Shell>;
  return <Shell><SimLogin /></Shell>;
}

function SimLogin() {
  const { authenticated, signIn } = useSimTide();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const back = () => {
    const r = new URLSearchParams(location.search).get("return") || "/";
    location.assign(r.startsWith("/") && !r.startsWith("//") ? r : "/");
  };
  useEffect(() => {
    if (authenticated) back();
  }, [authenticated]);

  async function go(who: string) {
    if (!who.trim()) return;
    setBusy(who);
    setErr("");
    try {
      await signIn(who.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Sign in</h1>
          <p className="lede">Simulated Tide sign-in. Each tab is its own person, so one browser can play the whole family.</p>
        </div>
      </div>
      <div className="card">
        <h2>Who are you?</h2>
        <div className="stack" style={{ marginTop: 12 }}>
          {PEOPLE.map(([who, role]) => (
            <button key={who} className="btn secondary big block" style={{ justifyContent: "space-between" }} disabled={!!busy} onClick={() => go(who)}>
              <span>{who}</span>
              <span className="muted small">{busy === who ? "Signing in…" : role}</span>
            </button>
          ))}
        </div>
        <label htmlFor="sim-name" className="hint" style={{ display: "block", marginTop: 20 }}>Or another name</label>
        <div className="row" style={{ marginTop: 6 }}>
          <input id="sim-name" className="grow" value={name} maxLength={40} placeholder="Display name"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(name)} />
          <button className="btn" disabled={!!busy || !name.trim()} onClick={() => go(name)}>Sign in</button>
        </div>
        {err && <div className="inline-err" role="alert">{err}</div>}
      </div>
      <p className="hint" style={{ marginTop: 16 }}>
        Tide’s network is under heavy load, so per Tide’s guidance this build simulates it. Your browser still creates a device
        key it cannot export, and gets a token bound to that key (DPoP). The server checks every request exactly as it would
        with TideCloak. The one difference: a single local key stands in for the realm key the Tide network holds in pieces.
      </p>
    </div>
  );
}
