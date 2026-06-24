import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'

type ThemeContextValue = Record<string, never>

const ThemeContext = createContext<ThemeContextValue>({})

/** Ensures light-only brand palette; dark mode removed. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
    try {
      localStorage.removeItem('management-system-theme')
    } catch {
      /* ignore */
    }
  }, [])

  return <ThemeContext.Provider value={{}}>{children}</ThemeContext.Provider>
}

/** @deprecated Theme switching removed — kept so existing imports compile. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
