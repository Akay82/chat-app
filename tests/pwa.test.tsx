import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
vi.mock("../src/session", () => ({ useSession: () => ({ user: null }) }));
import { Pwa } from "../src/pwa";
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("PWA installation discovery", () => {
  it("offers install instructions even when the browser never fires beforeinstallprompt", () => {
    render(<Pwa />);
    fireEvent.click(screen.getByRole("button", { name: "Install Gather ↗" }));
    expect(
      screen.getByRole("heading", { name: "Take Gather with you" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/hasn’t offered an automatic install prompt/),
    ).toBeTruthy();
    expect(screen.getByText(/In-app browser previews/)).toBeTruthy();
  });
  it("opens installation help from chat navigation", () => {
    render(<Pwa />);
    act(() => window.dispatchEvent(new Event("gather:install")));
    expect(
      screen.getByRole("heading", { name: "Take Gather with you" }),
    ).toBeTruthy();
  });
  it("uses the deferred browser prompt when available", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<Pwa />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Install Gather ↗" }));
    fireEvent.click(screen.getByRole("button", { name: "Install Gather" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Take Gather with you" }),
      ).toBeNull(),
    );
  });
  it("falls back to instructions if the install prompt fails", async () => {
    const prompt = vi.fn().mockRejectedValue(new Error("Unsupported"));
    render(<Pwa />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => window.dispatchEvent(event));
    fireEvent.click(screen.getByRole("button", { name: "Install Gather ↗" }));
    fireEvent.click(screen.getByRole("button", { name: "Install Gather" }));
    expect(
      await screen.findByText(/could not open its install prompt/),
    ).toBeTruthy();
  });
  it("hides the landing install button after appinstalled", () => {
    render(<Pwa />);
    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(
      screen.queryByRole("button", { name: "Install Gather ↗" }),
    ).toBeNull();
  });
});
