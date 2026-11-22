const MAX_SIDE = 1000;
const MAX_BYTES = 380 * 1024;

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export async function resizeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Could not read this photo. Try a JPEG or PNG');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  let quality = 0.72;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > MAX_BYTES && quality > 0.35) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error('Photo is too large even after shrinking');
  return blob;
}