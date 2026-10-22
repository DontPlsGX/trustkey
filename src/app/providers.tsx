"use client";

import { TideCloakProvider } from "@tidecloak/nextjs";
import tcConfig from "@tide-adapter";
import { SIMULATE } from "@/lib/simulate";
import { SimTideProvider } from "@/lib/client/simTide";

// The provider takes the adapter JSON directly as the config prop.
// useDPoP goes inside the config object, not as a separate JSX prop (I-12).
// In simulation mode (src/lib/simulate.ts) a local stand-in provides the same hook surface.
export function Providers({ children }: { children: React.ReactNode }) {
  if (SIMULATE) return <SimTideProvider>{children}</SimTideProvider>;
  return (
    <TideCloakProvider
      config={{ ...(tcConfig as any), useDPoP: { mode: "strict", alg: "ES256" } }}
    >
      {children}
    </TideCloakProvider>
  );
}
