import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Avatar } from "../src/components";
import {
  validAvatarPhoto,
  loadAvatarPhoto,
  cropAvatarPhoto,
  initialCrop,
  MAX_PHOTO_LENGTH,
} from "../src/avatar-photo";
const photo = "data:image/jpeg;base64,/9j/AA==";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("profile photos", () => {
  it("rejects external URLs, unsafe formats and oversized thumbnails", () => {
    expect(validAvatarPhoto(photo)).toBe(true);
    for (const value of [
      null,
      "https://example.com/a.jpg",
      "data:image/svg+xml;base64,AAA",
      "data:image/jpeg;base64,/9j/<script>",
      "data:image/jpeg;base64,/9j/" + "A".repeat(MAX_PHOTO_LENGTH),
    ])
      expect(validAvatarPhoto(value)).toBe(false);
  });
  it("keeps initials for legacy profiles and falls back when a photo cannot decode", () => {
    const view = render(
      <Avatar profile={{ displayName: "Alice Example", photoURL: photo }} />,
    );
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      photo,
    );
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.textContent).toBe("AE");
    view.rerender(<Avatar profile={{ displayName: "Bob Test" }} />);
    expect(view.container.textContent).toBe("BT");
  });
  it("rejects unsupported or oversized source files before decoding", async () => {
    await expect(
      loadAvatarPhoto(
        new File(["bad"], "photo.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow("JPG");
    await expect(
      loadAvatarPhoto(new File([], "photo.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("10 MB");
    await expect(
      loadAvatarPhoto(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "photo.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toThrow("10 MB");
  });
  it("crops to a square, flattens transparency and reduces oversized output", () => {
    const drawImage = vi.fn(),
      fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      fillRect,
    } as unknown as CanvasRenderingContext2D);
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValueOnce(
        "data:image/jpeg;base64,/9j/" + "A".repeat(MAX_PHOTO_LENGTH),
      )
      .mockReturnValue(photo);
    const result = cropAvatarPhoto(
      { naturalWidth: 800, naturalHeight: 400 } as HTMLImageElement,
      initialCrop,
    );
    expect(result).toBe(photo);
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      200,
      0,
      400,
      400,
      0,
      0,
      192,
      192,
    );
    expect(fillRect).toHaveBeenCalledWith(0, 0, 192, 192);
    expect(encode).toHaveBeenNthCalledWith(2, "image/jpeg", 0.7);
  });
});
