import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { SIMULATE } from "../simulate";

export interface TidecloakConfig {
  realm: string;
  "auth-server-url": string;
  "ssl-required": string;
  resource: string;
  "public-client": boolean;
  "confidential-port": number;
  jwk: { keys: any[] };
  vendorId?: string;
  homeOrkUrl?: string;
}

export function loadTideConfig(): TidecloakConfig {
  if (process.env.CLIENT_ADAPTER) {
    return JSON.parse(process.env.CLIENT_ADAPTER);
  }

  let configPath = join(process.cwd(), "data", "tidecloak.json");
  // Simulation mode runs without a bootstrapped realm: fall back to the placeholder adapter.
  if (SIMULATE && !existsSync(configPath)) configPath = join(process.cwd(), "data", "tidecloak.sim.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!config.jwk) {
    throw new Error(
      "Adapter JSON missing jwk field. " +
        "Export via Tide endpoint (providerId=keycloak-oidc-keycloak-json). " +
        "The jwk field is only present when IGA is enabled on the realm."
    );
  }

  return config;
}
