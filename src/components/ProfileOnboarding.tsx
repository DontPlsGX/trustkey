"use client";

/**
 * Post-signup display name, adapted from the Tide pack's onboarding-modal.
 *
 * Tide asserts only a vuid, so without this the family would see each other as 64-hex strings.
 * The name is written through the ACCOUNT API with the user's OWN token (never the Admin API, which
 * would need admin credentials at runtime and, on this IGA realm, would only queue a change request).
 * It is stored as firstName, so it comes back in the token as given_name / name, which is what the
 * server shows to the rest of the family. Skippable, and it never invents a placeholder email.
 */

import { useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";

const DISMISS_KEY = "cungduyet.display-name.dismissed";

export function ProfileOnboarding({ onSaved }: { onSaved?: () => void }) {
  const { authenticated, getValueFromToken, getToken, getConfig, secureFetch, forceRefreshToken } = useTideCloak();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {}
    // getValueFromToken, not tokenParsed: the latter is not on the context and is silently undefined.
    if (!getValueFromToken("given_name") && !getValueFromToken("name")) setOpen(true);
  }, [authenticated, getValueFromToken]);

  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setOpen(false);
  };

  async function save() {
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const cfg = getConfig();
      const url = `${String(cfg["auth-server-url"]).replace(/\/$/, "")}/realms/${cfg.realm}/account/`;
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      // DPoP-bound token: try secureFetch (adds the proof) first, plain Bearer as a fallback.
      const send = async (init: RequestInit) => {
        const r = await secureFetch(url, init);
        return r.status === 401 ? fetch(url, init) : r;
      };

      // Read-modify-write so username/email are sent back unchanged rather than dropped.
      const cur = await send({ headers });
      if (cur.status === 401 || cur.status === 403) throw new Error("Not allowed to update the profile (the token is missing the `account` audience).");
      const me = cur.ok ? await cur.json() : {};
      const res = await send({
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ...me, firstName: value }),
      });
      if (res.status === 202) throw new Error("The change is waiting for approval and has not been saved.");
      if (!res.ok) throw new Error(`Could not save the name (${res.status}).`);

      await forceRefreshToken(); // new token carries given_name, so the server sees the name
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="card modal">
        <h2 id="onb-title">What should your family call you?</h2>
        <p className="muted">
          Tide accounts have no name. This one is shown to your family on approvals, for example “Grandma Hoa” or “Minh”.
        </p>
        <label htmlFor="onb-name" className="sr-only">Display name</label>
        <input
          id="onb-name"
          autoFocus
          value={name}
          maxLength={40}
          autoComplete="nickname"
          placeholder="Display name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        {error && <div className="inline-err" role="alert">{error}</div>}
        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn secondary" onClick={dismiss} disabled={busy}>Later</button>
          <button className="btn" onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save name"}</button>
        </div>
      </div>
    </div>
  );
}
