import defaultMdxComponents from 'fumadocs-ui/mdx';
import {
  createGenerator,
  createFileSystemGeneratorCache,
} from 'fumadocs-typescript';
import { AutoTypeTable } from 'fumadocs-typescript/ui';
import type { MDXComponents } from 'mdx/types';

const generator = createGenerator({
  cache: createFileSystemGeneratorCache('.next/fumadocs-typescript'),
});

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    AutoTypeTable: (props) => (
      <AutoTypeTable {...props} generator={generator} />
    ),
    ...components,
  };
}
