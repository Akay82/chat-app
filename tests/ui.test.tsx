import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("../src/firebase", () => ({ configured: false, auth: {} }));
vi.mock("../src/session", () => ({ useSession: () => ({ user: null }) }));
import Auth from "../src/pages/Auth";
afterEach(cleanup);
describe("unconfigured app", () => {
  it("shows setup steps rather than fake accounts", () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );
    expect(screen.getByText("Connect your Firebase project")).toBeTruthy();
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });
});
