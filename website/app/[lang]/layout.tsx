import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import '../global.css';
import { i18n } from '@/lib/i18n';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: {
    default: 'Appo SDK',
    template: '%s | Appo SDK',
  },
  description:
    'JavaScript bridge SDK for native app features in React Native WebViews.',
};

const locales = i18n.languages.map((lang) => ({
  locale: lang,
  name: lang === 'it' ? 'Italiano' : 'English',
}));

const translations: Record<string, Record<string, string>> = {
  it: {
    search: 'Cerca',
    searchNoResult: 'Nessun risultato',
    toc: 'In questa pagina',
    tocNoHeadings: 'Nessun titolo',
    lastUpdate: 'Ultimo aggiornamento',
    chooseLanguage: 'Scegli la lingua',
    nextPage: 'Prossima',
    previousPage: 'Precedente',
    chooseTheme: 'Scegli il tema',
    editOnGithub: 'Modifica su GitHub',
  },
};

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          i18n={{
            locale: lang,
            locales,
            translations: translations[lang],
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
