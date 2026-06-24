import { Moon, Sun } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'

type Props = {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className = '', compact = false }: Props) {
  const { t } = useLanguage()
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`portal-surface portal-border inline-flex items-center justify-center rounded-lg border text-app-muted shadow-sm transition hover:border-primary/30 hover:text-primary ${compact ? 'h-8 w-8' : 'h-10 w-10'} ${className}`}
      aria-label={theme === 'dark' ? t('themeSwitchToLight') : t('themeSwitchToDark')}
    >
      {theme === 'dark' ? (
        <Sun className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden strokeWidth={1.75} />
      ) : (
        <Moon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden strokeWidth={1.75} />
      )}
    </button>
  )
}
