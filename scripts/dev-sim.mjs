// `npm run dev:sim`: the dev server in simulation mode (see src/lib/simulate.ts), on any OS.
import { spawn } from "node:child_process";

spawn("npx", ["next", "dev", "--webpack"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_TIDE_SIMULATE: "1" },
}).on("exit", (code) => process.exit(code ?? 0));
