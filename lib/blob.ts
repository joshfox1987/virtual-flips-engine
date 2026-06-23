import { put } from '@vercel/blob';

function isPrivateStoreAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Cannot use public access on a private store');
}

export async function uploadImageToBlob(path: string, content: Blob | Buffer, contentType?: string) {
  try {
    return await put(path, content, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    if (!isPrivateStoreAccessError(error)) {
      throw error;
    }

    // Fallback for projects where Blob store access is configured as private.
    return put(path, content, {
      access: 'private',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  }
}
