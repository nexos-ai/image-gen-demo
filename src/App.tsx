import { useEffect, useState } from "react"
import { ApiKeyDialog } from "@/components/ApiKeyDialog"
import { Playground } from "@/components/Playground"
import { initColorMode } from "@/lib/color-mode"
import { getApiKey, setApiKey as storeApiKey } from "@/lib/prefs"

export default function App() {
  const [apiKey, setApiKey] = useState(getApiKey)
  // First visit: introduce the app and ask for a key.
  const [setupOpen, setSetupOpen] = useState(() => !apiKey)

  useEffect(() => initColorMode(), [])

  const handleSave = (key: string) => {
    storeApiKey(key)
    setApiKey(getApiKey())
    setSetupOpen(false)
  }

  return (
    <>
      <Playground apiKey={apiKey} onChangeKey={() => setSetupOpen(true)} />
      <ApiKeyDialog open={setupOpen} onOpenChange={setSetupOpen} onSave={handleSave} />
    </>
  )
}
