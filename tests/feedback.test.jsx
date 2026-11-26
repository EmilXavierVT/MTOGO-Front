import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerFeedback from "../app/(pages)/customer/components/CustomerFeedback";
import FeedbackOrders from "../app/(pages)/customer/components/FeedbackOrders";
import OrderConfirmation from "../app/(pages)/customer/components/OrderConfirmation";
import { FeatureFlagsProvider } from "../app/features/FeatureFlagsProvider";

const { router, expireSession } = vi.hoisted(() => ({ router: { replace: vi.fn() }, expireSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router,
  usePathname: () => "/customer/orders/order-1", useParams: () => ({ orderId: "order-1" }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));

const order = { id: "order-1", status: "DELIVERED", total: 150,
  restaurant: { id: "restaurant-1", name: "Test kitchen", address: "Test street 1" },
  customerName: "Saved customer", customerPhone: "12345678", deliveryAddress: "Saved address", lines: [] };
const empty = { orderId: order.id, deliveryId: "delivery-1", courierId: "courier-1",
  courierName: "Ada Courier", feedback: null };
const saved = { ...empty, feedback: { id: "feedback-1", foodRating: 5, overallExperienceRating: 4, courierRating: 3 } };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function mockApi({ capability = true, feedback = empty, readStatus = 200, post, orders = [] } = {}) {
  global.fetch = vi.fn(async (url, options) => {
    if (url === "/api/auth/me") return response(200, { role: "CUSTOMER" });
    if (url === "/api/features") return response(200, { customerFeedback: capability });
    if (url === "/api/customer/orders") return response(200, orders);
    if (url.endsWith("/feedback")) {
      if (options.method === "POST") return post ? post() : response(201, saved);
      return response(readStatus, feedback);
    }
    if (url === "/api/customer/orders/order-1") return response(200, order);
    throw new Error(`Unexpected request: ${url}`);
  });
}
function Fixture({ value = order, children }) {
  return <FeatureFlagsProvider token="customer-token" onUnauthorized={expireSession}>
    {children || <CustomerFeedback order={value} />}
  </FeatureFlagsProvider>;
}
async function fill(user) {
  await user.selectOptions(await screen.findByLabelText("Food"), "5");
  await user.selectOptions(screen.getByLabelText("Overall experience"), "4");
  await user.selectOptions(screen.getByLabelText("Courier — Ada Courier"), "3");
}
const posts = () => global.fetch.mock.calls.filter(([, options]) => options.method === "POST");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("token", "customer-token");
});

