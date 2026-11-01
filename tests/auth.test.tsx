import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({
  signup: vi.fn(),
  login: vi.fn(),
  verify: vi.fn(),
  reset: vi.fn(),
  google: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ configured: true, auth: {} }));
vi.mock("../src/session", () => ({ useSession: () => ({ user: null }) }));
vi.mock("../src/store", () => ({
  useSettings: { getState: () => ({ notify: mock.notify }) },
}));
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: mock.signup,
  signInWithEmailAndPassword: mock.login,
  sendEmailVerification: mock.verify,
  sendPasswordResetEmail: mock.reset,
  signInWithPopup: mock.google,
  GoogleAuthProvider: class {},
}));
import Auth from "../src/pages/Auth";
function open(mode = "login") {
  render(
    <MemoryRouter initialEntries={[`/auth/${mode}`]}>
      <Routes>
        <Route path="/auth/:mode" element={<Auth />} />
        <Route path="/" element={<p>Signed-in destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
function fill(password = "Local-test-only-123!") {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "alice@gather.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.signup.mockResolvedValue({ user: { uid: "alice" } });
  mock.login.mockResolvedValue({ user: { uid: "alice" } });
  mock.verify.mockResolvedValue(undefined);
  mock.reset.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("authentication forms", () => {
  it("rejects a short registration password without calling Firebase", async () => {
    open("register");
    fill("short");
    fireEvent.click(
      screen.getByRole("button", { name: "Create your account" }),
    );
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();
    expect(mock.signup).not.toHaveBeenCalled();
  });
  it("signs in an existing account with a six-character password", async () => {
    open();
    fill("six123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in to Gather" }));
    expect(await screen.findByText("Signed-in destination")).toBeTruthy();
    expect(mock.login).toHaveBeenCalledWith(
      expect.anything(),
      "alice@gather.test",
      "six123",
    );
  });
  it("shows wrong-password feedback and lets the user retry", async () => {
    mock.login.mockRejectedValueOnce({ code: "auth/invalid-credential" });
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to Gather" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "The email or password is incorrect.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in to Gather" }));
    expect(await screen.findByText("Signed-in destination")).toBeTruthy();
  });
  it("keeps successful signup when verification delivery fails", async () => {
    mock.verify.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    open("register");
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Create your account" }),
    );
    expect(await screen.findByText("Signed-in destination")).toBeTruthy();
    expect(mock.notify).toHaveBeenCalledWith(
      expect.stringContaining("Your account was created."),
    );
    expect(mock.signup).toHaveBeenCalledTimes(1);
  });
  it("prevents duplicate signup while a submission is pending", async () => {
    mock.signup.mockReturnValue(new Promise(() => {}));
    open("register");
    fill();
    const form = screen
      .getByRole("button", { name: "Create your account" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mock.signup).toHaveBeenCalledTimes(1));
  });
  it("shows duplicate-email feedback", async () => {
    mock.signup.mockRejectedValueOnce({ code: "auth/email-already-in-use" });
    open("register");
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Create your account" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This email already has an account.",
    );
  });
  it("explains an unauthorized Google login domain", async () => {
    mock.google.mockRejectedValueOnce({ code: "auth/unauthorized-domain" });
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "G Continue with Google" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "not authorized",
    );
  });
  it("clears a password-reset error after a successful retry", async () => {
    mock.reset.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    open("forgot");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "alice@gather.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
