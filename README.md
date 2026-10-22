# Cùng Duyệt (FamilyKey): family co-signing against scams

> RMIT Hackathon 2026 · Challenge 2 “UNLOCKED” by Tide · built on TideCloak

## Overview

**Vision & originality.** Cùng Duyệt (“approve together”) is a family co-signing layer for an older person’s bank transfers. Everyday payments go through instantly. Risky ones wait for a family quorum, not a bank, an app admin or an AI.

**Trust constraint insight.** Scams beat every one-person check. The scammer on the phone *is* the person telling grandma what to press. An admin or a fraud AI can be fooled, bribed or breached. So no single party (elder, child, admin, server or AI) can release a flagged transfer or loosen a rule alone. Tightening is one tap for anyone (freeze). Loosening needs a quorum.

**Value & impact.** Phone impersonation scams target older people: fake police, “holiday contract” deposits, and task scams split into small transfers. Cùng Duyệt keeps their independence for daily payments. It adds family friction only where the risk engine sees on-call pressure, a new payee, structuring, scam-pattern notes or a blacklisted account.

**Why TideCloak matters.** Tide removes the master key twice.
- Recipient names, accounts and notes are self-encrypted in the elder’s browser through Tide’s threshold network. The server, the AI and even the children see behaviour, never identity.
- Every guardian vote is a Tide threshold-signed token plus a DPoP proof bound to the transfer’s digest. Anyone can verify it; the server cannot forge it.
- The realm runs under Tide IGA, so no single admin can rewire who holds authority.

**Prototype & storytelling.** Next.js on TideCloak: elder, guardian, governance, receipt-verifier and “what the server sees” views, five synthetic scam scenarios, and a tested risk engine. The demo follows a fake-police call from grandma’s **Send transfer** button to two children’s phones. It then opens the server’s loot (ciphertext and pseudonyms) and re-verifies every approval in the browser.

---

## What happens on a transfer

```
Elder's browser                          Server (Next.js)                  Guardians' phones
───────────────                          ────────────────                  ─────────────────
name/account/note ──doEncrypt(tag vault)──▶ ciphertext (opaque)
noteFlags(note)  ──────────────────────▶ ["authority"]
sha256(BANK:ACCT) ─────────────────────▶ mock SIMO blacklist lookup
amount, onCall   ──────────────────────▶ risk engine (behaviour only)
                                            │ tier green → execute
                                            │ tier yellow → 1 guardian
                                            │ tier red → quorum + cool-off
                                            ▼
                                         pending transfer ──poll──────────▶ signals + "{R}" placeholder
                                                                          POST /api/tx/<id>/approve/<digest>
                                         stores token + DPoP proof ◀───── (DPoP proof signs the URL,
                                         as an unforgeable receipt          i.e. the digest)
```

- **Risk engine** ([src/lib/risk/engine.ts](src/lib/risk/engine.ts)) scores behaviour.
  - Inputs: amount, a random recipient pseudonym (`R_xxxxxx`), time of day, on-call, coarse note categories, a blacklist hit, and rolling history.
  - Signals: on a call, new recipient, night time, scam keywords (authority / deposit / task / fee…), repeated sends in 24 hours, escalating amounts, **structuring** (cumulative cap to a new payee), weekly spike against the elder’s own baseline, and limit breaches.
  - It can only *raise* friction. Nothing it returns approves anything.
- **AI explainer** ([src/lib/risk/ai.ts](src/lib/risk/ai.ts)) is optional and needs `ANTHROPIC_API_KEY`. It receives features only (see `/godview`), and it has no vote.
- **Approvals** ([src/app/api/tx/[id]/[decision]/[digest]/route.ts](src/app/api/tx/[id]/[decision]/[digest]/route.ts)) have these properties:
  - Only enrolled guardians can vote.
  - The elder cannot approve their own flagged transfer, because the scammer on the line would just tell them to.
  - One reject blocks the transfer.
  - Red-tier transfers also wait out a cool-off, even when fully approved.

## Who can do what

| Action | Elder | One guardian | Guardian quorum | App admin / server / AI |
|---|---|---|---|---|
| Everyday (green) transfer | ✅ alone | – | – | ❌ |
| Release a red transfer | ❌ | ❌ | ✅ (+ cool-off) | ❌ |
| Block a transfer / freeze account | ✅ | ✅ | – | ❌ |
| Unfreeze, raise limits, lower quorum | propose only | propose only | ✅ | ❌ |
| Remove a guardian / unlock family savings | propose only | propose only | ✅ (target can’t vote) | ❌ |
| Read recipient name / account / note | ✅ (Tide decrypt) | ❌ | ❌ | ❌ (ciphertext only) |
| Forge an approval | ❌ | ❌ | ❌ | ❌ (needs the Tide-signed token **and** the guardian’s device key) |

## Honest limits of this prototype

- The TideCloak realm (roles, IdP, admin authority) is governed by **Tide IGA** with no single admin.
- The *per-transfer* quorum count is enforced by this app’s server. Its evidence (the receipts) is cryptographic and independently verifiable at `/receipts`, including a “tampered server” simulation. Making the release itself a threshold signature would use a Tide Forseti policy contract, which is the next step.
- The bank, the SIMO blacklist and the phone-call signal are simulated. All people, accounts and amounts are synthetic.

## Run it

Requires Node 22+, Docker (with curl and jq) and a Tide account.

```bash
npm install
npm run init       # TideCloak dev container, realm "cungduyet", IGA on, prints an invite link; exports data/tidecloak.json
npm run dev        # http://localhost:3000
npm run test:risk  # risk-engine scenarios
```

On Windows, run `npm run init` inside WSL2 (Ubuntu with `docker.io`, `jq`, `curl`) from the project folder.

Set `CUNGDUYET_DEMO_FAST=1` to turn cool-off minutes into seconds for a short demo.

**Chrome/Edge 142+: allow Local Network Access.** Tide's sign-in page runs on a public origin (`https://ork*.tideprotocol.com`) and fetches vouchers from TideCloak on `http://localhost:8080`. Chrome blocks that public → loopback request unless the user allows it ([Local Network Access](https://developer.chrome.com/blog/local-network-access)). If sign-up fails with “Could not reach enough ORKs”, do one of these:

- Use a normal window rather than Incognito, and click **Allow** on the “access devices on your local network” prompt.
- Open `chrome://settings/content/siteDetails?site=https://ork1.tideprotocol.com` (Edge: `edge://settings/content/siteDetails?site=…`) and set **Local network access** to **Allow**.

### Demo (three browser profiles: elder + two guardians)

1. Elder: **Create a family** creates the family and shows an invite code.
2. Both guardians: **Join family** with that code.
3. Elder: **Seal the guardian list** seals the guardian list.
4. Elder: send **Pay the vegetable seller**. It is green and goes through instantly.
5. Elder: send **“Police” on the phone**. It is red: guardians see “on a call, new recipient, ‘tạm giữ’” but not the name.
6. Guardian A taps **I called and confirmed: approve**, then Guardian B does the same. The transfer then waits for the cool-off before release.
7. Send **Task scam, split small** four times. Structuring escalates it from yellow to red.
8. Open **What the server sees** to see the elder’s decrypted view next to the server’s raw rows and the AI’s input.
9. Open **Receipts** and click **Verify all**: every check passes. Tick “Simulate a hacked server” and the checks fail.
10. Open **Family rules**: one person can freeze, but unfreezing needs the quorum.
