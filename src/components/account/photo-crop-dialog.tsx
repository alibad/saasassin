"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { AVATAR_SIZE, MAX_AVATAR_BYTES } from "@/lib/fleet/account/identity";

const VIEWPORT = 256;

type Point = { x: number; y: number };

/** Draws the visible square at 256×256 and encodes it as WebP, or JPEG where WebP encoding isn't supported. */
async function encodeCrop(image: HTMLImageElement, offset: Point, scale: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot edit images.");
  context.imageSmoothingQuality = "high";
  const source = VIEWPORT / scale;
  context.drawImage(image, -offset.x / scale, -offset.y / scale, source, source, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  for (const quality of [0.9, 0.8, 0.65, 0.5]) {
    const webp = await encode("image/webp", quality);
    const blob = webp && webp.type === "image/webp" ? webp : await encode("image/jpeg", quality);
    if (blob && blob.size <= MAX_AVATAR_BYTES) return blob;
  }
  throw new Error("That image could not be made small enough. Try a different photo.");
}

type PhotoCropDialogProps = {
  file: File | null;
  onOpenChange: (open: boolean) => void;
  /** Receives the square 256×256 WebP/JPEG; throw to keep the dialog open with an error. */
  onCropped: (photo: Blob) => Promise<void>;
};

/** Crop a chosen image to a square by dragging and zooming, then hand back a small encoded copy. */
export function PhotoCropDialog({ file, onOpenChange, onCropped }: PhotoCropDialogProps) {
  const [source, setSource] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{ pointer: number; start: Point; origin: Point } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      const base = Math.max(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight);
      setSource({ url, image });
      setLoadError("");
      setError("");
      setZoom(1);
      setOffset({ x: (VIEWPORT - image.naturalWidth * base) / 2, y: (VIEWPORT - image.naturalHeight * base) / 2 });
    };
    image.onerror = () => {
      if (!cancelled) setLoadError("That file isn't an image this browser can open. Use a PNG, JPEG or WebP photo.");
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const image = source?.image ?? null;
  const baseScale = image ? Math.max(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight) : 1;
  const scale = baseScale * zoom;

  function clamp(point: Point, nextScale = scale): Point {
    if (!image) return point;
    const minX = VIEWPORT - image.naturalWidth * nextScale;
    const minY = VIEWPORT - image.naturalHeight * nextScale;
    return { x: Math.min(0, Math.max(minX, point.x)), y: Math.min(0, Math.max(minY, point.y)) };
  }

  function changeZoom(nextZoom: number) {
    const bounded = Math.min(4, Math.max(1, nextZoom));
    const nextScale = baseScale * bounded;
    // Keep the centre of the square fixed while zooming.
    const centre = { x: (VIEWPORT / 2 - offset.x) / scale, y: (VIEWPORT / 2 - offset.y) / scale };
    setZoom(bounded);
    setOffset(clamp({ x: VIEWPORT / 2 - centre.x * nextScale, y: VIEWPORT / 2 - centre.y * nextScale }, nextScale));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: offset };
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    setOffset(clamp({
      x: current.origin.x + event.clientX - current.start.x,
      y: current.origin.y + event.clientY - current.start.y,
    }));
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 8;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setOffset(clamp({ x: offset.x + move.x, y: offset.y + move.y }));
    } else if (event.key === "+" || event.key === "=") {
      changeZoom(zoom + 0.1);
    } else if (event.key === "-") {
      changeZoom(zoom - 0.1);
    }
  }

  async function save() {
    if (!image) return;
    setSaving(true);
    setError("");
    try {
      await onCropped(await encodeCrop(image, offset, scale));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!saving) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Position your photo</DialogTitle>
          <DialogDescription>Drag to move it and use the slider to zoom. People see it as a circle.</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
        ) : (
          <div className="grid justify-items-center gap-4">
            <div
              role="application"
              aria-label="Photo crop area. Use the arrow keys to move the photo, plus and minus to zoom."
              tabIndex={0}
              style={{ width: VIEWPORT, height: VIEWPORT }}
              className="relative cursor-grab touch-none overflow-hidden rounded-[var(--radius)] bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onKeyDown={keyDown}
              onWheel={(event) => changeZoom(zoom - event.deltaY * 0.002)}
            >
              {source && image ? (
                // A local object URL being cropped: next/image cannot optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={source.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
                  style={{
                    width: image.naturalWidth * scale,
                    height: image.naturalHeight * scale,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin" />
                </span>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/70"
                style={{ boxShadow: "0 0 0 999px color-mix(in oklch, var(--background) 55%, transparent)" }}
              />
            </div>
            <div className="flex w-64 items-center gap-3">
              <ZoomOut className="size-4 text-muted-foreground" aria-hidden="true" />
              <Slider
                aria-label="Zoom"
                min={1}
                max={4}
                step={0.01}
                value={[zoom]}
                onValueChange={([value]) => changeZoom(value)}
                disabled={!image}
              />
              <ZoomIn className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!image || saving || Boolean(loadError)}>
            {saving ? <LoaderCircle className="animate-spin" /> : null} Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
