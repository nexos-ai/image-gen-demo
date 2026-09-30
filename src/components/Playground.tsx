import { useEffect, useMemo, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Download, ImageIcon, KeyRound, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ColorModeToggle } from "@/components/ColorModeToggle"
import { NexosLogo } from "@/components/NexosLogo"
import { cn } from "@/lib/utils"
import { getImageModel, getImageSize, setImageModel, setImageSize } from "@/lib/prefs"
import {
  generateImage,
  IMAGE_SIZES,
  isImageSize,
  listImageModels,
  NexosApiError,
  pickDefaultImageModel,
  type ImageModel,
  type ImageSize,
} from "@/lib/nexos-api"
import { db, type Generation } from "@/lib/db"
import {
  deleteGeneration,
  describePersistError,
  downloadGeneration,
  newGeneration,
  saveGeneration,
} from "@/lib/generations"

interface PlaygroundProps {
  /** Null until the user has saved a key. */
  apiKey: string | null
  onChangeKey: () => void
}

function isKeyRejected(err: unknown): boolean {
  return err instanceof NexosApiError && (err.status === 401 || err.status === 403)
}

/**
 * Object URLs for generation previews, keyed by id rather than Blob: the live
 * query hands back fresh Blob instances on every delivery, which would otherwise
 * mint a new URL each time.
 */
class PreviewUrls {
  private urls = new Map<string, string>()

  get(generation: Generation): string {
    let url = this.urls.get(generation.id)
    if (!url) {
      url = URL.createObjectURL(generation.blob)
      this.urls.set(generation.id, url)
    }
    return url
  }

  /** Revoke the URLs of generations that are gone. */
  retain(ids: Set<string>) {
    for (const [id, url] of this.urls) {
      if (!ids.has(id)) {
        URL.revokeObjectURL(url)
        this.urls.delete(id)
      }
    }
  }

  clear() {
    this.retain(new Set())
  }
}

function sizeLabel(size: ImageSize): string {
  return IMAGE_SIZES.find((s) => s.value === size)?.label ?? size
}

