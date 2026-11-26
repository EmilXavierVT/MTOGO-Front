"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { API_BASE } from "../utils/api";
import { PUBLIC_CAPABILITY_NAMES } from "./catalog";

type Capabilities = Readonly<Record<string, boolean>>;
const DISABLED: Capabilities = Object.freeze({});
const FeatureFlagsContext = createContext<Capabilities>(DISABLED);
const SessionExpiryContext = createContext<() => void>(() => {});

type Props = {
  token: string;
  children: ReactNode;
  onUnauthorized: () => void;
  capabilityNames?: readonly string[];
};

type CapabilityRequest = {
  token: string;
  pathname: string;
  names: readonly string[];
};

type Snapshot = {
  request: CapabilityRequest;
  values: Capabilities;
};

/** Runtime UI hints only. The backend independently authorizes and gates every future action. */
export function FeatureFlagsProvider({ token, children, onUnauthorized,
  capabilityNames = PUBLIC_CAPABILITY_NAMES }: Props) {
  const pathname = usePathname();
  const request = useMemo(() => ({ token, pathname, names: capabilityNames }), [token, pathname, capabilityNames]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    async function load() {
      let values: Capabilities = DISABLED;
      try {
        const response = await fetch(`${API_BASE}/features`, {
          method: "GET",
          headers: { Authorization: `Bearer ${request.token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        if (response.status === 401) {
          onUnauthorized();
          return;
        }
        if (response.ok) {
          const payload: unknown = await response.json();
          if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
            values = Object.fromEntries(request.names.map((name) => [name,
              Object.hasOwn(payload, name) && (payload as Record<string, unknown>)[name] === true]));
          }
        }
      } catch {
        // An older backend, invalid JSON or an unavailable endpoint keeps new capabilities disabled.
      } finally {
        window.clearTimeout(timeout);
      }
      if (!disposed && !controller.signal.aborted) {
        setSnapshot({ request, values });
      }
    }

    void load();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [request, onUnauthorized]);

  // A prior route/session must not enable controls while its replacement request is pending.
  const values = snapshot?.request === request ? snapshot.values : DISABLED;
  return <SessionExpiryContext.Provider value={onUnauthorized}>
    <FeatureFlagsContext.Provider value={values}>{children}</FeatureFlagsContext.Provider>
  </SessionExpiryContext.Provider>;
}

export function useFeature(name: string): boolean {
  const values = useContext(FeatureFlagsContext);
  return Object.hasOwn(values, name) && values[name] === true;
}

/** Let a product API's 401 use RequiredRole's existing session cleanup and content removal. */
export function useSessionExpiry(): () => void {
  return useContext(SessionExpiryContext);
}
