import { FiMoon, FiSun } from 'react-icons/fi'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'

type Props = {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className = '', compact = false }: Props) {
  const { t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const base =
    className ||
    'portal-surface portal-border inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700 dark:text-violet-200/80 dark:hover:border-violet-500 dark:hover:text-violet-300'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={base}
      aria-label={isDark ? t('themeSwitchToLight') : t('themeSwitchToDark')}
      title={isDark ? t('themeSwitchToLight') : t('themeSwitchToDark')}
    >
      {isDark ? (
        <FiSun className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
      ) : (
        <FiMoon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
      )}
    </button>
  )
}
