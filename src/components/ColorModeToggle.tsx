import { useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getStoredColorMode, setColorMode, type ColorMode } from "@/lib/color-mode"

const NEXT: Record<ColorMode, ColorMode> = { system: "light", light: "dark", dark: "system" }
const ICONS = { system: Monitor, light: Sun, dark: Moon }
const LABELS = { system: "System theme", light: "Light theme", dark: "Dark theme" }

/** Cycles system → light → dark. */
export function ColorModeToggle() {
  const [mode, setMode] = useState(getStoredColorMode)
  const Icon = ICONS[mode]

  const handleClick = () => {
    const next = NEXT[mode]
    setMode(next)
    setColorMode(next)
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} aria-label={LABELS[mode]} title={LABELS[mode]}>
      <Icon />
    </Button>
  )
}
