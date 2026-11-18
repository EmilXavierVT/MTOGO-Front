import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequiredRole from "../app/components/RequiredRole";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

function mockMeResponse(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function renderPage(role) {
  render(
    <RequiredRole role={role}>
      <h1>Secret page</h1>
    </RequiredRole>
  );
}

describe("RequiredRole", () => {
  beforeEach(() => replace.mockClear());

  it("shows loading before the session is checked", () => {
    sessionStorage.setItem("token", "t");
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderPage("ADMIN");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("sends the user to login when there is no token", async () => {
    global.fetch = vi.fn();
    renderPage("ADMIN");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/login"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the session and sends to login when the token is expired", async () => {
    localStorage.setItem("token", "expired-token");
    localStorage.setItem("role", "ADMIN");
    mockMeResponse(401, { error: "Invalid or expired token" });
    renderPage("ADMIN");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/login"));
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("sends a user with the wrong role to their own page", async () => {
    localStorage.setItem("token", "customer-token");
    mockMeResponse(200, { role: "CUSTOMER" });
    renderPage("ADMIN");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/customer"));
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
  });

  it("shows the page when the backend confirms the role", async () => {
    sessionStorage.setItem("token", "admin-token");
    mockMeResponse(200, { role: "ADMIN" });
    renderPage("ADMIN");
    expect(await screen.findByText("Secret page")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/me", {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(replace).not.toHaveBeenCalled();
  });
});