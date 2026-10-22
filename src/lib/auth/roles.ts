import type { JWTPayload } from "jose";
import { hasRole } from "./tideJWT";
import { SIMULATE } from "@/lib/simulate";

// TrustKey's two realm roles. In TideCloak a realm admin creates them once, and every assignment
// to a user is an IGA change request that the admin quorum must sign before it reaches a token, so
// no single admin can quietly make themselves a guardian. They arrive in `realm_access.roles`.
//
// The server checks BOTH layers on every sensitive call:
//   1. the token role (who TideCloak says you are), signed by the realm key, checked here;
//   2. family membership (whose family you belong to), checked by the route against app data.
// Neither replaces the other: a guardian of one family has the role but no say over another.
export const ROLES = {
  elder: "trustkey-elder",
  guardian: "trustkey-guardian",
} as const;
export type AppRole = keyof typeof ROLES;

// Simulation mode issues these roles itself. On a live realm, turn the check on once the roles
// exist and are assigned (TRUSTKEY_ENFORCE_ROLES=1), so an existing realm is not locked out.
export const ENFORCE_APP_ROLES = SIMULATE || process.env.TRUSTKEY_ENFORCE_ROLES === "1";

const LABEL: Record<AppRole, string> = { elder: "protected person", guardian: "guardian" };

/** A 403 response when the verified token lacks the role, else null. Server-side, never UI-only. */
export function requireRole(jwt: JWTPayload, role: AppRole): Response | null {
  if (!ENFORCE_APP_ROLES || hasRole(jwt, ROLES[role])) return null;
  return Response.json(
    {
      error: `Your Tide account does not have the ${ROLES[role]} role, so it cannot act as a ${LABEL[role]}. ` +
        "A realm admin grants it, and in TideCloak that grant needs the admin quorum.",
    },
    { status: 403 },
  );
}
