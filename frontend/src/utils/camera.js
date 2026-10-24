import { computeSHA256 } from './crypto.js';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders either a live <video> element or a synthetic fallback frame onto an
 * offscreen <canvas>, stamps a forensic UTC watermark, exports a WebP/PNG Blob,
 * and computes its SHA-256 digest from the exact encoded bytes.
 */
export async function renderForensicCanvasFrame(videoEl = null) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl?.videoWidth || 640;
  canvas.height = videoEl?.videoHeight || 360;
  const ctx = canvas.getContext('2d');

  const hasLiveFrame = Boolean(videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0);
  if (hasLiveFrame) {
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#181816';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#52524e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.fillStyle = '#d4d4d0';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('KHUSELA OFFSCREEN CANVAS CAPTURE', 28, 56);
    ctx.fillStyle = '#a3a39e';
    ctx.font = '12px monospace';
    ctx.fillText('Storage Mode : Offscreen Canvas -> AES-256-GCM IndexedDB', 28, 92);
    ctx.fillText('OS Gallery   : BYPASSED (Zero local gallery footprint)', 28, 116);
  }

  const utc = new Date().toISOString();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
  ctx.fillStyle = '#10b981';
  ctx.font = '11px monospace';
  ctx.fillText(`UTC ${utc} // GALLERY-BYPASSED`, 10, canvas.height - 10);

  let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  const sha256 = await computeSHA256(blob);
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    sha256,
    timestamp: utc,
    width: canvas.width,
    height: canvas.height,
    dimensions: `${canvas.width}x${canvas.height}`,
    simulated: !hasLiveFrame,
  };
}

/**
 * Gallery-Free Forensic Camera Capture
 * Opens MediaDevices.getUserMedia({ video: true }), draws a single frame directly
 * to an offscreen <canvas>, and exports a compressed image/webp Blob.
 * Zero files or EXIF thumbnails are ever written to the phone's OS Photo Gallery.
 */
export async function captureGalleryFreePhoto() {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 250));

    return await renderForensicCanvasFrame(video);
  } catch {
    return await renderForensicCanvasFrame(null);
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }
}
