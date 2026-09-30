import Dexie, { type EntityTable } from "dexie"
import type { ImageSize } from "@/lib/nexos-api"

/**
 * A generated image, kept so paid generations survive a reload. Uncapped — the
 * playground's Delete button is how users trim it.
 */
export interface Generation {
  id: string
  /** The prompt exactly as sent to the model. */
  prompt: string
  model: string
  /** The size requested; the model may have fallen back to its default. */
  size: ImageSize
  mimeType: string
  blob: Blob
  createdAt: string
}

const db = new Dexie("nexos-image-playground") as Dexie & {
  generations: EntityTable<Generation, "id">
}

db.version(1).stores({
  generations: "id, createdAt",
})

export { db }
