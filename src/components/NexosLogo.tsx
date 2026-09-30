export function NexosLogo({ className }: { className?: string }) {
  // The SVG is black-filled; invert it so it stays visible in dark mode.
  return <img src="/nexos-logo-text-light.svg" alt="nexos.ai" className={`dark:invert ${className ?? ""}`} />
}
