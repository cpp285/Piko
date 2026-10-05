import { workroomArtifactPath } from '@piko/shared';

export function documentFragment(href: string): string {
  try { return decodeURIComponent(href.split('#').slice(1).join('#')); } catch { return ''; }
}

export function documentFileLink(href: string, currentPath: string): string | undefined {
  const file = workroomArtifactPath(href);
  if (!file) return;
  return /^(?:\/|[A-Za-z]:[\\/])/.test(file) ? file : currentPath.replace(/[^/\\]+$/, '') + file;
}

type MarkdownNode = { type?: string; value?: string; children?: MarkdownNode[]; data?: { hProperties?: Record<string, unknown> } };
export function remarkDocumentHeadings() {
  return (tree: MarkdownNode) => {
    const used = new Set<string>();
    const text = (node: MarkdownNode): string => node.value ?? node.children?.map(text).join('') ?? '';
    const visit = (node: MarkdownNode) => {
      if (node.type === 'heading') {
        const base = text(node).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
        let slug = base, index = 0;
        while (used.has(slug)) slug = `${base}-${++index}`;
        used.add(slug);
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: `piko-document-${slug}` } };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
