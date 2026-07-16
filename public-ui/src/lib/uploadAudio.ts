/** Used by GeneratePage for every upload point — before the first render
 * (background music) and after, in the inline timeline editor (background
 * music, audio clips) — one implementation of the upload-as-base64-JSON call
 * to POST /uploads/audio instead of several copies. */
export interface UploadedAudio {
  staticPath: string;
  durationSeconds: number | null;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function uploadAudio(file: File): Promise<UploadedAudio> {
  const dataBase64 = await fileToBase64(file);
  const res = await fetch("/uploads/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, dataBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data;
}
