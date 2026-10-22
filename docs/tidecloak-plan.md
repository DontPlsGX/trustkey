# Where TideCloak fits in TrustKey

TrustKey is built as though TideCloak protects it. This plan was made with Tide's MCP: the `feature-mapping` canon and the `add-rbac-nextjs` playbook. It lists each protection, the TideCloak feature that provides it, and what this build runs today.

There are two ways to run the app:

- **Live** (`npm run dev`) runs against a real TideCloak realm and the Tide ORK network.
- **Simulated** (`npm run dev:sim`) runs against a local stand-in for TideCloak, for when Tide's network is under load. The server checks are the same code in both modes. Only the token issuer and the encryption key change.

## The map

| # | Protection | TideCloak feature | Live | Simulated stand-in |
|---|---|---|---|---|
| 1 | Sign-in that no single server can fake | Threshold sign-in across ORKs, so no password is held anywhere | ✅ | `/sim-login`: pick a person and the browser gets a token. No password. |
| 2 | Tokens the app can trust offline | VVK-signed JWT (EdDSA), checked against the realm JWKS embedded in `data/tidecloak.json` | ✅ | One local Ed25519 key in `data/sim-tide/` (gitignored) signs the tokens. `/api/sim/jwks` publishes it, and `verifyTideJWT` checks it the same way. |
| 3 | A stolen token is useless | DPoP: the token is bound to a non-extractable device key (`cnf.jkt`) | ✅ | Same: an ES256 key that cannot leave the browser (IndexedDB), and the token endpoint requires a DPoP proof. |
| 4 | Proof checks on every API call | Server-side DPoP verification | ✅ | Same code: `verifyDpop` checks `htm`/`htu`, `iat` ±300 s, `ath`, `jti` replay and the `cnf.jkt` thumbprint, and rejects the `Bearer` scheme. |
| 5 | Only the protected person sends, only guardians approve | Realm roles in `realm_access.roles`, enforced on the server | ⚙️ opt-in, `TRUSTKEY_ENFORCE_ROLES=1` once the roles exist | ✅ The sim token carries `trustkey-elder` or `trustkey-guardian`, and `requireRole` (`src/lib/auth/roles.ts`) enforces it. |
| 6 | No admin can quietly make themselves a guardian | IGA: a role assignment is a draft change request that the admin quorum signs | ✅ realm has IGA on | The sim realm's user directory (`SIM_DIRECTORY` in `src/lib/auth/simTide.ts`) is the result of those grants. A new name picks a role, which stands in for the grant. |
| 7 | The server never sees who the money goes to | E2EE self-encryption with `_tide_vault.selfencrypt` / `selfdecrypt`, user-bound | ✅ | AES-GCM with a per-person key in the browser (`sim1.` ciphertexts). The server still stores ciphertext only. |
| 8 | Release a red transfer only with 2 of 3 guardians | Today: the app counts DPoP-signed guardian receipts. Next: a Forseti policy contract makes the release itself a threshold signature in the ORKs. | ✅ app quorum · 🔜 Forseti | Same app quorum. |
| 9 | Family rule changes (unfreeze, raise limit, remove guardian) need the quorum | Same receipt model as #8. Forseti later. | ✅ | Same. |
| 10 | The Tide sign-in iframe can load | CSP `frame-src 'self' *` (ORK re-homing) | ✅ `next.config.ts` | Not needed, but kept. |

## Two layers on every sensitive call

The server checks two things, and each one guards a different question:

1. **Token role** (`requireRole`): what TideCloak says you are, signed by the realm.
2. **Family membership** (`roleIn`): whose family you are in, from app data.

A guardian of one family has the role but still cannot vote on another family's transfer. A family member without the role is refused before the family is even read.

| API | Role needed | Then also |
|---|---|---|
| `POST /api/family` `create` · `seal` · `contacts` | `trustkey-elder` | must be the elder of that family (seal, contacts) |
| `POST /api/family` `join` | `trustkey-guardian` | valid invite code, list not sealed, ≤ 5 guardians |
| `POST /api/transfers` | `trustkey-elder` | the elder of the family, account not frozen |
| `POST /api/tx/<id>/<decision>/<digest>` | `trustkey-guardian` | a guardian of that family, digest matches, has not voted |
| `POST /api/proposals/<id>/<decision>/<digest>` | `trustkey-guardian` | a guardian of that family, not the target of a removal |
| `POST /api/family` `freeze`, `POST /api/proposals` | any signed-in member | membership only: tightening is open to everyone |

Hiding a button in the UI is never what blocks an action. Every row above is enforced on the server.

## Following Tide's guidance

- **App roles are separate from `_tide_*` roles.** `_tide_vault.*` only tags encryption. TrustKey's own roles are `trustkey-*` (AP-18).
- **Self-encryption is user-bound.** Only the elder can read the address book. Guardians see behaviour flags, never names. Sharing data between family members would need a policy-governed key (Forseti), and that is not used here.
- **Role grants go through IGA.** In a live realm you create `trustkey-elder` and `trustkey-guardian`, assign them as change requests, and have the admin quorum sign and commit them. Then set `TRUSTKEY_ENFORCE_ROLES=1`.
- **Forseti contracts are deployed by the Tide team.** Moving step #8 into a contract means writing it and compile-checking it here, then handing it to Tide.

## What the simulation does not prove

- **One key, not a quorum.** In simulation a single local key signs every token. With Tide, no machine holds the realm key: the ORKs produce each signature together. Anyone with `data/sim-tide/realm-key.json` could mint tokens, so simulation is for demos only.
- **Local encryption key.** The encryption key comes from the browser rather than from Tide's threshold key.

Everything above the token issuer is unchanged between the two modes: DPoP, roles, membership, quorum, receipts and ciphertext-only storage.