describe("Customer delivery feedback", () => {
  it.each([false, undefined, "true", 1])("hides the form and entry point when capability is %s", async (capability) => {
    mockApi({ capability: capability === undefined ? null : capability });
    render(<Fixture><CustomerFeedback order={order} /><FeedbackOrders /></Fixture>);
    await act(async () => {});
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/features"]);
  });

  it.each(["PENDING", "ACCEPTED", "READY_FOR_DELIVERY", "UNDER_DELIVERY", "REJECTED", "CANCELLED"])(
    "offers no feedback before a delivered order (%s)", async (status) => {
      mockApi();
      render(<Fixture value={{ ...order, status }} />);
      await act(async () => {});
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("requires all three ratings, saves once, shows the persisted courier and retains the result on reload", async () => {
    mockApi();
    const user = userEvent.setup();
    const view = render(<Fixture />);
    await user.click(await screen.findByRole("button", { name: "Submit feedback" }));
    expect(posts()).toHaveLength(0);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(await screen.findByText("Your saved ratings")).toBeInTheDocument();
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    expect(screen.getByText("Ada Courier")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    const [url, options] = posts()[0];
    expect(url).toBe("/api/customer/orders/order-1/feedback");
    expect(options.headers.Authorization).toBe("Bearer customer-token");
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body)).toEqual({ foodRating: 5, overallExperienceRating: 4, courierRating: 3 });
    view.unmount();
    mockApi({ feedback: saved });
    render(<Fixture />);
    expect(await screen.findByText("Your saved ratings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit feedback" })).not.toBeInTheDocument();
  });

  it("disables submissions while the first save is pending", async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    mockApi({ post: () => pending });
    const user = userEvent.setup();
    render(<Fixture />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(screen.getByRole("button", { name: "Saving feedback..." })).toBeDisabled();
    expect(screen.getByLabelText("Food")).toBeDisabled();
    expect(posts()).toHaveLength(1);
    await act(async () => resolve(response(201, saved)));
    expect(await screen.findByText("Your saved ratings")).toBeInTheDocument();
  });

  it("rereads a duplicate without retrying the write or replacing saved ratings", async () => {
    let duplicate = false;
    mockApi({ post: () => { duplicate = true; return response(409, { error: "Feedback already submitted" }); } });
    const original = global.fetch;
    global.fetch = vi.fn((url, options) => url.endsWith("/feedback") && options.method === "GET" && duplicate
      ? Promise.resolve(response(200, saved)) : original(url, options));
    const user = userEvent.setup();
    render(<Fixture />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(await screen.findByText("Your saved ratings")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("handles flag switch-off between loading and saving while keeping the order visible", async () => {
    mockApi({ post: () => response(404, { error: "Feature unavailable" }) });
    const user = userEvent.setup();
    render(<OrderConfirmation />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(await screen.findByText(/Feedback is currently unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saved order" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it.each([403, 409, 500])("handles a refused or failed feedback read (%s)", async (readStatus) => {
    mockApi({ readStatus, feedback: { error: "Unavailable" } });
    render(<Fixture />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(expireSession).not.toHaveBeenCalled();
  });

  it("checks the saved result after a lost POST response before offering another write", async () => {
    mockApi({ post: () => Promise.reject(new TypeError("Network failed")) });
    const user = userEvent.setup();
    render(<Fixture />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm your feedback");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    mockApi({ feedback: saved });
    await user.click(screen.getByRole("button", { name: "Reload feedback" }));
    expect(await screen.findByText("Your saved ratings")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it.each(["read", "save"])("expires the whole private view when the feedback %s returns 401", async (stage) => {
    mockApi(stage === "read" ? { readStatus: 401, feedback: { error: "Expired" } }
      : { post: () => response(401, { error: "Expired" }) });
    sessionStorage.setItem("token", "old-token");
    localStorage.setItem("role", "CUSTOMER");
    sessionStorage.setItem("role", "CUSTOMER");
    render(<OrderConfirmation />);
    if (stage === "save") {
      const user = userEvent.setup();
      await fill(user);
      await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    }
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/auth/login"));
    expect(screen.queryByRole("region", { name: "Saved order" })).not.toBeInTheDocument();
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem("token")).toBeNull();
      expect(storage.getItem("role")).toBeNull();
    }
  });

  it("discards an obsolete feedback read on order change", async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    mockApi();
    const original = global.fetch;
    global.fetch = vi.fn((url, options) => url.includes("order-1/feedback") ? pending : original(url, options));
    const { rerender } = render(<Fixture />);
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.endsWith("order-1/feedback"))).toBe(true));
    rerender(<Fixture value={{ ...order, id: "order-2" }} />);
    await screen.findByRole("button", { name: "Submit feedback" });
    await act(async () => resolve(response(200, saved)));
    expect(screen.queryByText("Your saved ratings")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeInTheDocument();
  });

  it("links delivered orders from the customer page and omits incomplete orders", async () => {
    mockApi({ orders: [order, { ...order, id: "pending-order", status: "PENDING" }] });
    render(<Fixture><FeedbackOrders /></Fixture>);
    const region = await screen.findByRole("region", { name: "Delivered orders" });
    const link = await within(region).findByRole("link", { name: "View feedback" });
    expect(link).toHaveAttribute("href", "/customer/orders/order-1");
    expect(screen.queryByText(/pending-order/)).not.toBeInTheDocument();
  });
});
