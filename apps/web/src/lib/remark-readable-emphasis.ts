interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/** Display old Chinese emphasis that CommonMark leaves literal around punctuation/spaces.
 * Work on parsed text only: never rewrite code, links, escaped examples or stored messages.
 */
export default function remarkReadableEmphasis() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: MarkdownNode) => {
      if (!node.children || node.type === 'code' || node.type === 'inlineCode') return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value?.includes('**')) { visit(child); return [child]; }
        const start = child.position?.start.offset, end = child.position?.end.offset;
        // Escaped Markdown and entities are intentionally literal; retain their meaning.
        if (start === undefined || end === undefined || source.slice(start, end) !== child.value) return [child];
        const parts: MarkdownNode[] = [];
        let cursor = 0;
        for (const match of child.value.matchAll(/\*\*([^*\n]*\p{Script=Han}[^*\n]*)\*\*/gu)) {
          if (match.index > cursor) parts.push({ type: 'text', value: child.value.slice(cursor, match.index) });
          parts.push({ type: 'strong', children: [{ type: 'text', value: match[1] }] });
          cursor = match.index + match[0].length;
        }
        if (!cursor) return [child];
        if (cursor < child.value.length) parts.push({ type: 'text', value: child.value.slice(cursor) });
        return parts;
      });
    };
    visit(tree);
  };
}
