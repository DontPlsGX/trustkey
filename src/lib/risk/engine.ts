// Risk engine for Cùng Duyệt.
//
// Design rule: the engine sees BEHAVIOUR, never IDENTITY. Its inputs are an amount, a random
// recipient pseudonym (R_xxxx), timing, and coarse flags the elder's browser computed locally
// (e.g. "the note mentions a fee"). Names, account numbers and message text never reach it.
//
// Second rule: the engine can only RAISE friction. Its output decides how many family approvals a
// transfer needs; nothing it returns can approve a transfer. Approvals come only from guardians'
// Tide-verified sessions (see src/lib/family/store.ts).

export interface Rules {
  perTx: number; // VND, a single transfer above this is a limit breach
  daily: number; // rolling 24h total
  weekly: number; // rolling 7-day total
  newRecipientCap: number; // cumulative total to a recipient first seen < 7 days ago
  quorum: number; // guardian approvals needed for a red-tier transfer
  coolOffMin: number; // red-tier transfers wait at least this long, even when approved
}

export const DEFAULT_RULES: Rules = {
  perTx: 5_000_000,
  daily: 10_000_000,
  weekly: 30_000_000,
  newRecipientCap: 3_000_000,
  quorum: 2,
  coolOffMin: 30,
};

/** Coarse categories the elder's browser derives from the transfer note. The note itself stays encrypted. */
export type NoteFlag = "fee" | "task" | "refund" | "penalty" | "deposit" | "investment" | "authority";

export interface TxInput {
  amount: number;
  recipientPid: string;
  onCall: boolean; // the device reports an active phone call (simulated in this prototype)
  noteFlags: NoteFlag[];
  blacklistHit: boolean; // recipient hash matched the (mock) SIMO suspicious-account list
  at: number; // epoch ms
}

export interface HistoryTx {
  amount: number;
  recipientPid: string;
  at: number;
  status: "executed" | "pending" | "rejected" | "blocked" | "cooling";
}

export interface RecipientStat {
  pid: string;
  firstSeen: number;
  executedCount: number;
}

export interface Signal {
  code: string;
  points: number;
  /** Vietnamese explanation. `{R}` is a placeholder the elder's browser swaps for the real name. */
  text: string;
}

export type Tier = "green" | "yellow" | "red";

export interface Assessment {
  score: number;
  tier: Tier;
  signals: Signal[];
  requiredApprovals: number;
  coolOffMin: number;
  series: { count: number; total: number } | null; // aggregated view of repeated small transfers
  summary: string; // placeholder text, never contains identity
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN_OFFSET_H = 7;

export const fmtVnd = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n)) + " ₫";

const NOTE_TEXT: Record<NoteFlag, string> = {
  fee: "a fee",
  task: "a paid task or commission",
  refund: "a refund",
  penalty: "a fine",
  deposit: "a deposit or booking",
  investment: "an investment or high returns",
  authority: "police, a court or a holding account",
};

function counted(h: HistoryTx) {
  // Pending and cooling transfers count toward limits so that splitting a large sum into
  // several simultaneous small requests does not slip under them.
  return h.status === "executed" || h.status === "pending" || h.status === "cooling";
}

