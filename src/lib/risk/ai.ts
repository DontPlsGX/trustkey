// Optional LLM explainer. It receives the same de-identified features as the risk engine and
// writes a short, warm warning for the elder in plain English, using {R} where the recipient's name
// goes. The elder's browser swaps {R} for the real name it decrypted locally, so the model
// provider never learns who the money was going to.
//
// The model's output is advisory text only. It cannot change the tier, the required approvals,
// or approve anything: those come from the deterministic engine and from guardians.
import type { Assessment, TxInput } from "./engine";

const MODEL = process.env.TRUSTKEY_AI_MODEL || "claude-haiku-5-5";

export async function explain(tx: TxInput, a: Assessment): Promise<{ text: string; model: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || a.tier === "green") return null;

  const features = {
    amount_vnd: tx.amount,
    recipient: "{R}",
    tier: a.tier,
    on_call: tx.onCall,
    note_categories: tx.noteFlags,
    signals: a.signals.map((s) => ({ code: s.code, points: s.points })),
    series: a.series,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system:
          "You are an anti-scam assistant for older people in Vietnam. Write 2-3 short, warm, plain English sentences addressed to the account holder as 'you'. " +
          "Explain from the signals why this transfer looks suspicious, and advise them to hang up and call their family. " +
          "Always use the exact string {R} for the recipient. Do not invent anything beyond the data given.",
        messages: [{ role: "user", content: JSON.stringify(features) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return typeof text === "string" ? { text, model: MODEL } : null;
  } catch {
    return null;
  }
}
