import { SIMULATE } from "@/lib/simulate";
import { simJwks } from "@/lib/auth/simTide";

// Public half of the simulated realm key, so the receipt verifier can check tokens in the browser.
export async function GET() {
  if (!SIMULATE) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(simJwks());
}