export function Playground({ apiKey, onChangeKey }: PlaygroundProps) {
  const [prompt, setPrompt] = useState("")
  const [models, setModels] = useState<ImageModel[]>([])
  const [model, setModel] = useState<string | null>(null)
  const [size, setSize] = useState(getImageSize)
  const [modelsLoading, setModelsLoading] = useState(!!apiKey)
  const [modelsError, setModelsError] = useState<unknown>(null)
  const [prevApiKey, setPrevApiKey] = useState(apiKey)
  // Generations whose save to IndexedDB failed: usable for this session only.
  const [unsaved, setUnsaved] = useState<Generation[]>([])
  // The newest generation, shown until the live query delivers its stored row.
  const [latest, setLatest] = useState<Generation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generatingSince, setGeneratingSince] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [generateError, setGenerateError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [previewUrls] = useState(() => new PreviewUrls())

  // A new key may unlock different models: start the model list over.
  if (apiKey !== prevApiKey) {
    setPrevApiKey(apiKey)
    setModels([])
    setModel(null)
    setModelsLoading(!!apiKey)
    setModelsError(null)
    setGenerateError(null)
  }

  const stored = useLiveQuery(() => db.generations.orderBy("createdAt").reverse().toArray())
  const history = useMemo(() => [...unsaved, ...(stored ?? [])], [unsaved, stored])
  const selected =
    history.find((g) => g.id === selectedId) ?? (latest?.id === selectedId ? latest : null)

  const isGenerating = generatingSince !== null

  const urlFor = (generation: Generation) => previewUrls.get(generation)

  // Free the URLs of deleted generations.
  useEffect(() => {
    const live = new Set(history.map((g) => g.id))
    if (latest) live.add(latest.id)
    previewUrls.retain(live)
  }, [previewUrls, history, latest])

  useEffect(() => {
    if (!apiKey) return
    const controller = new AbortController()
    listImageModels(apiKey, controller.signal)
      .then((list) => {
        setModels(list)
        setModel(pickDefaultImageModel(list, getImageModel()))
      })
      .catch((err) => {
        if (!controller.signal.aborted) setModelsError(err)
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false)
      })
    return () => controller.abort()
  }, [apiKey])

  // Abort an in-flight generation and free the previews on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      previewUrls.clear()
    }
  }, [previewUrls])

  useEffect(() => {
    if (generatingSince === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [generatingSince])

  const generate = async (text: string, imageSize: ImageSize) => {
    if (!apiKey || !model || !text.trim() || isGenerating) return
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    setNow(startedAt)
    setGeneratingSince(startedAt)
    setGenerateError(null)
    try {
      const blob = await generateImage({ apiKey, model, prompt: text, size: imageSize, signal: controller.signal })
      const input = { blob, prompt: text.trim(), model, size: imageSize }
      let generation: Generation
      try {
        generation = await saveGeneration(input)
      } catch (err) {
        // Keep the paid-for image usable for this session even if it can't be stored.
        generation = newGeneration(input)
        setUnsaved((prev) => [generation, ...prev])
        setGenerateError(new Error(describePersistError(err)))
      }
      setLatest(generation)
      setSelectedId(generation.id)
    } catch (err) {
      if (!controller.signal.aborted) setGenerateError(err)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setGeneratingSince(null)
      }
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setGeneratingSince(null)
  }

  const handleModelChange = (value: string | null) => {
    if (!value) return
    setModel(value)
    setImageModel(value)
  }

  const handleSizeChange = (value: string | null) => {
    if (!isImageSize(value)) return
    setSize(value)
    setImageSize(value)
  }

  const canGenerate = !!prompt.trim() && !!model && !isGenerating

  const handleGenerate = () => {
    if (!canGenerate) return
    generate(prompt, size)
  }

  const handleDelete = async (generation: Generation) => {
    if (generation.id === selectedId) setSelectedId(null)
    if (generation.id === latest?.id) setLatest(null)
    setUnsaved((prev) => prev.filter((g) => g.id !== generation.id))
    try {
      await deleteGeneration(generation.id)
    } catch (err) {
      setGenerateError(err)
    }
  }

  const error = generateError ?? modelsError

  return (
    <div className="flex h-dvh flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-center gap-4">
        <h1 className="flex items-center gap-2 text-base font-medium">
          <Sparkles className="size-4" />
          Image Playground
        </h1>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <a
            href="https://nexos.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"
          >
            Powered by <NexosLogo className="h-3" />
          </a>
          <Button variant="link" size="sm" className="h-auto px-0 text-muted-foreground" onClick={onChangeKey}>
            {apiKey ? "Change API key" : "Set API key"}
          </Button>
          <ColorModeToggle />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed bg-muted/20 p-4 text-center">
            {selected ? (
              <img
                src={urlFor(selected)}
                alt={selected.prompt}
                className={cn("min-h-0 max-w-full flex-1 object-contain transition-opacity", isGenerating && "opacity-40")}
              />
            ) : isGenerating ? null : apiKey ? (
              <>
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <ImageIcon className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Your generated images will appear here</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Describe the subject, style, colors, and mood you want below, then click Generate.
                </p>
              </>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <KeyRound className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Connect your nexos.ai API key to start</p>
                <Button onClick={onChangeKey}>Set API key</Button>
              </>
            )}

            {isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">
                  Generating… {Math.max(0, Math.floor((now - generatingSince) / 1000))}s
                </p>
                <p className="text-xs text-muted-foreground">This usually takes a minute.</p>
                <Button variant="outline" size="sm" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {selected && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={!model || isGenerating}
                onClick={() => generate(selected.prompt, selected.size)}
              >
                <RefreshCw />
                Regenerate
              </Button>
              <Button onClick={() => downloadGeneration(selected)}>
                <Download />
                Download
              </Button>
            </div>
          )}

          {error != null && (
            <p className="mx-auto w-full max-w-3xl text-sm text-destructive">
              {isKeyRejected(error) ? (
                <>
                  Your nexos.ai API key was rejected.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={onChangeKey}>
                    Change API key
                  </button>
                </>
              ) : error instanceof Error ? (
                error.message
              ) : (
                "Something went wrong."
              )}
            </p>
          )}

          <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-muted/30 p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              placeholder="Describe the image you want…"
              aria-label="Prompt"
              rows={3}
              className="field-sizing-content max-h-48 min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {modelsLoading ? (
                  <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Loading models…
                  </span>
                ) : models.length ? (
                  <Select value={model} onValueChange={handleModelChange}>
                    <SelectTrigger size="sm" aria-label="Model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : modelsError || !apiKey ? null : (
                  <span className="px-2 text-xs text-muted-foreground">
                    No image models are available for this API key.
                  </span>
                )}
                <Select value={size} onValueChange={handleSizeChange}>
                  <SelectTrigger size="sm" aria-label="Size">
                    <SelectValue>{sizeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!canGenerate} onClick={handleGenerate}>
                {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Generate
              </Button>
            </div>
          </div>
        </div>

        <aside className="flex max-h-56 shrink-0 flex-col gap-2 border-t pt-3 md:max-h-none md:w-64 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <h2 className="text-sm font-medium">History</h2>
          {history.length ? (
            <ul className="-mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
              {history.map((g) => (
                <HistoryItem
                  key={g.id}
                  generation={g}
                  url={urlFor(g)}
                  selected={g.id === selectedId}
                  onSelect={() => setSelectedId(g.id)}
                  onDownload={() => downloadGeneration(g)}
                  onDelete={() => handleDelete(g)}
                />
              ))}
            </ul>
          ) : (
            stored && (
              <p className="text-xs text-muted-foreground">
                Images you generate are saved here so you can come back to them later.
              </p>
            )
          )}
        </aside>
      </main>
    </div>
  )
}

function HistoryItem({
  generation,
  url,
  selected,
  onSelect,
  onDownload,
  onDelete,
}: {
  generation: Generation
  url: string
  selected: boolean
  onSelect: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  return (
    <li>
      <div className="group relative">
        <button
          type="button"
          onClick={onSelect}
          title={generation.prompt}
          className={cn(
            "block aspect-video w-full overflow-hidden rounded-md border-2 bg-muted transition-colors",
            selected ? "border-primary" : "border-transparent"
          )}
        >
          <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </button>
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-1 rounded-md bg-linear-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <Button size="xs" variant="secondary" onClick={onDownload}>
            <Download />
            Download
          </Button>
          <Button size="xs" variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={generation.prompt}>
        {generation.prompt}
      </p>
      <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground/70">
        {generation.model} · {sizeLabel(generation.size)}
      </p>
    </li>
  )
}
