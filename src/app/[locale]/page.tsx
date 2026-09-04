import { useTranslations } from 'next-intl'

export default function Home() {
  const t = useTranslations('nav')
  return <main className="p-8"><h1>{t('listings')}</h1></main>
}
