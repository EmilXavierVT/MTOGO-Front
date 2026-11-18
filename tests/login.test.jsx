import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../app/auth/login/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }) => <a href={href}>{children}</a>,
}));

function mockLoginResponse(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

async function login(email, password, remember = true) {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText("E-mail address"), email);
  await user.type(screen.getByLabelText("Password"), password);
  if (!remember) {
    await user.click(screen.getByRole("checkbox"));
  }
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage", () => {
  beforeEach(() => push.mockClear());

  it.each([
    ["CUSTOMER", "/customer"],
    ["COURIER", "/courier"],
    ["RESTAURANT_OWNER", "/restaurant-owner"],
    ["ADMIN", "/admin"],
  ])("sends %s to %s after login", async (role, path) => {
    mockLoginResponse(200, { token: "t", user: { role } });
    await login("a@test.dk", "password123");
    expect(push).toHaveBeenCalledWith(path);
  });

  it("shows an error and stores nothing when credentials aren't valid", async () => {
    mockLoginResponse(401, { error: "Invalid email or password" });
    await login("a@test.dk", "wrong");
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("replaces the remembered account when a new user logs in", async () => {
    localStorage.setItem("token", "admin-token");
    localStorage.setItem("role", "ADMIN");
    mockLoginResponse(200, { token: "customer-token", user: { role: "CUSTOMER" } });

    await login("c@test.dk", "password123", false);

    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBe("customer-token");
    expect(push).toHaveBeenCalledWith("/customer");
  });
});