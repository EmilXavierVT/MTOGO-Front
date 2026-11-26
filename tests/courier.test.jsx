import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CourierPage from "../app/(pages)/courier/page";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const offer = {
  orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderTime: "2026-11-26T12:00:00",
  restaurant: { id: "restaurant-1", name: "Havnekøkkenet", address: "Havnegade 10, København" },
};
const claimed = {
  id: "delivery-1", orderId: offer.orderId, status: "CLAIMED", restaurant: offer.restaurant,
  customerName: "Anna Jensen", customerPhone: "12345678", deliveryAddress: "Østerbrogade 12, 2. tv.",
  claimedTime: "2026-11-26T12:10:00", pickupTime: null,
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockOverview(delivery = null, offers = [offer]) {
  const available = vi.fn().mockResolvedValue(response(offers));
  const active = vi.fn().mockResolvedValue(response(delivery, delivery ? 200 : 204));
  const action = vi.fn();
  const fetch = vi.fn((url, options = {}) => {
    if (url === "/api/auth/me") return Promise.resolve(response({ role: "COURIER" }));
    if (url === "/api/courier/orders/available") return available();
    if (url === "/api/courier/delivery/active") return active();
    if (options.method === "POST") return action(url, options);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { available, active, action, fetch };
}

describe("Courier deliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem("token", "courier-token");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows ready orders and replaces an accepted offer with the courier's active delivery", async () => {
    const api = mockOverview();
    api.action.mockImplementation(async () => {
      api.available.mockResolvedValue(response([]));
      api.active.mockResolvedValue(response(claimed));
      return response({ id: claimed.id, orderId: offer.orderId, status: "CLAIMED" }, 201);
    });
    const user = userEvent.setup();
    render(<CourierPage />);

    expect(await screen.findByText("Havnekøkkenet")).toBeInTheDocument();
    expect(screen.getByText("Havnegade 10, København")).toBeInTheDocument();
    expect(screen.queryByText("Anna Jensen")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Overtag ordre aaaaaaaa" }));

    expect(await screen.findByText("Anna Jensen")).toBeInTheDocument();
    expect(screen.getByText("Østerbrogade 12, 2. tv.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "12345678" })).toHaveAttribute("href", "tel:12345678");
    expect(screen.getByRole("button", { name: "Markér som afhentet" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Markér som leveret" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Overtag ordre/ })).not.toBeInTheDocument();
    expect(api.fetch).toHaveBeenCalledWith(`/api/courier/orders/${offer.orderId}/delivery/accept`, expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer courier-token" },
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Opdatér oversigt" })).toBeEnabled());
  });

  it("restores an active delivery and allows pickup followed by delivery before another claim", async () => {
    const other = { ...offer, orderId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
    const api = mockOverview(claimed, [other]);
    api.action.mockImplementationOnce(async () => {
      api.active.mockResolvedValue(response({ ...claimed, status: "UNDER_DELIVERY", pickupTime: "2026-11-26T12:20:00" }));
      return response({ orderId: offer.orderId, status: "UNDER_DELIVERY" });
    }).mockImplementationOnce(async () => {
      api.active.mockResolvedValue(response(null, 204));
      return response({ orderId: offer.orderId, status: "DELIVERED" });
    });
    const user = userEvent.setup();
    render(<CourierPage />);

    expect(await screen.findByText("Anna Jensen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overtag ordre bbbbbbbb" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Markér som leveret" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Markér som afhentet" }));
    await user.click(await screen.findByRole("button", { name: "Markér som leveret" }));

    expect(await screen.findByText("Levering gennemført. Du kan nu overtage en ny ordre.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Overtag ordre bbbbbbbb" })).toBeEnabled();
    expect(screen.queryByText("Anna Jensen")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Markér som afhentet" })).not.toBeInTheDocument();
    expect(api.fetch).toHaveBeenCalledWith(`/api/courier/orders/${offer.orderId}/delivery/pickup`, expect.objectContaining({ method: "POST" }));
    expect(api.fetch).toHaveBeenCalledWith(`/api/courier/orders/${offer.orderId}/delivery/delivered`, expect.objectContaining({ method: "POST" }));
  });

  it.each([
    ["Order already assigned", "En anden har allerede overtaget ordren.", null],
    ["Courier already has an active delivery", "Du har allerede en aktiv levering.", claimed],
    ["Not ready to be delivered", "Ordren er ikke længere klar til afhentning.", null],
  ])("explains a claim conflict (%s) and reloads the actual delivery state", async (message, expected, current) => {
    const api = mockOverview();
    api.action.mockImplementation(async () => {
      api.available.mockResolvedValue(response([]));
      api.active.mockResolvedValue(response(current, current ? 200 : 204));
      return response({ error: message }, 409);
    });
    const user = userEvent.setup();
    render(<CourierPage />);
    await user.click(await screen.findByRole("button", { name: "Overtag ordre aaaaaaaa" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(await screen.findByText("Ingen ledige ordrer lige nu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Overtag ordre/ })).not.toBeInTheDocument();
    if (current) expect(screen.getByText("Anna Jensen")).toBeInTheDocument();
  });

  it("prevents a second claim while the first request is pending", async () => {
    const api = mockOverview();
    let finish;
    api.action.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<CourierPage />);
    const accept = await screen.findByRole("button", { name: "Overtag ordre aaaaaaaa" });
    await user.dblClick(accept);

    expect(accept).toBeDisabled();
    expect(screen.getByRole("button", { name: "Opdatér oversigt" })).toBeDisabled();
    expect(api.action).toHaveBeenCalledTimes(1);
    api.available.mockResolvedValue(response([]));
    finish(response({ error: "Order already assigned" }, 409));
    await waitFor(() => expect(screen.getByRole("button", { name: "Opdatér oversigt" })).toBeEnabled());
  });

  it("offers a manual retry after an initial network error", async () => {
    const api = mockOverview(null, []);
    api.available.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<CourierPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Kunne ikke kontakte serveren");
    await user.click(screen.getByRole("button", { name: "Opdatér oversigt" }));
    expect(await screen.findByText("Ingen ledige ordrer lige nu")).toBeInTheDocument();
    expect(screen.getByText("Du er klar til næste levering")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a fresh overview after an uncertain mutation and never retries the POST automatically", async () => {
    const api = mockOverview();
    api.action.mockImplementation(async () => {
      api.available.mockRejectedValueOnce(new TypeError("Network still down"));
      throw new TypeError("Connection lost after server saved the claim");
    });
    const user = userEvent.setup();
    render(<CourierPage />);
    await user.click(await screen.findByRole("button", { name: "Overtag ordre aaaaaaaa" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Oversigten kunne ikke opdateres");
    expect(screen.queryByRole("button", { name: /Overtag ordre/ })).not.toBeInTheDocument();
    expect(api.action).toHaveBeenCalledTimes(1);
    api.available.mockResolvedValue(response([]));
    api.active.mockResolvedValue(response(claimed));
    await user.click(screen.getByRole("button", { name: "Opdatér oversigt" }));
    expect(await screen.findByText("Anna Jensen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markér som afhentet" })).toBeEnabled();
    expect(api.action).toHaveBeenCalledTimes(1);
  });

  it("clears the session and private delivery details when login expires", async () => {
    const api = mockOverview(claimed, []);
    localStorage.setItem("token", "courier-token");
    localStorage.setItem("role", "COURIER");
    sessionStorage.setItem("role", "COURIER");
    const user = userEvent.setup();
    render(<CourierPage />);
    expect(await screen.findByText("Anna Jensen")).toBeInTheDocument();
    api.active.mockResolvedValue(response({ error: "Invalid or expired token" }, 401));
    await user.click(screen.getByRole("button", { name: "Opdatér oversigt" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/auth/login"));
    expect(screen.queryByText("Anna Jensen")).not.toBeInTheDocument();
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem("token")).toBeNull();
      expect(storage.getItem("role")).toBeNull();
    }
  });

  it("uses the backend role before requesting courier data", async () => {
    localStorage.setItem("role", "COURIER");
    const fetch = vi.fn().mockResolvedValue(response({ role: "CUSTOMER" }));
    vi.stubGlobal("fetch", fetch);
    render(<CourierPage />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/customer"));
    expect(screen.queryByRole("heading", { name: "Dine leveringer" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows only the delivery action when a picked up delivery is reloaded", async () => {
    mockOverview({ ...claimed, status: "UNDER_DELIVERY", pickupTime: "2026-11-26T12:20:00" }, []);
    render(<CourierPage />);
    expect(await screen.findByRole("button", { name: "Markér som leveret" })).toBeEnabled();
    expect(screen.getByText("På vej til kunden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Markér som afhentet" })).not.toBeInTheDocument();
  });
});
