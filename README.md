# TrustKey

> RMIT Hackathon 2026 · Challenge 2 “UNLOCKED” by Tide · built on TideCloak

TrustKey holds suspicious transfers from an account until 2 of 3 guardians sign in their own Tide enclaves, so no scammer can empty a lifetime of savings.
[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)
## 1. Vision & originality

Scammers don’t hack banks. They hack people, through love and loneliness. Every current safeguard asks “is it really her?” Nobody asks “is she being manipulated?”

We unlock a new possibility: **money no one can move alone, not even its owner.** Large transfers need two of three chosen guardians, so trust stops being a scammer’s weapon. Beyond grandparents, TrustKey protects tuition, hospital expenses, and any savings one panicked call could wipe out.

## 2. Trust constraint insight

Today, the final yes belongs to one party: a pressured elder, a greedy relative, or a bank that insiders or hackers can flip. That single point of trust is exactly what scammers exploit.

An ordinary family-voting app doesn’t fix this: its operator could still approve transfers alone. Ours ensures no single party holds the final say, not even us.


## 3. Value & impact

Vietnamese lost 8,000+ billion ₫ to online fraud in 2025 (VTV). One grieving widow alone signed 74 contracts, nearly 20 billion ₫, to a saleswoman (Dân trí). A 23-year-old took her own life over fake loan-app fees (VietNamNet).

With TrustKey, daily payments go through instantly, while large or repeated transfers to strangers wait for approval. 
Banks and e-wallets can offer it as an opt-in: no new hardware, just three trusted people.

## 4. Why TideCloak matters

With ordinary login, 2 out of 3 is code its operator can skip. With TideCloak, each guardian signs in their own enclave and the realm key never exists whole.

The full map of where TideCloak fits, and what is live or simulated, is in [docs/tidecloak-plan.md](docs/tidecloak-plan.md).

## 5. Prototype & storytelling

### The story

A 70-year-old Hà Nội widow trusted a saleswoman who called herself her “adopted daughter”. Seventy-four contracts later, nearly 20 billion ₫ was gone (Dân trí). Grandparents rush savings to a “grandchild in trouble”; young people pay fake loan-app fees until they break. Every script ends the same way: *“don’t tell your family.”*

Face biometrics prove it’s her, not that she isn’t being manipulated. TrustKey moves the final “yes” from one pressured person to the people who love her: authority emerges only when 2 of 3 of them agree.

### The prototype

A working Next.js app on TideCloak with synthetic data: Grandma Hoa (protected) and three guardians, Minh, Lan and Tuấn.

- **Elder:** sends money, with five built-in scam scenarios.
- **Guardians:** see risk signals and a pseudonym, never the name, then approve or block. A red transfer needs 2 of 3 approvals plus a cool-off, and one block stops it.
- **Family rules:** anyone can freeze; loosening anything needs the quorum.
- **Proof:** every vote can be re-verified in the browser, and “What the server sees” shows it holds only ciphertext and pseudonyms.
- **Risk engine:** tested (`npm run test:risk`), with an optional AI explainer that has no vote.

The demo follows a fake-police call from grandma’s **Send** button to her children’s phones. Recording guide: [docs/video-script.md](docs/video-script.md).
---

### SETUP

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
- Every sensitive API checks the TideCloak realm role (`trustkey-elder` / `trustkey-guardian`) on the server, then family membership. Roles are always enforced in simulation, and on a live realm once `TRUSTKEY_ENFORCE_ROLES=1` is set after the roles are granted through IGA. See [docs/tidecloak-plan.md](docs/tidecloak-plan.md).
- The *per-transfer* quorum count is enforced by this app’s server. Its evidence (the receipts) is cryptographic and independently verifiable at `/receipts`, including a “tampered server” simulation. Making the release itself a threshold signature would use a Tide Forseti policy contract, which is the next step.
- The bank, the SIMO blacklist and the phone-call signal are simulated. All people, accounts and amounts are synthetic.

## Run it

Requires Node 22+, Docker (with curl and jq) and a Tide account.

```bash
npm install
npm run init       # TideCloak dev container, realm "trustkey", IGA on, prints an invite link; exports data/tidecloak.json
npm run dev        # http://localhost:3000
npm run test:risk  # risk-engine scenarios
```

On Windows, run `npm run init` inside WSL2 (Ubuntu with `docker.io`, `jq`, `curl`) from the project folder.

Set `TRUSTKEY_DEMO_FAST=1` to turn cool-off minutes into seconds for a short demo.

**Chrome/Edge 142+: allow Local Network Access.** Tide's sign-in page runs on a public origin (`https://ork*.tideprotocol.com`) and fetches vouchers from TideCloak on `http://localhost:8080`. Chrome blocks that public → loopback request unless the user allows it ([Local Network Access](https://developer.chrome.com/blog/local-network-access)). If sign-up fails with “Could not reach enough ORKs”, do one of these:

- Use a normal window rather than Incognito, and click **Allow** on the “access devices on your local network” prompt.
- Open `chrome://settings/content/siteDetails?site=https://ork1.tideprotocol.com` (Edge: `edge://settings/content/siteDetails?site=…`) and set **Local network access** to **Allow**.

### Simulation mode (when Tide's network is under load)

```bash
NODE_OPTIONS=--max-old-space-size=3072 npm run dev:sim   # http://localhost:3000, no Docker or Tide account needed
```

Sign-in becomes a local page (`/sim-login`) where you pick a person. Each browser tab is its own person, so one window can play the whole family. A local stand-in for TideCloak issues the tokens, which carry:

- realm roles: `trustkey-elder` for Grandma Hoa, `trustkey-guardian` for Minh, Lan and Tuấn;
- a DPoP binding to a device key the browser cannot export.

The server runs the same checks as with TideCloak: signature, DPoP, role, then family membership. The one honest difference is that a single local key signs every token, where Tide splits the realm key across its ORK network. For where each TideCloak feature fits, and what is live or simulated, see [docs/tidecloak-plan.md](docs/tidecloak-plan.md).

### Demo (one elder + three guardians, 2 of 3 must approve)

1. Elder: **Create a family** creates the family and shows an invite code.
2. All three guardians: **Join family** with that code.
3. Elder: **Seal the guardian list** seals the guardian list.
4. Elder: send **Pay the vegetable seller**. It is green and goes through instantly.
5. Elder: send **“Police” on the phone**. It is red: guardians see “on a call, new recipient, ‘tạm giữ’” but not the name.
6. Guardian A taps **I called and confirmed: approve**, then Guardian B does the same. Two of three is enough. The transfer then waits for the cool-off before release.
7. Send **Task scam, split small** four times. Structuring escalates it from yellow to red.
8. Open **What the server sees** to see the elder’s decrypted view next to the server’s raw rows and the AI’s input.
9. Open **Receipts** and click **Verify all**: every check passes. Tick “Simulate a hacked server” and the checks fail.
10. Open **Family rules**: one person can freeze, but unfreezing needs the quorum.
