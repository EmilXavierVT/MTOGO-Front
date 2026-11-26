import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsProvider, useFeature } from "../app/features/FeatureFlagsProvider";
import { PUBLIC_CAPABILITY_NAMES } from "../app/features/catalog";
import RequiredRole from "../app/components/RequiredRole";

const navigation = vi.hoisted(() => ({ pathname: "/customer", router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));

const NAMES = Object.freeze(["testCapability", "otherCapability"]);
const expired = vi.fn();
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function Controls() {
  const enabled = useFeature("testCapability");
  const unknown = useFeature("unknownCapability");
  const other = useFeature("otherCapability");
  return <>
    <button>Existing action</button>
    <button disabled={!enabled}>Future action</button>
    <button disabled={!unknown}>Unknown action</button>
    <button disabled={!other}>Other action</button>
  </>;
}
function Fixture({ token = "test-token", names = NAMES }) {
  return <FeatureFlagsProvider token={token} capabilityNames={names} onUnauthorized={expired}>
    <Controls />
  </FeatureFlagsProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  navigation.pathname = "/customer";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Runtime feature capabilities", () => {
  it("explicitly enrolls customer feedback and defaults off outside a provider", async () => {
    expect(PUBLIC_CAPABILITY_NAMES).toEqual(["customerFeedback"]);
    render(<Controls />);
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Existing action" })).toBeEnabled();
  });

  it("ignores backend flags that are not enrolled in the production allowlist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ testCapability: true, unknownCapability: true })));
    render(<FeatureFlagsProvider token="test-token" onUnauthorized={expired}><Controls /></FeatureFlagsProvider>);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unknown action" })).toBeDisabled();
  });

  it("fetches authenticated runtime values and enables only explicit known true values", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ testCapability: true, otherCapability: "true", unknownCapability: true }));
    vi.stubGlobal("fetch", fetch);
    render(<Fixture />);
    expect(await screen.findByRole("button", { name: "Existing action" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Future action" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Other action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unknown action" })).toBeDisabled();
    expect(fetch).toHaveBeenCalledWith("/api/features", expect.objectContaining({
      headers: { Authorization: "Bearer test-token" }, cache: "no-store", signal: expect.any(AbortSignal),
    }));
  });

  it.each([{}, { testCapability: false }, { testCapability: 1 }, { testCapability: null }, null, [], "true"])(
    "keeps new controls disabled for missing, false or malformed capabilities (%j)", async (payload) => {
      const fetch = vi.fn().mockResolvedValue(response(payload));
      vi.stubGlobal("fetch", fetch);
      render(<Fixture />);
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Existing action" })).toBeEnabled();
      expect(expired).not.toHaveBeenCalled();
    },
  );

  it.each([403, 404, 500, 503])("tolerates an older or unavailable backend (HTTP %i)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "Unavailable" }, status)));
    render(<Fixture />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Existing action" })).toBeEnabled();
    expect(expired).not.toHaveBeenCalled();
  });

  it.each(["network", "json"])("tolerates a %s failure", async (failure) => {
    vi.stubGlobal("fetch", failure === "network"
      ? vi.fn().mockRejectedValue(new TypeError("Offline"))
      : vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("Invalid JSON"); } }));
    render(<Fixture />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Existing action" })).toBeEnabled();
    expect(expired).not.toHaveBeenCalled();
  });

  it.each([403, 404, 503])("keeps authenticated existing content available when capabilities return %i", async (status) => {
    sessionStorage.setItem("token", "customer-token");
    vi.stubGlobal("fetch", vi.fn((url) => Promise.resolve(url === "/api/auth/me"
      ? response({ role: "CUSTOMER" }) : response({ error: "Unavailable" }, status))));
    render(<RequiredRole role="CUSTOMER"><p>Existing customer content</p></RequiredRole>);
    expect(await screen.findByText("Existing customer content")).toBeInTheDocument();
    await act(async () => {});
    expect(sessionStorage.getItem("token")).toBe("customer-token");
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it("clears stale capabilities on token or route changes and ignores superseded requests", async () => {
    let resolveOld;
    const oldRequest = new Promise((resolve) => { resolveOld = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(response({ testCapability: true }))
      .mockReturnValueOnce(oldRequest).mockResolvedValueOnce(response({ testCapability: false }));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<Fixture />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Future action" })).toBeEnabled());
    rerender(<Fixture token="new-token" />);
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    navigation.pathname = "/customer/orders/next";
    rerender(<Fixture token="new-token" />);
    await act(async () => resolveOld(response({ testCapability: true })));
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("aborts on timeout and ignores a late response even if fetch disregards abort", async () => {
    vi.useFakeTimers();
    let resolveRequest;
    const pending = new Promise((resolve) => { resolveRequest = resolve; });
    const fetch = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetch);
    render(<Fixture />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveRequest(response({ testCapability: true })));
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Existing action" })).toBeEnabled();
  });

  it.each(["token", "route"])("does not resurrect an old true snapshot when the %s cycles back", async (change) => {
    let resolveMiddle;
    let resolveLatest;
    const fetch = vi.fn().mockResolvedValueOnce(response({ testCapability: true }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveMiddle = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<Fixture />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Future action" })).toBeEnabled());
    if (change === "route") navigation.pathname = "/customer/other";
    rerender(<Fixture token={change === "token" ? "another-token" : "test-token"} />);
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    navigation.pathname = "/customer";
    rerender(<Fixture />);
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    await act(async () => resolveMiddle(response({ testCapability: true })));
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
    await act(async () => resolveLatest(response({ testCapability: false })));
    expect(screen.getByRole("button", { name: "Future action" })).toBeDisabled();
  });

  it("cancels on unmount without expiring a replacement session", async () => {
    let resolveRequest;
    const fetch = vi.fn().mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const { unmount } = render(<Fixture />);
    unmount();
    await act(async () => resolveRequest(response({}, 401)));
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(expired).not.toHaveBeenCalled();
  });

  it("removes private content and clears both session stores when the capability request returns 401", async () => {
    localStorage.setItem("token", "expired-token");
    sessionStorage.setItem("token", "expired-token");
    localStorage.setItem("role", "CUSTOMER");
    sessionStorage.setItem("role", "CUSTOMER");
    let resolveFeatures;
    const fetch = vi.fn((url) => url === "/api/auth/me"
      ? Promise.resolve(response({ role: "CUSTOMER" }))
      : new Promise((resolve) => { resolveFeatures = resolve; }));
    vi.stubGlobal("fetch", fetch);
    render(<RequiredRole role="CUSTOMER"><p>Private existing content</p></RequiredRole>);
    expect(await screen.findByText("Private existing content")).toBeInTheDocument();
    await act(async () => resolveFeatures(response({}, 401)));
    expect(screen.queryByText("Private existing content")).not.toBeInTheDocument();
    expect(navigation.router.replace).toHaveBeenCalledWith("/auth/login");
    for (const store of [localStorage, sessionStorage]) {
      expect(store.getItem("token")).toBeNull();
      expect(store.getItem("role")).toBeNull();
    }
  });
});