export function assess(
  tx: TxInput,
  history: HistoryTx[],
  recipient: RecipientStat | undefined,
  rules: Rules,
  guardianCount: number,
): Assessment {
  const signals: Signal[] = [];
  const add = (code: string, points: number, text: string) => signals.push({ code, points, text });

  const live = history.filter(counted);
  const last24 = live.filter((h) => tx.at - h.at < DAY);
  const last7d = live.filter((h) => tx.at - h.at < 7 * DAY);
  const sum = (xs: HistoryTx[]) => xs.reduce((s, h) => s + h.amount, 0);

  const isNew = !recipient || tx.at - recipient.firstSeen < 7 * DAY || recipient.executedCount === 0;
  const sameRecipient24 = last24.filter((h) => h.recipientPid === tx.recipientPid);
  const sameRecipientAll = live
    .filter((h) => h.recipientPid === tx.recipientPid)
    .sort((a, b) => a.at - b.at);

  // --- Context signals ---------------------------------------------------------------------
  if (tx.onCall) {
    add("ON_CALL", 35, "Sent during a phone call. Scammers stay on the line to direct every step.");
  }
  if (tx.blacklistHit) {
    add("BLACKLIST", 50, "{R}'s account is on the suspected-fraud list (simulated State Bank SIMO list).");
  }
  if (isNew) {
    add("NEW_RECIPIENT", 20, "{R} is a new recipient and has never received money from this account.");
  }
  const hourVN = (new Date(tx.at).getUTCHours() + VN_OFFSET_H) % 24;
  if (hourVN >= 22 || hourVN < 6) {
    add("NIGHT", 10, `Sent at ${hourVN}:00, outside normal waking hours.`);
  }
  if (tx.noteFlags.length) {
    const worst = tx.noteFlags.some((f) => f === "authority" || f === "task" || f === "penalty");
    add(
      "NOTE_KEYWORDS",
      worst ? 15 : 10,
      `The transfer note mentions ${tx.noteFlags.map((f) => NOTE_TEXT[f]).join(", ")}. These words are common in scam scripts.`,
    );
  }

  // --- Pattern signals (the "many small transfers" problem) --------------------------------
  if (sameRecipient24.length >= 2) {
    add("REPEAT_24H", 20, `Transfer number ${sameRecipient24.length + 1} to {R} in 24 hours.`);
  }
  const lastTwo = sameRecipientAll.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0].amount < lastTwo[1].amount && lastTwo[1].amount < tx.amount) {
    add("ESCALATING", 15, "Each amount is larger than the last, the classic shape of a task scam.");
  }
  if (isNew) {
    const toNew = sum(sameRecipientAll.filter((h) => tx.at - h.at < 7 * DAY)) + tx.amount;
    if (toNew > rules.newRecipientCap) {
      add(
        sameRecipientAll.length ? "STRUCTURING" : "NEW_RECIPIENT_CAP",
        25,
        sameRecipientAll.length
          ? `Total to {R} is now ${fmtVnd(toNew)}, over the ${fmtVnd(rules.newRecipientCap)} cap for new recipients, even though each transfer is small.`
          : `Over the family's ${fmtVnd(rules.newRecipientCap)} cap for new recipients.`,
      );
    }
  }

  // --- Habit signals ------------------------------------------------------------------------
  const prior = live.filter((h) => tx.at - h.at >= 7 * DAY && tx.at - h.at < 35 * DAY);
  const baselineWeekly = Math.max(prior.length ? sum(prior) / 4 : 0, 2_000_000);
  const weekTotal = sum(last7d) + tx.amount;
  if (weekTotal >= 3 * baselineWeekly) {
    add("WEEKLY_SPIKE", 15, `Spending this week is ${fmtVnd(weekTotal)}, ${(weekTotal / baselineWeekly).toFixed(1)}× the usual week.`);
  }
  if (recipient && recipient.executedCount >= 3 && tx.at - recipient.firstSeen > 30 * DAY && !tx.blacklistHit) {
    add("KNOWN_LONG", -20, "{R} is a known recipient, paid many times over more than a month.");
  }

  // --- Family limits ------------------------------------------------------------------------
  let breach = false;
  if (tx.amount > rules.perTx) {
    breach = true;
    add("OVER_PER_TX", 25, `Over the ${fmtVnd(rules.perTx)} per-transfer limit.`);
  }
  const dayTotal = sum(last24) + tx.amount;
  if (dayTotal > rules.daily) {
    breach = true;
    add("OVER_DAILY", 25, `${fmtVnd(dayTotal)} in the last 24 hours, over the ${fmtVnd(rules.daily)} daily limit.`);
  }
  if (weekTotal > rules.weekly) {
    breach = true;
    add("OVER_WEEKLY", 20, `${fmtVnd(weekTotal)} in 7 days, over the ${fmtVnd(rules.weekly)} weekly limit.`);
  }

  const score = Math.max(0, signals.reduce((s, x) => s + x.points, 0));
  let tier: Tier = score >= 60 ? "red" : score >= 30 ? "yellow" : "green";
  if (breach && tier === "green") tier = "yellow"; // a limit breach always needs a human
  if (tx.blacklistHit) tier = "red";

  const quorum = Math.max(1, Math.min(rules.quorum, guardianCount));
  const requiredApprovals = tier === "green" ? 0 : tier === "yellow" ? 1 : quorum;

  const series =
    sameRecipient24.length >= 1
      ? { count: sameRecipient24.length + 1, total: sum(sameRecipient24) + tx.amount }
      : null;

  return {
    score,
    tier,
    signals: signals.sort((a, b) => b.points - a.points),
    requiredApprovals,
    coolOffMin: tier === "red" ? rules.coolOffMin : 0,
    series,
    summary: summarize(tier, tx, series, signals),
  };
}

function summarize(tier: Tier, tx: TxInput, series: Assessment["series"], signals: Signal[]) {
  if (tier === "green") return `${fmtVnd(tx.amount)} to {R}: normal, no approval needed.`;
  const top = signals.filter((s) => s.points > 0).slice(0, 2).map((s) => s.code);
  const pattern = top.includes("ON_CALL") && top.includes("NEW_RECIPIENT")
    ? "Someone on the phone is directing a transfer to an unfamiliar account"
    : top.includes("STRUCTURING") || top.includes("REPEAT_24H")
      ? "Money is being split into many small transfers to one person"
      : top.includes("BLACKLIST")
        ? "The recipient is on the suspected-fraud list"
        : "This transfer is unusual for this account";
  const s = series ? ` (transfer ${series.count}, ${fmtVnd(series.total)} in total)` : "";
  return `${pattern}${s}. ${tier === "red" ? "It needs the family quorum and a cool-off wait." : "It needs one guardian to confirm."}`;
}

// --- Client-side helpers (run in the elder's browser, so the note never leaves it) ------------

const NOTE_PATTERNS: [NoteFlag, RegExp][] = [
  ["fee", /\b(phi|le phi|phi xac minh|phi dich vu|phi ho so)\b/],
  ["task", /(nhiem vu|hoa hong|chot don|like|tha tim)/],
  ["refund", /(hoan tien|hoan lai|hoan phi)/],
  ["penalty", /(phat|nop phat|vi pham)/],
  ["deposit", /(dat coc|giu cho|coc|ky nghi|nghi duong|voucher)/],
  ["investment", /(dau tu|loi nhuan|sinh loi|chung khoan|tien ao)/],
  ["authority", /(cong an|toa an|vien kiem sat|tam giu|dieu tra|ma vu an)/],
];

export function noteFlags(note: string): NoteFlag[] {
  const n = note.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  return NOTE_PATTERNS.filter(([, re]) => re.test(n)).map(([f]) => f);
}
