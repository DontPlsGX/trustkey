"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { SIMULATE } from "@/lib/simulate";
import { useSimTide } from "./simTide";

/**
 * The app's one entry point to Tide. SIMULATE is a build-time constant, so the same hook is called on
 * every render (hook order stays stable). The simulated hook covers the fields this app uses.
 */
export const useTide: typeof useTideCloak = SIMULATE ? (useSimTide as unknown as typeof useTideCloak) : useTideCloak;
