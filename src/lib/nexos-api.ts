/**
 * nexos.ai Gateway client — everything this app needs from the nexos.ai API
 * lives in this one file.
 *
 * ## What is the nexos.ai Gateway?
 *
 * nexos.ai Gateway gives you one API key and one endpoint for models from many
 * providers (OpenAI, Google, Anthropic, …). The API is OpenAI-compatible: the
 * paths, request bodies and responses follow the OpenAI REST API, so if you have
 * used that before, you already know most of it. Only the base URL and the key
 * are different.
 *
 * - Base URL: `https://api.nexos.ai/v1`
 * - Auth:     `Authorization: Bearer <your nexos.ai API key>`
 * - Keys:     create them at https://workspace.nexos.ai/gateway/api-keys
 *
 * ## Endpoints used here
 *
 * 1. `GET /models` — lists every model your key can use. Each entry says which
 *    endpoints it supports, so we filter for image generation models.
 *
 *    ```sh
 *    curl https://api.nexos.ai/v1/models \
 *      -H "Authorization: Bearer $NEXOS_API_KEY"
 *    ```
 *
 * 2. `POST /images/generations` — generates an image from a text prompt.
 *
 *    ```sh
 *    curl https://api.nexos.ai/v1/images/generations \
 *      -H "Authorization: Bearer $NEXOS_API_KEY" \
 *      -H "Content-Type: application/json" \
 *      -d '{"model": "<model id from /models>", "prompt": "A lighthouse at dawn", "n": 1, "size": "1536x1024"}'
 *    ```
 *
 *    The image comes back either inline as base64 (`data[0].b64_json`) or as a
 *    link to download (`data[0].url`), depending on the model. We handle both.
 *
 * ## Calling from the browser
 *
 * The gateway answers CORS requests from any origin, so this demo calls it
 * straight from the browser with plain `fetch` — no backend and no SDK needed.
 * (The official OpenAI SDKs also work: point their `baseURL` at the URL above.)
 *
 * **About the API key:** this demo keeps the user's own key in localStorage,
 * which is fine for a personal tool where each user brings their own key. Never
 * ship *your* key in front-end code: in a product where you pay for usage, make
 * these calls from your backend and keep the key there.
 */

/** Every request goes to this base URL; the paths below are appended to it. */
const NEXOS_API_BASE = "https://api.nexos.ai/v1"

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A non-2xx response from the gateway. `status` is the HTTP status code, so
 * callers can react to specific failures — for example 401/403 means the API key
 * was rejected, and 400 usually means a parameter the model doesn't accept.
 */
export class NexosApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "NexosApiError"
    this.status = status
  }
}

/**
 * Pull a human-readable message out of an error response. The gateway normally
 * uses the OpenAI error shape `{ "error": { "message": "..." } }`, but we also
 * accept a couple of common alternatives before falling back to the status line.
 */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const message = body?.error?.message ?? body?.message ?? body?.detail
    if (typeof message === "string" && message) return message
  } catch {
    // Not JSON — fall through to the status line.
  }
  return `${response.status} ${response.statusText || "Request failed"}`
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

/**
 * Send an authenticated request to the gateway and parse the JSON response.
 * Throws `NexosApiError` for any non-2xx status.
 *
 * Pass an `AbortSignal` in `init.signal` to let the user cancel — image
 * generation can take a minute.
 */
