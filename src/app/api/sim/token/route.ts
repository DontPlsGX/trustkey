import { NextRequest } from "next/server";
import { EmbeddedJWK, jwtVerify, type JWK } from "jose";
import { SIMULATE } from "@/lib/simulate";
import { issueSimToken, simRoleFor } from "@/lib/auth/simTide";
import { requestHtu } from "@/lib/auth/verifyDpop";

// Simulated Tide token endpoint (simulation mode only). Like TideCloak's DPoP token endpoint, it
// binds the token to the key that signed the DPoP proof on this request, so the browser must prove
// it holds that key; the token is useless without it.
export async function POST(req: NextRequest) {
  if (!SIMULATE) return Response.json({ error: "Not found" }, { status: 404 });

  const proof = req.headers.get("dpop");
  if (!proof) return Response.json({ error: "Missing DPoP proof" }, { status: 400 });
  let jwk: JWK;
  try {
    const { payload, protectedHeader } = await jwtVerify(proof, EmbeddedJWK, { typ: "dpop+jwt" });
    if (payload.htm !== "POST" || payload.htu !== requestHtu(req)) throw new Error("Proof is for another request");
    if (Math.abs(Date.now() / 1000 - Number(payload.iat)) > 300) throw new Error("Proof is stale");
    jwk = protectedHeader.jwk as JWK;
  } catch (e) {
    return Response.json({ error: `Invalid DPoP proof: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 40);
  if (!name) return Response.json({ error: "Enter a name" }, { status: 400 });

  // The realm decides the role, not the caller: listed people get the role their admin granted.
  const role = simRoleFor(name, body.role);
  return Response.json({ access_token: await issueSimToken(name, jwk, role), token_type: "DPoP", role });
}
