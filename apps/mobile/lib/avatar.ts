import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";

/** Server accepts JPEG/PNG/WebP ≤ 2 MB; we always send a 512px JPEG (~50 KB). */
export const AVATAR_SIZE = 512;
export const AVATAR_JPEG_QUALITY = 0.8;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type AvatarSource = "gallery" | "camera";

export class AvatarPickError extends Error {
  constructor(
    readonly kind: "permission-denied" | "unavailable" | "too-large",
    message: string,
  ) {
    super(message);
    this.name = "AvatarPickError";
  }
}

export type PickedImage = { uri: string; width: number; height: number };

/**
 * Opens the gallery or camera with the platform's square crop UI. Returns null
 * when the user cancels. Permission denial and missing hardware surface as
 * friendly `AvatarPickError`s — nothing is faked.
 */
export async function pickAvatarImage(source: AvatarSource): Promise<PickedImage | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new AvatarPickError(
      "permission-denied",
      source === "camera"
        ? "Camera access is required to take a profile photo."
        : "Photo library access is required to choose a profile photo.",
    );
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch {
    throw new AvatarPickError(
      "unavailable",
      source === "camera" ? "The camera isn't available on this device." : "The photo library isn't available right now.",
    );
  }
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Centre-crops to a square (the picker's crop UI is best effort on Android),
 * resizes to `AVATAR_SIZE` and re-encodes as JPEG. Returns the bytes to upload.
 */
export async function prepareAvatarUpload(image: PickedImage): Promise<{ blob: Blob; contentType: string; uri: string }> {
  const side = Math.min(image.width, image.height);
  const actions: Parameters<typeof manipulateAsync>[1] = [];
  if (image.width !== image.height && side > 0) {
    actions.push({
      crop: {
        originX: Math.floor((image.width - side) / 2),
        originY: Math.floor((image.height - side) / 2),
        width: side,
        height: side,
      },
    });
  }
  actions.push({ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } });
  const output = await manipulateAsync(image.uri, actions, { compress: AVATAR_JPEG_QUALITY, format: SaveFormat.JPEG });
  const response = await fetch(output.uri);
  const blob = await response.blob();
  if (blob.size > AVATAR_MAX_BYTES) {
    throw new AvatarPickError("too-large", "That image is too large. Please choose a smaller photo.");
  }
  return { blob, contentType: "image/jpeg", uri: output.uri };
}
