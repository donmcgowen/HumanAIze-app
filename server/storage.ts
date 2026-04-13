// Azure Blob Storage implementation for file uploads and downloads
import { BlobServiceClient } from "@azure/storage-blob";
import { ENV } from "./_core/env";

interface StorageConfig {
  accountName: string;
  containerName: string;
  accountKey: string;
}

function getStorageConfig(): StorageConfig {
  const accountName = ENV.azureStorageAccountName;
  const containerName = ENV.azureStorageContainerName;
  const accountKey = ENV.azureStorageAccountKey;

  if (!accountName || !containerName || !accountKey) {
    throw new Error(
      "Azure Storage credentials missing: set AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_CONTAINER_NAME, and AZURE_STORAGE_ACCOUNT_KEY"
    );
  }

  return { accountName, containerName, accountKey };
}

function getBlobServiceClient(): BlobServiceClient {
  const { accountName, accountKey } = getStorageConfig();
  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
  return BlobServiceClient.fromConnectionString(connectionString);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { containerName } = getStorageConfig();
  const key = normalizeKey(relKey);

  try {
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(key);

    // Convert data to Buffer if needed
    let buffer: Buffer;
    if (typeof data === "string") {
      buffer = Buffer.from(data, "utf-8");
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      buffer = data;
    }

    // Upload to Azure Blob Storage
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    // Generate URL
    const url = blockBlobClient.url;

    return { key, url };
  } catch (error) {
    throw new Error(
      `Azure Blob Storage upload failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function storageGet(
  relKey: string,
  expiresInMs: number = 3600000
): Promise<{ key: string; url: string }> {
  const { containerName, accountName, accountKey } = getStorageConfig();
  const key = normalizeKey(relKey);

  try {
    const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import("@azure/storage-blob");
    
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    
    const sasOptions: any = {
      containerName,
      blobName: key,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + expiresInMs),
    };

    const sasQueryParams = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential);
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    const url = `${blockBlobClient.url}?${sasQueryParams.toString()}`;

    return { key, url };
  } catch (error) {
    throw new Error(
      `Azure Blob Storage download URL generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
