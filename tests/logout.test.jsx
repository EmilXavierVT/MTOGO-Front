import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogoutButton from "../app/components/LogoutButton";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

describe("LogoutButton", () => {
  it("clears both storages and sends the user to login", async () => {
    localStorage.setItem("token", "remembered-token");
    localStorage.setItem("role", "ADMIN");
    sessionStorage.setItem("token", "session-token");
    sessionStorage.setItem("role", "CUSTOMER");

    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("role")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("role")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/auth/login");
  });
});