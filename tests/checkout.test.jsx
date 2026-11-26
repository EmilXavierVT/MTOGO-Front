import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Checkout from "../app/(pages)/customer/components/Checkout";
import DisplayRestaurant from "../app/(pages)/customer/components/DisplayRestaurant";
import OrderPage from "../app/(pages)/customer/orders/[orderId]/page";

const { router, onComplete } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() }, onComplete: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router, useParams: () => ({ orderId: "order-1" }),
  usePathname: () => "/customer/orders/order-1" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));

const restaurant = { id: "r1", address: "Valby Langgade 1" };
const cart = [
  { restaurantId: "r1", dish: { id: "burger", nameDa: "Burger", priceDkkInclVat: 50 }, quantity: 2 },
  { restaurantId: "r1", dish: { id: "salad", nameDa: "Salad", priceDkkInclVat: 20 }, quantity: 1 },
];
const savedOrder = {
  id: "order-1", status: "PENDING", total: 120,
  restaurant: { ...restaurant, name: "Valby Kitchen" },
  customerName: "Ada Customer", customerPhone: "12345678", deliveryAddress: "Delivery Street 10",
  lines: cart.map((item) => ({ productId: item.dish.id, productName: item.dish.nameDa,
    quantity: item.quantity, unitPrice: item.dish.priceDkkInclVat,
    lineTotal: item.quantity * item.dish.priceDkkInclVat })),
};
function response(status, body) {
  return { ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body) };
}
function Harness({ initialCart = cart }) {
  const [items, setItems] = useState(initialCart);
  return <Checkout cart={items} restaurant={restaurant} onCartChange={setItems}
    onBack={vi.fn()} onComplete={onComplete} />;
}
async function fillDetails(user) {
  await user.type(screen.getByLabelText("Name"), "Ada Customer");
  await user.type(screen.getByLabelText("Phone"), "12345678");
  await user.type(screen.getByLabelText("Delivery address"), "Delivery Street 10");
}
const payButton = () => screen.getByRole("button", { name: /^Pay / });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("token", "customer-token");
});

