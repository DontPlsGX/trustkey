/**
 * Simulation mode (Tide "plan C"). While Tide's ORK network is under load, Tide asked teams to build
 * as though TideCloak protects the app and simulate those protections. With NEXT_PUBLIC_TIDE_SIMULATE=1:
 *
 * - Sign-in is a local stand-in that issues the same kind of token TideCloak issues: an EdDSA-signed
 *   JWT with cnf.jkt, bound to a non-extractable ES256 key in the browser (DPoP).
 * - The realm key that signs it is a single local key standing in for the threshold key the ORKs
 *   hold. That is the one thing a simulation cannot reproduce: here, one process holds it.
 * - Self-encryption uses an AES key that never leaves the device, standing in for Tide's doEncrypt.
 *
 * Every server-side check (token signature, DPoP proof, quorum, digest-bound receipts) runs unchanged.
 * Unset the variable and the app goes back to real TideCloak with no other change.
 */
export const SIMULATE = process.env.NEXT_PUBLIC_TIDE_SIMULATE === "1";
