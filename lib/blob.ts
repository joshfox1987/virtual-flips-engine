import { put } from '@vercel/blob';

export async function uploadImageToBlob(path: string, content: Blob | Buffer, contentType?: string) {
  return put(path, content, {
    access: 'public',
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
