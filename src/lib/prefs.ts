import { DEFAULT_IMAGE_SIZE, isImageSize, type ImageSize } from "@/lib/nexos-api"

// User preferences, kept in localStorage.

const API_KEY = "image_playground_nexos_api_key"

export function getApiKey(): string | null {
  const stored = localStorage.getItem(API_KEY)?.trim()
  return stored ? stored : null
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY, key.trim())
}

const IMAGE_MODEL = "image_playground_image_model"

export function getImageModel(): string | null {
  return localStorage.getItem(IMAGE_MODEL) || null
}

export function setImageModel(model: string) {
  localStorage.setItem(IMAGE_MODEL, model)
}

const IMAGE_SIZE = "image_playground_image_size"

export function getImageSize(): ImageSize {
  const stored = localStorage.getItem(IMAGE_SIZE)
  return isImageSize(stored) ? stored : DEFAULT_IMAGE_SIZE
}

export function setImageSize(size: ImageSize) {
  localStorage.setItem(IMAGE_SIZE, size)
}
