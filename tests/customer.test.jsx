import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DisplayRestaurant from "../app/(pages)/customer/components/DisplayRestaurant";

const restaurants = [
  { id: "r1", address: "Valby Langgade 1", rating: 4.5 },
  { id: "r2", address: "Nørrebrogade 10", rating: 4.1 },
];

const burgerMenu = [
  {
    id: "m1",
    name: "Frokost",
    products: [
      { id: "d1", nameDa: "Burger", descriptionDa: "Med pommes", priceDkkInclVat: 109, available: true },
      { id: "d2", nameDa: "Milkshake", descriptionDa: "Vanilje", priceDkkInclVat: 45, available: false },
    ],
  },
];

const pizzaMenu = [
  {
    id: "m2",
    name: "Aften",
    products: [
      { id: "d3", nameDa: "Pizza", descriptionDa: "Margherita", priceDkkInclVat: 89, available: true },
    ],
  },
];

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("DisplayRestaurant", () => {
  beforeEach(() => {
    localStorage.setItem("token", "customer-token");
  });

  it("shows the menu when a restaurant is selected", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu));

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));

    expect(await screen.findByText("Burger")).toBeInTheDocument();
    expect(screen.getByText("All prices include VAT.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/restaurants/r1/menus", expect.anything());
  });

  it("adds a dish to the cart and changes the quantity", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu));

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add Burger to cart" }));
    await user.click(screen.getByRole("button", { name: "Add one Burger" }));

    const cart = screen.getByRole("complementary", { name: "Cart" });
    expect(within(cart).getByText("2")).toBeInTheDocument();
    expect(within(cart).getAllByText(/218/)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remove one Burger" }));
    await user.click(screen.getByRole("button", { name: "Remove one Burger" }));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("only allows dishes from one restaurant in the cart", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu))
      .mockResolvedValueOnce(mockResponse(200, pizzaMenu));

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add Burger to cart" }));
    await user.click(screen.getByRole("button", { name: /Nørrebrogade 10/ }));
    await user.click(await screen.findByRole("button", { name: "Add Pizza to cart" }));

    const cart = screen.getByRole("complementary", { name: "Cart" });
    expect(within(cart).getByRole("alert")).toHaveTextContent("one restaurant per order");
    expect(within(cart).getByText("Burger")).toBeInTheDocument();
    expect(within(cart).queryByText("Pizza")).not.toBeInTheDocument();
  });

  it.each(["success", "failure"])("ignores a stale menu %s after switching restaurants", async (outcome) => {
    let resolveFirst;
    const firstMenu = new Promise((resolve) => { resolveFirst = resolve; });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockReturnValueOnce(firstMenu)
      .mockResolvedValueOnce(mockResponse(200, pizzaMenu))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu));

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading menus...");
    await user.click(screen.getByRole("button", { name: /Nørrebrogade 10/ }));
    await user.click(await screen.findByRole("button", { name: "Add Pizza to cart" }));

    await act(async () => resolveFirst(outcome === "success"
      ? mockResponse(200, burgerMenu)
      : mockResponse(503, { error: "Old menu failed" })));

    expect(screen.getByRole("button", { name: /Nørrebrogade 10/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Add Pizza to cart" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Burger to cart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Valby Langgade 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add Burger to cart" }));
    const cart = screen.getByRole("complementary", { name: "Cart" });
    expect(within(cart).getByRole("alert")).toHaveTextContent("one restaurant per order");
    expect(within(cart).getByText("Pizza")).toBeInTheDocument();
    expect(within(cart).queryByText("Burger")).not.toBeInTheDocument();
  });

  it.each(["server", "network"])("preserves the cart and retries after a menu %s error", async (failure) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu));
    if (failure === "server") {
      fetch.mockResolvedValueOnce(mockResponse(503, { error: "Menu service unavailable" }));
    } else {
      fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    }
    fetch.mockResolvedValueOnce(mockResponse(200, pizzaMenu));
    global.fetch = fetch;

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add Burger to cart" }));
    await user.click(screen.getByRole("button", { name: /Nørrebrogade 10/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(failure === "server"
      ? "Menu service unavailable" : "Could not connect to the server");
    const cart = screen.getByRole("complementary", { name: "Cart" });
    expect(within(cart).getByText("Burger")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Valby Langgade 1/ })).toBeEnabled();
    await user.click(within(cart).getByRole("button", { name: "Add one Burger" }));
    expect(within(cart).getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry menu" }));
    expect(await screen.findByRole("button", { name: "Add Pizza to cart" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(cart).getByText("Burger")).toBeInTheDocument();
    expect(within(cart).getByText("2")).toBeInTheDocument();
  });

  it("does not let the customer add a unavailable dish", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(200, restaurants))
      .mockResolvedValueOnce(mockResponse(200, burgerMenu));

    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));

    expect(await screen.findByText("Sold out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Milkshake to cart" })).not.toBeInTheDocument();
  });

  it("shows an error when the restaurants cannot be loaded", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(500, { error: "Could not load restaurants" }));

    render(<DisplayRestaurant />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load restaurants");
  });
});
