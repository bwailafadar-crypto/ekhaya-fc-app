import { lazy, type ComponentType } from 'react'
import { reloadOnce } from './reloadOnce'

/**
 * Like React.lazy, but survives app updates: if a phone still running the old
 * version asks for a page file that the new deploy replaced, the app loads the
 * new version once instead of showing "Something went wrong".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await load()
      if (module && module.default) return module
      throw new Error('Importing a module script failed (empty module)')
    } catch (error) {
      if (reloadOnce()) return new Promise<{ default: T }>(() => undefined)
      throw error
    }
  })
}
