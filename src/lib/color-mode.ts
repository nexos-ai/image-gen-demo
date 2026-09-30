export type ColorMode = "system" | "light" | "dark"

export const COLOR_MODE_KEY = "image_playground_color_mode"

let _mq: MediaQueryList | null = null
let _mqListener: ((e: MediaQueryListEvent) => void) | null = null

function _removeMqListener() {
  if (_mq && _mqListener) {
    _mq.removeEventListener("change", _mqListener)
    _mq = null
    _mqListener = null
  }
}

export function applyColorMode(mode: ColorMode): void {
  _removeMqListener()
  const root = document.documentElement
  if (mode === "dark") {
    root.classList.add("dark")
    return
  }
  if (mode === "light") {
    root.classList.remove("dark")
    return
  }
  // system
  _mq = window.matchMedia("(prefers-color-scheme: dark)")
  const apply = (dark: boolean) => root.classList.toggle("dark", dark)
  apply(_mq.matches)
  _mqListener = (e) => apply(e.matches)
  _mq.addEventListener("change", _mqListener)
}

export function getStoredColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    // Storage unavailable (private mode, blocked site data): fall back to the default.
  }
  return "system"
}

export function setColorMode(mode: ColorMode): void {
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode)
  } catch {
    // Storage unavailable: the mode still applies for this session.
  }
  applyColorMode(mode)
}

export function initColorMode(): () => void {
  applyColorMode(getStoredColorMode())
  return _removeMqListener
}
