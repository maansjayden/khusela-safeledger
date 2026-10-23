import { computeSHA256 } from './crypto.js';

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

    // Allow auto-exposure a brief moment to settle
    await new Promise((resolve) => setTimeout(resolve, 250));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Overlay forensic watermark timestamp in bottom-left corner
    const utcNow = new Date().toISOString();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
    ctx.fillStyle = '#10b981';
    ctx.font = '12px monospace';
    ctx.fillText(`KHUSELA FORENSIC SEAL | ${utcNow} | GALLERY-FREE`, 10, canvas.height - 10);

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
    );

    const sha256 = await computeSHA256(blob);

    return {
      blob,
      sha256,
      timestamp: utcNow,
      dimensions: `${canvas.width}x${canvas.height}`,
      simulated: false,
    };
  } catch (err) {
    // Fallback synthetic forensic frame when running on a desktop/headless browser without webcam
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    const utcNow = new Date().toISOString();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('KHUSELA GALLERY-FREE CANVAS CAPTURE', 36, 70);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText(`UTC Timestamp : ${utcNow}`, 36, 115);
    ctx.fillText('Storage Mode  : Offscreen Canvas -> AES-256-GCM IndexedDB', 36, 145);
    ctx.fillText('OS Gallery    : BYPASSED (Zero local gallery footprint)', 36, 175);

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
    );
    const sha256 = await computeSHA256(blob);

    return {
      blob,
      sha256,
      timestamp: utcNow,
      dimensions: '640x360',
      simulated: true,
    };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }
}
