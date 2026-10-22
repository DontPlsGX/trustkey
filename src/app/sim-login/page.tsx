"use client";

// Simulated Tide sign-in (simulation mode only, see src/lib/simulate.ts). Stands in for Tide's ORK
// login page: the browser makes a device key it cannot export, and gets back a token bound to it.
import { useEffect, useState } from "react";
import { Shell } from "@/components/family";
import { SIMULATE } from "@/lib/simulate";
import { useSimTide } from "@/lib/client/simTide";

// The simulated realm's users and the realm role an admin granted each (src/lib/auth/simTide.ts).
const PEOPLE = [
  ["Grandma Hoa", "The parent being protected", "trustkey-elder"],
  ["Minh", "Son", "trustkey-guardian"],
  ["Lan", "Daughter", "trustkey-guardian"],
  ["Tuấn", "Grandson", "trustkey-guardian"],
] as const;

export default function SimLoginPage() {
  if (!SIMULATE) return <Shell><p className="empty">Simulation mode is off. Use “Sign in with Tide”.</p></Shell>;
  return <Shell><SimLogin /></Shell>;
}

function SimLogin() {
  const { authenticated, signIn } = useSimTide();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"elder" | "guardian">("guardian");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const back = () => {
    const r = new URLSearchParams(location.search).get("return") || "/";
    location.assign(r.startsWith("/") && !r.startsWith("//") ? r : "/");
  };
  useEffect(() => {
    if (authenticated) back();
  }, [authenticated]);

  async function go(who: string, as?: "elder" | "guardian") {
    if (!who.trim()) return;
    setBusy(who);
    setErr("");
    try {
      await signIn(who.trim(), as);
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
          {PEOPLE.map(([who, rel, realmRole]) => (
            <button key={who} className="btn secondary big block" style={{ justifyContent: "space-between" }} disabled={!!busy} onClick={() => go(who)}>
              <span>{who} <span className="muted small">· {rel}</span></span>
              <span className="muted small">{busy === who ? "Signing in…" : <code>{realmRole}</code>}</span>
            </button>
          ))}
        </div>
        <label htmlFor="sim-name" className="hint" style={{ display: "block", marginTop: 20 }}>Or another name</label>
        <div className="row" style={{ marginTop: 6 }}>
          <input id="sim-name" className="grow" value={name} maxLength={40} placeholder="Display name"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(name, role)} />
          <label htmlFor="sim-role" className="sr-only">Realm role</label>
          <select id="sim-role" value={role} onChange={(e) => setRole(e.target.value as "elder" | "guardian")}>
            <option value="guardian">trustkey-guardian</option>
            <option value="elder">trustkey-elder</option>
          </select>
          <button className="btn" disabled={!!busy || !name.trim()} onClick={() => go(name, role)}>Sign in</button>
        </div>
        {err && <div className="inline-err" role="alert">{err}</div>}
      </div>
      <p className="hint" style={{ marginTop: 16 }}>
        Tide’s network is under heavy load, so per Tide’s guidance this build simulates it. Your browser still creates a device
        key it cannot export, and gets a token bound to that key (DPoP). The server checks every request exactly as it would
        with TideCloak, including the realm role in the token (<code>trustkey-elder</code> or <code>trustkey-guardian</code>),
        which a realm admin would grant through an IGA change request. Picking a role for a new name stands in for that grant.
        The one difference: a single local key stands in for the realm key the Tide network holds in pieces.
      </p>
    </div>
  );
}
