import { NextRequest } from "next/server";
import type { JWTPayload } from "jose";
import { verifyTideJWT, extractToken } from "./tideJWT";
import { verifyDpop, requestHtu } from "./verifyDpop";

// Same checks as withAuth (middleware.ts): Tide JWT signature against the realm's embedded JWK,
// then the DPoP binding. Additionally hands the handler the raw token and proof, so approval
// routes can keep them as a verifiable receipt instead of a server-asserted "approved: true".
export interface AuthCtx {
  jwt: JWTPayload;
  sub: string;
  username: string;
  token: string;
  proof: string;
  htu: string;
}

type Handler = (req: NextRequest, ctx: AuthCtx) => Promise<Response>;

export function withAuthCtx(handler: Handler) {
  return async (req: NextRequest) => {
    let ctx: AuthCtx;
    try {
      const token = extractToken(req.headers.get("authorization"));
      const jwt = await verifyTideJWT(token);
      await verifyDpop(req, token, jwt as { cnf?: { jkt?: string } });
      ctx = {
        jwt,
        sub: jwt.sub!,
        // Display name the user set in-app (Account API firstName -> name/given_name), else the vuid.
        username: displayName(jwt),
        token,
        proof: req.headers.get("dpop") ?? "",
        htu: requestHtu(req),
      };
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx);
  };
}

function displayName(jwt: JWTPayload) {
  const c = jwt as Record<string, unknown>;
  return String(c.name || c.given_name || c.preferred_username || jwt.sub);
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status });
