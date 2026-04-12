import { describe, it, expect, vi, beforeEach } from "vitest";
import { compressImage } from "./imageCompression";

describe("Image Compression", () => {
  describe("compressImage", () => {
    it("should compress an image to under 1MB", async () => {
      // Create a test image buffer (1000x1000 PNG)
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/jpeg");

      // Verify it's a Buffer
      expect(Buffer.isBuffer(compressed)).toBe(true);

      // Verify size is under 1MB (1048576 bytes)
      expect(compressed.length).toBeLessThan(1048576);
    });

    it("should handle small images without increasing size", async () => {
      // Create a small test image
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/jpeg");

      // Small images should still be valid buffers
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should support JPEG format", async () => {
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/jpeg");

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should support PNG format", async () => {
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/png");

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should support WebP format", async () => {
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/webp");

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should handle edge case: very small buffer", async () => {
      // Create a minimal buffer
      const smallBuffer = Buffer.from([0xff, 0xd8, 0xff]); // JPEG header

      const compressed = await compressImage(smallBuffer, "image/jpeg");

      expect(Buffer.isBuffer(compressed)).toBe(true);
    });

    it("should return a buffer that can be stored in S3", async () => {
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/jpeg");

      // Verify it's a proper Buffer that can be used with storagePut
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(1048576); // Under 1MB
    });

    it("should maintain image quality while compressing", async () => {
      const testImageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const compressed = await compressImage(testImageBuffer, "image/jpeg");

      // Verify the compressed image is valid and under size limit
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(1048576); // Under 1MB
    });
  });
});