async function request<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${NEXOS_API_BASE}${path}`, {
    ...init,
    headers: {
      // The only nexos.ai-specific part of a request: your key as a Bearer token.
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    throw new NexosApiError(response.status, await errorMessage(response))
  }
  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// Models — GET /models
// ---------------------------------------------------------------------------

/** An image generation model available to the current API key. */
export interface ImageModel {
  /** The id to send as `model` in `/images/generations`. */
  id: string
  /** Who makes the model, e.g. "OpenAI". */
  developer?: string
  /** Highest per-unit price in the model's pricing table; 0 when unknown. */
  cost: number
}

/**
 * The parts of the `/models` response this app reads. Besides the standard
 * OpenAI `id`, nexos.ai adds a few useful fields to each model:
 * - `endpoints`: which API endpoints the model supports (e.g. "chat_completions",
 *   "image_generation") — handy for building model pickers like ours;
 * - `developer`: the model's maker;
 * - `pricing`: per-unit prices, as numbers or numeric strings.
 */
interface ModelsResponse {
  data?: {
    id: string
    developer?: string
    endpoints?: string[]
    pricing?: Record<string, string | number | null> | null
  }[]
}

/** List the models this API key can use for image generation. */
export async function listImageModels(apiKey: string, signal?: AbortSignal): Promise<ImageModel[]> {
  const body = await request<ModelsResponse>(apiKey, "/models", { signal })
  return (body.data ?? [])
    .filter((m) => m.endpoints?.includes("image_generation"))
    .map((m) => ({
      id: m.id,
      developer: m.developer,
      cost: Math.max(0, ...Object.values(m.pricing ?? {}).map((v) => Number(v) || 0)),
    }))
}

/** The GPT Image version in a model id ("gpt-image-1.5" → 1.5), or null for other models. */
function gptImageVersion(id: string): number | null {
  const match = /gpt[\s-]?image[\s-]?(\d+(?:\.\d+)?)?/i.exec(id)
  if (!match) return null
  return match[1] ? Number(match[1]) : 0
}

/**
 * Choose which model to preselect: the one the user picked last time if it is
 * still offered, else the newest GPT Image, else the most expensive model (a
 * rough stand-in for "most capable").
 */
export function pickDefaultImageModel(models: ImageModel[], remembered: string | null): string | null {
  if (remembered && models.some((m) => m.id === remembered)) return remembered
  const gptImages = models
    .map((m) => ({ id: m.id, version: gptImageVersion(m.id) }))
    .filter((m): m is { id: string; version: number } => m.version !== null)
    .sort((a, b) => b.version - a.version)
  if (gptImages.length) return gptImages[0].id
  const byCost = [...models].sort((a, b) => b.cost - a.cost)
  return byCost[0]?.id ?? null
}

// ---------------------------------------------------------------------------
// Image generation — POST /images/generations
// ---------------------------------------------------------------------------

/**
 * Sizes offered in the size picker, sent as the `size` parameter. These are the
 * sizes GPT Image models document; `auto` lets the model decide. Other models
 * may support different sizes — see `generateImage` for how we handle that.
 */
export const IMAGE_SIZES = [
  { value: "1536x1024", label: "Landscape (3:2)" },
  { value: "1024x1024", label: "Square (1:1)" },
  { value: "1024x1536", label: "Portrait (2:3)" },
  { value: "auto", label: "Auto" },
] as const

export type ImageSize = (typeof IMAGE_SIZES)[number]["value"]

export const DEFAULT_IMAGE_SIZE: ImageSize = "1536x1024"

export function isImageSize(value: unknown): value is ImageSize {
  return IMAGE_SIZES.some((s) => s.value === value)
}

/**
 * The response of `/images/generations`. `data` holds one entry per requested
 * image (we always ask for `n: 1`). Each entry carries the image as base64
 * (`b64_json`) or as a URL to download — which one depends on the model.
 */
interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[]
}

/** Guess the image format from its first bytes; base64 responses don't say. */
function sniffImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return "image/png"
}

/** Decode a `b64_json` payload into a Blob the browser can display and download. */
function base64ToBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: sniffImageType(bytes) })
}

/**
 * Generate one image from a text prompt and return it as a Blob.
 *
 * The prompt is sent exactly as the user wrote it. Pass an `AbortSignal` to
 * cancel; the request then rejects with an `AbortError`.
 */
export async function generateImage({
  apiKey,
  model,
  prompt,
  size,
  signal,
}: {
  apiKey: string
  model: string
  prompt: string
  size: ImageSize
  signal?: AbortSignal
}): Promise<Blob> {
  // `size` is optional in the API; leaving it out lets the model use its default.
  const send = (size: ImageSize | undefined) =>
    request<ImagesResponse>(apiKey, "/images/generations", {
      method: "POST",
      signal,
      body: JSON.stringify({
        model,
        prompt: prompt.trim(),
        n: 1,
        ...(size ? { size } : {}),
        // GPT Image supports "low" | "medium" | "high"; higher costs more and takes longer.
        quality: "high",
      }),
    })

  let body: ImagesResponse
  try {
    body = await send(size)
  } catch (err) {
    // The gateway fronts models from several providers, and not all of them
    // accept the same sizes. If the model rejects the size (HTTP 400 mentioning
    // "size"), retry once without it rather than failing outright.
    const sizeRejected = err instanceof NexosApiError && err.status === 400 && /size/i.test(err.message)
    if (!sizeRejected) throw err
    body = await send(undefined)
  }

  const image = body.data?.[0]
  if (image?.b64_json) return base64ToBlob(image.b64_json)
  if (image?.url) {
    // Some models return a short-lived link instead of inline data.
    const response = await fetch(image.url, { signal })
    if (!response.ok) throw new NexosApiError(response.status, "Could not download the generated image.")
    return await response.blob()
  }
  throw new Error("The model returned no image.")
}
