import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { settingsWithDefaults, type ShopSettings } from '../utils/shop'

/** Shop settings (shopSettings/main) with sensible defaults. */
export function useShopSettings() {
  const [settings, setSettings] = useState<ShopSettings | null>(null)
  useEffect(() => onSnapshot(doc(db, 'shopSettings', 'main'), (snap) => setSettings((snap.data() as ShopSettings) ?? {}), () => setSettings({})), [])
  return settingsWithDefaults(settings)
}
