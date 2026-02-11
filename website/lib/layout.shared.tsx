import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(lang: string): BaseLayoutProps {
  return {
    nav: {
      title: 'Appo',
    },
    links: [
      {
        text: 'Documentation',
        url: `/${lang}/getting-started`,
        active: 'nested-url',
      },
    ],
    i18n: true,
  };
}
