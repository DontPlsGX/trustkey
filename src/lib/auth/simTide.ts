import { generateKeyPairSync, createPrivateKey } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { SignJWT, calculateJwkThumbprint, type JWK } from "jose";
import { loadTideConfig } from "./tidecloakConfig";

// Stand-in for the Tide network's realm key, used only in simulation mode (see src/lib/simulate.ts).
// Same algorithm as the real realm (EdDSA / Ed25519), so tokens look and verify the same way. In
// production no single machine holds this key: the ORKs produce each signature together.
const DIR = join(process.cwd(), "data", "sim-tide");
const KEY_FILE = join(DIR, "realm-key.json");

let cached: { publicJwk: JWK; privateJwk: JWK } | null = null;

export function simRealmKey() {
  if (cached) return cached;
  if (existsSync(KEY_FILE)) {
    cached = JSON.parse(readFileSync(KEY_FILE, "utf-8"));
    return cached!;
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = `sim-${Date.now().toString(36)}`;
  cached = {
    publicJwk: { ...(publicKey.export({ format: "jwk" }) as JWK), kid, alg: "EdDSA", use: "sig" },
    privateJwk: { ...(privateKey.export({ format: "jwk" }) as JWK), kid, alg: "EdDSA" },
  };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify(cached, null, 2));
  return cached;
}

export const simJwks = () => ({ keys: [simRealmKey().publicJwk] });

/** A stable 64-hex subject per display name, shaped like a Tide vuid. */
async function vuidFor(name: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sim-vuid:${name.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Issue an access token bound to the caller's device key, with the claims TideCloak would put in. */
export async function issueSimToken(name: string, deviceJwk: JWK) {
  const cfg = loadTideConfig();
  const { privateJwk } = simRealmKey();
  const key = createPrivateKey({ key: privateJwk as any, format: "jwk" });
  const sub = await vuidFor(name);
  return new SignJWT({
    typ: "DPoP",
    azp: cfg.resource,
    sid: crypto.randomUUID(),
    cnf: { jkt: await calculateJwkThumbprint(deviceJwk, "sha256") },
    name,
    given_name: name,
    preferred_username: sub,
    scope: "openid profile",
    realm_access: { roles: ["_tide_vault.selfencrypt", "_tide_vault.selfdecrypt"] },
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: privateJwk.kid })
    .setIssuer(`${cfg["auth-server-url"].replace(/\/+$/, "")}/realms/${cfg.realm}`)
    .setSubject(sub)
    .setAudience("account")
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
}
