import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NexosLogo } from "@/components/NexosLogo"
import { getApiKey } from "@/lib/prefs"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (key: string) => void
}

export function ApiKeyDialog({ open, onOpenChange, onSave }: ApiKeyDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [openCount, setOpenCount] = useState(0)

  // Remount the form on each open so it re-reads the stored key. Adjusted during
  // render, and only the form is remounted: remounting the popup mid-close
  // strands Base UI's exit animation.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setOpenCount((n) => n + 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ApiKeyForm key={openCount} onSave={onSave} />
      </DialogContent>
    </Dialog>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
    >
      {children}
    </a>
  )
}

function ApiKeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [apiKey, setApiKey] = useState(() => getApiKey() ?? "")

  const handleSave = () => {
    if (!apiKey.trim()) return
    onSave(apiKey)
  }

  return (
    <>
      <DialogHeader>
        <NexosLogo className="mb-2 h-6 w-fit" />
        <DialogTitle>Connect to nexos.ai Gateway</DialogTitle>
      </DialogHeader>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          This open-source demo shows how to generate images with the nexos.ai Gateway API. It runs
          entirely in your browser: your API key and images are stored only on this device.
        </p>
        <p>You need a nexos.ai Gateway API key to use it. Here is how to get one:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Navigate to the{" "}
            <ExternalLink href="https://workspace.nexos.ai/gateway/api-keys">API keys page</ExternalLink>.
          </li>
          <li>Click the "Generate API key" button in the top right corner.</li>
          <li>Give the key a name (e.g. Image Playground) and click "Generate".</li>
          <li>Copy the key from the generated "API key" field and paste it into the field below.</li>
          <li>Click Save.</li>
          <li>You are now ready to generate images!</li>
        </ol>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleSave()
        }}
      >
        <Label htmlFor="nexos-api-key">nexos.ai API key</Label>
        <div className="flex gap-2">
          <Input
            id="nexos-api-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button type="submit" disabled={!apiKey.trim()}>
            Save
          </Button>
        </div>
      </form>
    </>
  )
}
