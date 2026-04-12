import sharp from "sharp";

const MAX_SIZE_MB = 1;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Compress image to fit within 1MB limit while maintaining aspect ratio
 * @param buffer - Image buffer
 * @param mimeType - Image MIME type (e.g., 'image/jpeg')
 * @returns Compressed image buffer
 */
export async function compressImage(buffer: Buffer, mimeType: string = "image/jpeg"): Promise<Buffer> {
  try {
    // Start with 80% quality and adjust if needed
    let quality = 80;
    let compressed = buffer;

    // If already under 1MB, return as-is
    if (buffer.length <= MAX_SIZE_BYTES) {
      return buffer;
    }

    // Iteratively compress until under 1MB
    while (compressed.length > MAX_SIZE_BYTES && quality > 10) {
      compressed = await sharp(buffer)
        .resize(1920, 1080, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality, progressive: true })
        .toBuffer();

      quality -= 10;
    }

    // If still too large, reduce dimensions
    if (compressed.length > MAX_SIZE_BYTES) {
      compressed = await sharp(buffer)
        .resize(1280, 720, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 60, progressive: true })
        .toBuffer();
    }

    // Final fallback: aggressive compression
    if (compressed.length > MAX_SIZE_BYTES) {
      compressed = await sharp(buffer)
        .resize(800, 600, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 40, progressive: true })
        .toBuffer();
    }

    return compressed;
  } catch (error) {
    console.error("[Image Compression] Error compressing image:", error);
    throw new Error("Failed to compress image");
  }
}

/**
 * Get image dimensions
 * @param buffer - Image buffer
 * @returns Object with width and height
 */
export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch (error) {
    console.error("[Image Compression] Error getting image dimensions:", error);
    throw new Error("Failed to get image dimensions");
  }
}
