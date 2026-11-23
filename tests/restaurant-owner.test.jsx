import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RestaurantOwnerPage from "../app/(pages)/restaurant-owner/page";

const { replace, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { push: vi.fn(), replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const dish = {
  id: "dish-1",
  nameDa: "Burger",
  descriptionDa: "Med ost",
  nameEn: null,
  descriptionEn: null,
  priceDkkInclVat: 99,
  available: true,
};
const menus = [
  { id: "menu-1", name: "Dinner", products: [dish] },
  { id: "menu-2", name: "Lunch", products: [{ ...dish, id: "dish-2", nameDa: "Salad" }] },
];

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockOwnerRequests() {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ role: "RESTAURANT_OWNER" }))
    .mockResolvedValueOnce(response(menus));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function fillCreateForm(user) {
  await user.click(await screen.findByRole("button", { name: "Create new dish" }));
  expect(screen.getByRole("dialog", { name: "Create new dish" })).toHaveAttribute("open");
  await user.type(screen.getByLabelText("Dish name (Danish)"), "Soup");
  await user.type(screen.getByLabelText("Description (Danish)"), "Tomato soup");
  await user.type(screen.getByLabelText("Price (DKK, including VAT)"), "49.50");
}

describe("Restaurant owner menu management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "owner-token");
    localStorage.setItem("role", "RESTAURANT_OWNER");
  });
  afterEach(() => vi.unstubAllGlobals());

  // -------------------------------------- Loads menus, selects the first menu, and switches the displayed dishes. --------------------------------------
  it("receives menus, selects the first menu, and displays the clicked menu's dishes", async () => {
    const fetch = mockOwnerRequests();
    const user = userEvent.setup();
    render(<RestaurantOwnerPage />);

    expect(await screen.findByRole("button", { name: "Dinner" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Burger/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/owner/menus", {
      method: "GET",
      headers: { Authorization: "Bearer owner-token" },
    });
    await user.click(screen.getByRole("button", { name: "Lunch" }));
    expect(screen.getByRole("button", { name: "Lunch" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Salad/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Burger/ })).not.toBeInTheDocument();
  });

  // -------------------------------------- Creates a dish as an authenticated owner and refreshes the dish list. --------------------------------------
  it("creates a dish as an authenticated owner and refreshes the displayed dishes", async () => {
    const created = { ...dish, id: "dish-3", nameDa: "Soup", descriptionDa: "Tomato soup", nameEn: "", descriptionEn: "", priceDkkInclVat: 49.5 };
    const fetch = mockOwnerRequests()
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(response([{ ...menus[0], products: [dish, created] }, menus[1]]));
    const user = userEvent.setup();
    render(<RestaurantOwnerPage />);
    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: "Save dish" }));

    expect(await screen.findByRole("button", { name: /Soup/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/owner/menus/menu-1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner-token" },
      body: JSON.stringify({ nameDa: "Soup", nameEn: "", descriptionDa: "Tomato soup", descriptionEn: "", priceDkkInclVat: 49.5, available: true }),
    });
    expect(screen.queryByRole("button", { name: "Save dish" })).not.toBeInTheDocument();
  });

  // -------------------------------------- Shows creation errors for network, server, and validation failures. --------------------------------------
  it.each([
    ["network failure", null, "Could not connect to the server"],
    ["server failure", 503, "Service unavailable"],
    ["validation failure", 400, "nameDa is required"],
  ])("shows an error when creation encounters a %s", async (_, status, message) => {
    const fetch = mockOwnerRequests();
    if (status === null) fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else fetch.mockResolvedValueOnce(response({ message }, status));
    const user = userEvent.setup();
    render(<RestaurantOwnerPage />);
    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: "Save dish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Dish name (Danish)")).toHaveValue("Soup");
    expect(screen.getByRole("button", { name: "Save dish" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------- Sends edited dish values to the backend and refreshes the displayed dish. --------------------------------------
  it("sends edited dish values to the backend and displays its refreshed response", async () => {
    const updated = { ...dish, nameDa: "Updated burger", priceDkkInclVat: 125, available: false, nameEn: "Cheeseburger", descriptionEn: "With cheese" };
    const fetch = mockOwnerRequests()
      .mockResolvedValueOnce(response(updated))
      .mockResolvedValueOnce(response([{ ...menus[0], products: [updated] }, menus[1]]));
    const user = userEvent.setup();
    render(<RestaurantOwnerPage />);
    await user.click(await screen.findByRole("button", { name: /Burger/ }));
    expect(screen.getByLabelText("Dish name (Danish)")).toHaveValue("Burger");
    await user.clear(screen.getByLabelText("Dish name (Danish)"));
    await user.type(screen.getByLabelText("Dish name (Danish)"), "Updated burger");
    await user.clear(screen.getByLabelText("Price (DKK, including VAT)"));
    await user.type(screen.getByLabelText("Price (DKK, including VAT)"), "125");
    await user.type(screen.getByLabelText("Dish name (English, optional)"), "Cheeseburger");
    await user.type(screen.getByLabelText("Description (English, optional)"), "With cheese");
    await user.click(screen.getByRole("checkbox", { name: "Available to order" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Updated burger/ })).toBeInTheDocument();
    const [, options] = fetch.mock.calls.find(([, options]) => options.method === "PUT");
    expect(fetch).toHaveBeenCalledWith("/api/owner/menus/menu-1/products/dish-1", options);
    expect(options.headers.Authorization).toBe("Bearer owner-token");
    expect(JSON.parse(options.body)).toEqual({
      nameDa: "Updated burger", descriptionDa: "Med ost", nameEn: "Cheeseburger",
      descriptionEn: "With cheese", priceDkkInclVat: 125, available: false,
    });
  });

  // -------------------------------------- Blocks customers, couriers, and admins despite a stored owner role. --------------------------------------
  it.each([
    ["CUSTOMER", "/customer"],
    ["COURIER", "/courier"],
    ["ADMIN", "/admin"],
  ])("blocks %s even when local storage claims the owner role", async (role, path) => {
    const fetch = vi.fn().mockResolvedValue(response({ role }));
    vi.stubGlobal("fetch", fetch);
    render(<RestaurantOwnerPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(path));
    expect(screen.queryByRole("region", { name: "Manage menus" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create new dish" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/auth/me", { headers: { Authorization: "Bearer owner-token" } });
  });

  // -------------------------------------- Redirects visitors without a token without making backend requests. --------------------------------------
  it("redirects visitors without a token before making any requests", async () => {
    localStorage.clear();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<RestaurantOwnerPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/login"));
    expect(screen.queryByRole("button", { name: "Create new dish" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});


