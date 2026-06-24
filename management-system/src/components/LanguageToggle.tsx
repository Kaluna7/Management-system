import { Languages } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import type { Locale } from '../i18n/strings'

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage()

  const defaultClass =
    'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-violet-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200'

  const selectClass = className
    ? `${className}${/\b!?pl-/.test(className) ? '' : ' pl-8'}`
    : `${defaultClass} pl-8`

  return (
    <div className={`relative inline-flex items-center ${className ? '' : 'w-full'}`}>
      <Languages
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
        strokeWidth={1.75}
      />
      <select
        aria-label={t('languageSelector')}
        value={locale}
        onChange={(event) => setLocale(event.currentTarget.value as Locale)}
        className={selectClass}
      >
      <option value="en">{t('langSwitchToEn')}</option>
      <option value="id">{t('langSwitchToId')}</option>
      </select>
    </div>
  )
}