describe("Customer checkout", () => {
  it("opens checkout for the cart's restaurant even after browsing another restaurant, and clears a completed cart", async () => {
    global.fetch = vi.fn((url) => {
      if (url === "/api/restaurants") return Promise.resolve(response(200, [restaurant, { id: "r2", address: "Other restaurant" }]));
      if (url.endsWith("/r1/menus")) return Promise.resolve(response(200, [{ id: "menu", name: "Lunch",
        products: [{ ...cart[0].dish, available: true }] }]));
      if (url.endsWith("/r2/menus")) return Promise.resolve(response(200, []));
      return Promise.resolve(response(201, savedOrder));
    });
    const user = userEvent.setup();
    render(<DisplayRestaurant />);
    await user.click(await screen.findByRole("button", { name: /Valby Langgade 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add Burger to cart" }));
    await user.click(screen.getByRole("button", { name: /Other restaurant/ }));
    await user.click(screen.getByRole("button", { name: "Continue to checkout" }));
    const checkout = screen.getByRole("region", { name: "Checkout" });
    expect(within(checkout).getByText("Valby Langgade 1")).toBeInTheDocument();
    expect(within(checkout).queryByText("Other restaurant")).not.toBeInTheDocument();
    await fillDetails(user);
    await user.click(payButton());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/customer/orders/order-1"));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("shows the VAT-inclusive total and sends contact details, quantities, accepted total and simulation result", async () => {
    global.fetch = vi.fn().mockResolvedValue(response(201, savedOrder));
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Total incl. VAT")).toBeInTheDocument();
    expect(payButton()).toHaveTextContent("120,00");
    await user.click(payButton());
    expect(global.fetch).not.toHaveBeenCalled();
    await fillDetails(user);
    await user.click(payButton());

    expect(global.fetch).toHaveBeenCalledWith("/api/customer/orders", {
      method: "POST", cache: "no-store",
      headers: { Authorization: "Bearer customer-token", "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: "r1", products: [{ productId: "burger", quantity: 2 },
        { productId: "salad", quantity: 1 }], name: "Ada Customer", phone: "12345678",
      address: "Delivery Street 10", acceptedTotal: 120, simulatedPaymentResult: "APPROVED" }),
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("requires a fresh explicit acceptance for every changed price and never retries automatically", async () => {
    const quote = (unitPrice) => response(409, { code: "PRICE_CHANGED", error: "Total changed",
      updatedTotal: unitPrice * 2 + 20,
      products: [{ productId: "burger", productName: "Burger", unitPrice },
        { productId: "salad", productName: "Salad", unitPrice: 20 }] });
    global.fetch = vi.fn().mockResolvedValueOnce(quote(60)).mockResolvedValueOnce(quote(70))
      .mockResolvedValueOnce(response(201, savedOrder));
    const user = userEvent.setup();
    render(<Harness />);
    await fillDetails(user);
    await user.click(payButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Prices changed");
    expect(screen.getByText(/2 × 60,00/)).toBeInTheDocument();
    expect(payButton()).toHaveTextContent("140,00");
    expect(payButton()).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("checkbox"));
    await user.click(payButton());
    expect(payButton()).toHaveTextContent("160,00");
    expect(payButton()).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("checkbox"));
    await user.click(payButton());
    expect(global.fetch.mock.calls.map(([, options]) => JSON.parse(options.body).acceptedTotal)).toEqual([120, 140, 160]);
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Customer");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it.each([409, 404])("identifies an unavailable or removed dish (%s) and lets the customer remove it", async (status) => {
    global.fetch = vi.fn().mockResolvedValueOnce(response(status, {
      code: "PRODUCT_UNAVAILABLE", error: "Unavailable", productId: "burger",
    })).mockResolvedValueOnce(response(201, savedOrder));
    const user = userEvent.setup();
    render(<Harness />);
    await fillDetails(user);
    await user.click(payButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Burger is no longer available");
    expect(payButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove Burger" }));
    expect(payButton()).toHaveTextContent("20,00");
    expect(payButton()).toBeEnabled();
    await user.click(payButton());
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).products).toEqual([{ productId: "salad", quantity: 1 }]);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("keeps the cart and delivery details when the payment simulation is declined", async () => {
    global.fetch = vi.fn().mockResolvedValue(response(402, { error: "Simulated payment declined" }));
    const user = userEvent.setup();
    render(<Harness />);
    await fillDetails(user);
    await user.selectOptions(screen.getByLabelText("Payment simulation"), "DECLINED");
    await user.click(payButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("No order was created");
    expect(screen.getByLabelText("Delivery address")).toHaveValue("Delivery Street 10");
    expect(screen.getByText("Burger")).toBeInTheDocument();
    expect(payButton()).toBeEnabled();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).simulatedPaymentResult).toBe("DECLINED");
    expect(onComplete).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions while payment is pending", async () => {
    let finish;
    global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<Harness />);
    await fillDetails(user);
    await user.dblClick(payButton());
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Placing order..." })).toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    await act(async () => finish(response(201, savedOrder)));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledOnce();
  });

  it("preserves input on a connection failure and allows a deliberate retry", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response(201, savedOrder));
    const user = userEvent.setup();
    render(<Harness />);
    await fillDetails(user);
    await user.click(payButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.getByLabelText("Phone")).toHaveValue("12345678");
    expect(onComplete).not.toHaveBeenCalled();
    await user.click(payButton());
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("adds prices in whole øre before sending the accepted total", async () => {
    global.fetch = vi.fn().mockResolvedValue(response(201, savedOrder));
    const user = userEvent.setup();
    render(<Harness initialCart={cart.map((item, index) => ({ ...item, quantity: 1,
      dish: { ...item.dish, priceDkkInclVat: index === 0 ? 0.1 : 0.2 } }))} />);
    await fillDetails(user);
    await user.click(payButton());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).acceptedTotal).toBe(0.3);
  });
});

describe("Saved order confirmation", () => {
  it("reloads the saved order with restaurant, status, contact details and snapshots through GET only", async () => {
    global.fetch = vi.fn((url) => Promise.resolve(response(200,
      url === "/api/auth/me" ? { role: "CUSTOMER" } : savedOrder)));
    const first = render(<OrderPage />);
    expect(await screen.findByRole("heading", { name: "Valby Kitchen" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Awaiting restaurant");
    expect(screen.getByText("Delivery Street 10")).toBeInTheDocument();
    expect(screen.getByText(/2 × 50,00/)).toBeInTheDocument();
    first.unmount();
    render(<OrderPage />);
    expect(await screen.findByRole("heading", { name: "Valby Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("Ada Customer")).toBeInTheDocument();
    expect(global.fetch.mock.calls.filter(([url]) => url === "/api/customer/orders/order-1")).toHaveLength(2);
    expect(global.fetch.mock.calls.every(([url, options]) => url === "/api/auth/me" || options.method === "GET")).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith("/api/customer/orders/order-1", {
      method: "GET", cache: "no-store", headers: { Authorization: "Bearer customer-token" },
    });
  });

  it("does not load orders for a non-customer account", async () => {
    global.fetch = vi.fn().mockResolvedValue(response(200, { role: "COURIER" }));
    render(<OrderPage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/courier"));
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Saved order" })).not.toBeInTheDocument();
  });

  it("shows an account-specific message for an inaccessible order", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(response(200, { role: "CUSTOMER" }))
      .mockResolvedValueOnce(response(404, { error: "Order not found" }));
    render(<OrderPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be found for your account");
    expect(screen.queryByText("Ada Customer")).not.toBeInTheDocument();
  });
});
