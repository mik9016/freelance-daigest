import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const loginSpy = vi.fn();

beforeEach(() => {
  vi.resetModules();
  loginSpy.mockReset();
  vi.doMock("../src/auth/oidc", () => ({
    login: loginSpy,
    initOidc: vi.fn().mockResolvedValue(undefined)
  }));
});

describe("Login", () => {
  it("renders Sign in button", async () => {
    const { default: Login } = await import("../src/pages/Login");
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("clicking button calls login once", async () => {
    const { default: Login } = await import("../src/pages/Login");
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Sign in"));
    await waitFor(() => expect(loginSpy).toHaveBeenCalledTimes(1));
  });
});