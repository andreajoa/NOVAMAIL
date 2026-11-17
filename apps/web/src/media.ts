import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { ApiError } from "./api";

export interface Uploaded {
  id: string;
  url: string;
  content_type: string;
  size: number;
}

export async function upload(file: Blob, name = "upload"): Promise<Uploaded> {
  const form = new FormData();
  form.append("file", file, name);
  const res = await fetch("/api/media", { method: "POST", body: form, credentials: "same-origin", headers: { "x-novamail-client": "dashboard" } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.name ?? "error", json.message ?? `HTTP ${res.status}`);
  return json as Uploaded;
}

/**
 * Turns a video into a looping, silent animated GIF entirely in the browser (no server, no cost).
 * Email clients don't play video (except Apple Mail); a GIF plays everywhere.
 */
export async function videoToGif(file: File, opts: { width?: number; fps?: number; maxSeconds?: number; onProgress?: (p: number) => void } = {}): Promise<Blob> {
  const width = opts.width ?? 480;
  const fps = opts.fps ?? 10;
  const maxSeconds = opts.maxSeconds ?? 6;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    await new Promise<void>((ok, fail) => {
      video.onloadedmetadata = () => ok();
      video.onerror = () => fail(new Error("This video format can't be read by your browser. Try MP4 (H.264)."));
    });
    const duration = Math.min(video.duration || maxSeconds, maxSeconds);
    const h = Math.round((video.videoHeight / video.videoWidth) * width) || Math.round(width * 0.5625);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const gif = GIFEncoder();
    const frames = Math.max(2, Math.floor(duration * fps));
    for (let i = 0; i < frames; i++) {
      video.currentTime = i / fps;
      await new Promise<void>((ok) => (video.onseeked = () => ok()));
      ctx.drawImage(video, 0, 0, width, h);
      const { data } = ctx.getImageData(0, 0, width, h);
      const palette = quantize(data, 128);
      gif.writeFrame(applyPalette(data, palette), width, h, { palette, delay: Math.round(1000 / fps), repeat: 0 });
      opts.onProgress?.((i + 1) / frames);
    }
    gif.finish();
    return new Blob([new Uint8Array(gif.bytes())], { type: "image/gif" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
