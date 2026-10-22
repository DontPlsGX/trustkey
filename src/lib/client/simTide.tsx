"use client";

// Browser half of simulation mode (see src/lib/simulate.ts). Exposes the subset of the
// useTideCloak() surface this app uses, with the same security shape:
//   - a non-extractable ES256 device key; every request carries an RFC 9449 DPoP proof signed by it
//   - an access token bound to that key (cnf.jkt), issued by /api/sim/token
//   - self-encryption with a non-extractable AES-GCM key that never leaves this device
// Each tab keeps its own session, so one browser can play the elder and both guardians.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SignJWT, decodeJwt, exportJWK, type JWK } from "jose";
import tcConfig from "@tide-adapter";

const SESSION = "cungduyet.sim.session";

// ---- IndexedDB: the only place a non-extractable CryptoKey can be kept across reloads ----
function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("cungduyet-sim", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction("keys", mode).objectStore("keys"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}
const idbGet = <T,>(k: string) => idb<T | undefined>("readonly", (s) => s.get(k));
const idbPut = (k: string, v: unknown) => idb<void>("readwrite", (s) => s.put(v, k));
const idbDel = (k: string) => idb<void>("readwrite", (s) => s.delete(k));

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function proofFor(keys: CryptoKeyPair, method: string, url: string, token?: string) {
  const u = new URL(url, location.href);
  const jwk = await exportJWK(keys.publicKey);
  const claims: Record<string, string> = { htm: method.toUpperCase(), htu: `${u.origin}${u.pathname}` };
  if (token) claims.ath = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as JWK })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .sign(keys.privateKey);
}

interface Session { sid: string; token: string }

function useSimState() {
  const [session, setSession] = useState<Session | null>(null);
  const [keys, setKeys] = useState<CryptoKeyPair | null>(null);
  const [isInitializing, setInit] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION) ?? "null") as Session | null;
        const k = s && (await idbGet<CryptoKeyPair>(`dpop:${s.sid}`));
        const exp = s ? Number(decodeJwt(s.token).exp ?? 0) * 1000 : 0;
        if (s && k && exp > Date.now()) {
          setSession(s);
          setKeys(k);
        } else sessionStorage.removeItem(SESSION);
      } catch {}
      setInit(false);
    })();
  }, []);

  const signIn = useCallback(async (name: string, role?: "elder" | "guardian") => {
    const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const url = "/api/sim/token";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: await proofFor(k, "POST", url) },
      body: JSON.stringify({ name, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    const s = { sid: crypto.randomUUID(), token: data.access_token as string };
    await idbPut(`dpop:${s.sid}`, k);
    sessionStorage.setItem(SESSION, JSON.stringify(s));
    setKeys(k);
    setSession(s);
  }, []);

  const token = session?.token ?? "";
  const claims = useMemo(() => (token ? (decodeJwt(token) as Record<string, unknown>) : {}), [token]);

  const secureFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!keys || !token) throw new Error("Not signed in");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `DPoP ${token}`);
      headers.set("DPoP", await proofFor(keys, init.method ?? "GET", url, token));
      return fetch(url, { ...init, headers });
    },
    [keys, token]
  );

  // The self-encryption key belongs to the person (sub) and stays on this device.
  const aesKey = useCallback(async () => {
    const id = `aes:${claims.sub}`;
    let k = await idbGet<CryptoKey>(id);
    if (!k) {
      k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await idbPut(id, k);
    }
    return k;
  }, [claims.sub]);

  const doEncrypt = useCallback(
    async (items: { data: string; tags: string[] }[]) => {
      const key = await aesKey();
      return Promise.all(items.map(async ({ data, tags }) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(tags.join(",")) }, key, new TextEncoder().encode(data));
        return `sim1.${b64url(iv)}.${b64url(ct)}`;
      }));
    },
    [aesKey]
  );

  const doDecrypt = useCallback(
    async (items: { encrypted: string; tags: string[] }[]) => {
      const key = await aesKey();
      return Promise.all(items.map(async ({ encrypted, tags }) => {
        const [, iv, ct] = encrypted.split(".");
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(iv), additionalData: new TextEncoder().encode(tags.join(",")) }, key, unb64url(ct));
        return new TextDecoder().decode(pt);
      }));
    },
    [aesKey]
  );

  const logout = useCallback(async () => {
    if (session) await idbDel(`dpop:${session.sid}`).catch(() => {});
    sessionStorage.removeItem(SESSION);
    location.assign("/");
  }, [session]);

  const get = useCallback((k: string) => claims[k] as any, [claims]);

  return {
    authenticated: !!session,
    isInitializing,
    token,
    signIn,
    login: () => location.assign(`/sim-login?return=${encodeURIComponent(location.pathname)}`),
    logout,
    secureFetch,
    doEncrypt,
    doDecrypt,
    getValueFromToken: get,
    getValueFromIdToken: get,
    getToken: async () => token,
    getConfig: () => tcConfig as Record<string, any>,
    forceRefreshToken: async () => true,
  };
}

type SimTide = ReturnType<typeof useSimState>;
const Ctx = createContext<SimTide | null>(null);

export function SimTideProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={useSimState()}>{children}</Ctx.Provider>;
}

export function useSimTide(): SimTide {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSimTide outside SimTideProvider");
  return v;
}
