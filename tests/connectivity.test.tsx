import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useConnectivity, useKeyboardViewport } from "../src/connectivity";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("connection and keyboard handling", () => {
  it("updates connectivity from browser events", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    const { result } = renderHook(() => useConnectivity());
    expect(result.current).toBe(true);
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
  it("fits the chat to the keyboard viewport and restores styles on unmount", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 844,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { unmount } = renderHook(() => useKeyboardViewport());
    act(() => {
      viewport.height = 400;
      viewport.offsetTop = 20;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(
      document.documentElement.style.getPropertyValue("--chat-height"),
    ).toBe("400px");
    expect(document.documentElement.style.getPropertyValue("--chat-top")).toBe(
      "20px",
    );
    act(() => {
      viewport.scale = 2;
      viewport.height = 200;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(
      document.documentElement.style.getPropertyValue("--chat-height"),
    ).toBe("400px");
    unmount();
    expect(
      document.documentElement.style.getPropertyValue("--chat-height"),
    ).toBe("");
  });
});
