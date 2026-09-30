import { db, type Generation } from "@/lib/db"
import type { ImageSize } from "@/lib/nexos-api"

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp" }

interface NewGeneration {
  blob: Blob
  prompt: string
  model: string
  size: ImageSize
}

/** Persist a generated image to the history and return the stored row. */
export async function saveGeneration(input: NewGeneration): Promise<Generation> {
  const generation = newGeneration(input)
  await db.generations.put(generation)
  return generation
}

/** A history row that has not been stored — also what a failed save falls back to. */
export function newGeneration({ blob, prompt, model, size }: NewGeneration): Generation {
  return {
    id: crypto.randomUUID(),
    prompt,
    model,
    size,
    mimeType: blob.type || "image/png",
    blob,
    createdAt: new Date().toISOString(),
  }
}

export async function deleteGeneration(id: string): Promise<void> {
  await db.generations.delete(id)
}

/** Stamped from when the image was generated, so re-downloads keep the original name. */
export function generationFileName(generation: Generation): string {
  const d = new Date(generation.createdAt)
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `nexos-image-${stamp}.${EXTENSIONS[generation.mimeType] ?? "png"}`
}

export function downloadGeneration(generation: Generation): void {
  const url = URL.createObjectURL(generation.blob)
  const a = document.createElement("a")
  a.href = url
  a.download = generationFileName(generation)
  a.click()
  URL.revokeObjectURL(url)
}

function isQuotaError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false
  const err = e as { name?: string; inner?: { name?: string } }
  return err.name === "QuotaExceededError" || err.inner?.name === "QuotaExceededError"
}

/** User-facing message for a generation that could not be saved to the history. */
export function describePersistError(e: unknown): string {
  if (isQuotaError(e)) {
    return "Out of browser storage — the image could not be saved to your history. Download it, then free up space by deleting older images."
  }
  return "The image could not be saved to this browser's storage. Download it to keep it."
}
