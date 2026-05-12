import { useLanguage } from '../context/LanguageContext'
import type { Locale } from '../i18n/strings'

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage()

  const defaultClass =
    'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-violet-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200'

  return (
    <select
      aria-label={t('languageSelector')}
      value={locale}
      onChange={(event) => setLocale(event.currentTarget.value as Locale)}
      className={className || defaultClass}
    >
      <option value="en">{t('langSwitchToEn')}</option>
      <option value="id">{t('langSwitchToId')}</option>
    </select>
  )
}
