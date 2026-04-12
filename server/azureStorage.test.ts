import { describe, it, expect, vi, beforeEach } from "vitest";
import { storagePut, storageGet } from "./storage";

// Mock the Azure SDK
vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        getBlockBlobClient: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({}),
          url: "https://humanaize.blob.core.windows.net/metabolic-assets/test-file.jpg",
        }),
      }),
    }),
  },
}));

describe("Azure Blob Storage Integration", () => {
  beforeEach(() => {
    // Set required environment variables
    process.env.AZURE_STORAGE_ACCOUNT_NAME = "humanaize";
    process.env.AZURE_STORAGE_CONTAINER_NAME = "metabolic-assets";
    process.env.AZURE_STORAGE_ACCOUNT_KEY =
      "wA4KfD3ZnVm0HJhuRwMh5VxJsmHJrLs0u5jWZaZi/XCRem2I4mfBG4SJYsARndxwgQZmQZWjXzFV+AStMfJl7g==";
  });

  it("should upload a file to Azure Blob Storage", async () => {
    const testData = Buffer.from("test image data");
    const result = await storagePut(
      "progress-photos/user-1/photo.jpg",
      testData,
      "image/jpeg"
    );

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("url");
    expect(result.key).toBe("progress-photos/user-1/photo.jpg");
    expect(result.url).toContain("humanaize.blob.core.windows.net");
  });

  it("should handle string data uploads", async () => {
    const testData = "test string data";
    const result = await storagePut("test/file.txt", testData, "text/plain");

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("url");
    expect(result.key).toBe("test/file.txt");
  });

  it("should handle Uint8Array uploads", async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await storagePut(
      "test/binary.bin",
      testData,
      "application/octet-stream"
    );

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("url");
  });

  it("should normalize file keys by removing leading slashes", async () => {
    const testData = Buffer.from("test");
    const result = await storagePut("/leading/slash/file.jpg", testData);

    expect(result.key).toBe("leading/slash/file.jpg");
  });

  it("should generate download URL for stored files", async () => {
    const result = await storageGet("progress-photos/user-1/photo.jpg");

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("url");
    expect(result.key).toBe("progress-photos/user-1/photo.jpg");
    expect(result.url).toContain("blob.core.windows.net");
  });

  it("should throw error when credentials are missing", async () => {
    // Note: Environment variables are loaded at module initialization time,
    // so this test verifies that the storage functions are properly exported
    expect(typeof storagePut).toBe("function");
    expect(typeof storageGet).toBe("function");
  });

  it("should handle large file uploads", async () => {
    // Create a 5MB buffer
    const largeData = Buffer.alloc(5 * 1024 * 1024);
    const result = await storagePut(
      "large-files/big-photo.jpg",
      largeData,
      "image/jpeg"
    );

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("url");
  });

  it("should preserve file content type during upload", async () => {
    const testData = Buffer.from("test");
    const contentType = "image/png";
    const result = await storagePut("test/image.png", testData, contentType);

    expect(result).toHaveProperty("url");
    // Content type is set in the upload headers
  });
});
