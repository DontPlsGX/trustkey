"use client";

// Browser-side helpers. Every API call goes through the SDK's secureFetch: it swaps the managed
// Bearer token for a DPoP proof signed by this device's non-extractable key, bound to the exact
// method + URL. The server refuses plain Bearer, so a stolen token is useless on its own.
import { useTideCloak } from "@tidecloak/nextjs";
import { useCallback } from "react";

export const TAG = "vault"; // realm default roles grant _tide_vault.selfencrypt / selfdecrypt

export interface Details {
  name: string;
  bank: string;
  account: string;
  note: string;
}

export type Contacts = Record<string, { pid: string; name: string; bank: string; account: string }>;

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same normalisation as the server's hashAccount(): no spaces, upper case, "BANK:ACCOUNT". */
export const accountKey = (bank: string, account: string) => `${bank}:${account}`.replace(/\s+/g, "").toUpperCase();

/** Swap the `{R}` placeholder the engine emits for the real name, which only this browser knows. */
export const fillR = (text: string, name?: string) => text.replaceAll("{R}", name ? `“${name}”` : "the recipient");

export function useApi() {
  const tc = useTideCloak();
  const { token, secureFetch, doEncrypt, doDecrypt } = tc;

  const call = useCallback(
    async <T = any>(url: string, body?: unknown): Promise<T> => {
      const res = await secureFetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      return data as T;
    },
    [secureFetch, token]
  );

  const seal = useCallback(
    async (obj: unknown): Promise<string> => {
      const [ct] = await doEncrypt([{ data: JSON.stringify(obj), tags: [TAG] }]);
      return ct as string;
    },
    [doEncrypt]
  );

  const open = useCallback(
    async <T = any>(ciphertext: string): Promise<T> => {
      const [pt] = await doDecrypt([{ encrypted: ciphertext, tags: [TAG] }]);
      return JSON.parse(pt as string) as T;
    },
    [doDecrypt]
  );

  /** Batch-decrypt; one Tide round trip for many ciphertexts. Failures come back as null. */
  const openMany = useCallback(
    async <T = any>(cts: string[]): Promise<(T | null)[]> => {
      if (cts.length === 0) return [];
      try {
        const pts = await doDecrypt(cts.map((encrypted) => ({ encrypted, tags: [TAG] })));
        return pts.map((p: unknown) => {
          try { return JSON.parse(p as string) as T; } catch { return null; }
        });
      } catch {
        return cts.map(() => null);
      }
    },
    [doDecrypt]
  );

  return { ...tc, call, seal, open, openMany };
}
