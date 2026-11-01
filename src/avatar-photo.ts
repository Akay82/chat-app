export const MAX_PHOTO_LENGTH = 32768;
export type PhotoCrop = { zoom: number; x: number; y: number };
export const initialCrop: PhotoCrop = { zoom: 1, x: 0, y: 0 };
export function validAvatarPhoto(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_PHOTO_LENGTH &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
export async function loadAvatarPhoto(file: File): Promise<HTMLImageElement> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP image.");
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("This image could not be opened. Try a different photo."));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw Error("Choose a photo with fewer than 40 megapixels.");
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function cropAvatarPhoto(
  image: HTMLImageElement,
  crop: PhotoCrop,
): string {
  const side =
    Math.min(image.naturalWidth, image.naturalHeight) /
    Math.max(1, Math.min(3, crop.zoom));
  const x =
    ((image.naturalWidth - side) *
      (Math.max(-100, Math.min(100, crop.x)) + 100)) /
    200;
  const y =
    ((image.naturalHeight - side) *
      (Math.max(-100, Math.min(100, crop.y)) + 100)) /
    200;
  const canvas = document.createElement("canvas");
  for (const size of [192, 160, 128]) {
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context)
      throw Error(
        "Your browser could not prepare this photo. Try a different browser.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, x, y, side, side, 0, 0, size, size);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (validAvatarPhoto(data)) return data;
    }
  }
  throw Error(
    "This photo could not be reduced enough. Try a simpler or smaller image.",
  );
}
