import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const photo = "data:image/jpeg;base64,/9j/AA==",
  adjusted = "data:image/jpeg;base64,/9j/BB==";
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  crop: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {} }));
vi.mock("../src/api", () => ({ saveProfile: mock.save }));
vi.mock("../src/session", () => ({
  useSession: () => ({
    user: { uid: "alice" },
    profile: {
      uid: "alice",
      username: "alice",
      displayName: "Alice",
      bio: "",
      avatar: "sage",
      photoURL: "data:image/jpeg;base64,/9j/AA==",
      discoverable: true,
      showPresence: true,
    },
  }),
}));
vi.mock("../src/avatar-photo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/avatar-photo")>()),
  loadAvatarPhoto: mock.load,
  cropAvatarPhoto: mock.crop,
}));
import { ProfileForm } from "../src/pages/Panels";
beforeEach(() => {
  vi.clearAllMocks();
  mock.save.mockResolvedValue(undefined);
  mock.load.mockResolvedValue({ naturalWidth: 400, naturalHeight: 400 });
  mock.crop.mockReturnValue(photo);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("profile photo editor", () => {
  it("does not add a photo field when saving an unchanged legacy-compatible form", async () => {
    render(<ProfileForm close={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalled());
    expect(mock.save.mock.calls[0][0]).not.toHaveProperty("photoURL");
  });
  it("saves removal explicitly while preserving the profile fields", async () => {
    render(<ProfileForm close={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          photoURL: null,
          username: "alice",
          displayName: "Alice",
        }),
      ),
    );
  });
  it("saves the latest crop when submitted immediately after adjustment", async () => {
    render(<ProfileForm close={() => {}} />);
    fireEvent.change(screen.getByLabelText("Choose profile picture"), {
      target: {
        files: [new File(["image"], "photo.png", { type: "image/png" })],
      },
    });
    await screen.findByRole("slider", { name: "Zoom" });
    mock.crop.mockReturnValue(adjusted);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith(
        expect.objectContaining({ photoURL: adjusted }),
      ),
    );
  });
  it("keeps the existing photo and explains a failed selection", async () => {
    mock.load.mockRejectedValue(Error("Choose a JPG, PNG or WebP image."));
    const view = render(<ProfileForm close={() => {}} />);
    fireEvent.change(screen.getByLabelText("Choose profile picture"), {
      target: {
        files: [new File(["svg"], "photo.svg", { type: "image/svg+xml" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Choose a JPG"),
    );
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      photo,
    );
    expect(mock.save).not.toHaveBeenCalled();
  });
});
