// Scenario tests for the risk engine. Run: node scripts/risk-scenarios.test.ts  (Node 22.6+ strips types)
import assert from "node:assert/strict";
import { assess, noteFlags, DEFAULT_RULES, type HistoryTx, type RecipientStat } from "../src/lib/risk/engine.ts";

const NOW = Date.UTC(2026, 9, 22, 7, 0); // 14:00 in Vietnam
const H = 3_600_000, D = 24 * H;
const R = DEFAULT_RULES;
const known: RecipientStat = { pid: "R_market", firstSeen: NOW - 200 * D, executedCount: 40 };
const fresh = (pid: string): RecipientStat => ({ pid, firstSeen: NOW - 5 * 60_000, executedCount: 0 });
const habit: HistoryTx[] = Array.from({ length: 20 }, (_, i) => ({
  amount: 400_000, recipientPid: "R_market", at: NOW - (8 + i) * D, status: "executed",
}));

function run(name: string, fn: () => void) {
  try { fn(); console.log("PASS", name); } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; }
}

run("market run to a long-known recipient is green", () => {
  const a = assess({ amount: 350_000, recipientPid: "R_market", onCall: false, noteFlags: [], blacklistHit: false, at: NOW }, habit, known, R, 3);
  assert.equal(a.tier, "green");
  assert.equal(a.requiredApprovals, 0);
});

run("fake police: on a call, new account, 45M, 'tài khoản tạm giữ' -> red, quorum 2, cool-off", () => {
  const a = assess({ amount: 45_000_000, recipientPid: "R_x", onCall: true, noteFlags: noteFlags("Chuyen vao tai khoan tam giu cua Cong an"), blacklistHit: false, at: NOW }, habit, fresh("R_x"), R, 3);
  assert.equal(a.tier, "red");
  assert.equal(a.requiredApprovals, 2);
  assert.equal(a.coolOffMin, 30);
  assert.ok(a.signals.some((s) => s.code === "ON_CALL"));
});

run("family resort 'holiday contract' deposit 28M to a new account -> red", () => {
  const a = assess({ amount: 28_000_000, recipientPid: "R_resort", onCall: false, noteFlags: noteFlags("Đặt cọc hợp đồng kỳ nghỉ gia đình"), blacklistHit: false, at: NOW }, habit, fresh("R_resort"), R, 3);
  assert.equal(a.tier, "red");
});

run("structuring: 2.9M x 4 to the same new recipient escalates to red by the 4th", () => {
  const hist: HistoryTx[] = [...habit];
  const tiers: string[] = [];
  for (let i = 0; i < 4; i++) {
    const at = NOW + i * 20 * 60_000;
    const a = assess({ amount: 2_900_000 + i * 100_000, recipientPid: "R_task", onCall: false, noteFlags: noteFlags("hoa hong nhiem vu"), blacklistHit: false, at }, hist, fresh("R_task"), R, 3);
    tiers.push(a.tier);
    hist.push({ amount: 2_900_000 + i * 100_000, recipientPid: "R_task", at, status: "executed" });
  }
  assert.equal(tiers[0], "yellow"); // new recipient + task keywords
  assert.equal(tiers[3], "red");
});

run("blacklisted account is always red", () => {
  const a = assess({ amount: 200_000, recipientPid: "R_mule", onCall: false, noteFlags: [], blacklistHit: true, at: NOW }, habit, fresh("R_mule"), R, 3);
  assert.equal(a.tier, "red");
});

run("quorum never exceeds the number of guardians", () => {
  const a = assess({ amount: 45_000_000, recipientPid: "R_x", onCall: true, noteFlags: [], blacklistHit: false, at: NOW }, habit, fresh("R_x"), R, 1);
  assert.equal(a.requiredApprovals, 1);
});

run("explanations carry a placeholder, never an identity", () => {
  const a = assess({ amount: 45_000_000, recipientPid: "R_x", onCall: true, noteFlags: [], blacklistHit: false, at: NOW }, habit, fresh("R_x"), R, 3);
  assert.ok(a.signals.some((s) => s.text.includes("{R}")));
  assert.ok(!JSON.stringify(a).includes("R_x"));
});
