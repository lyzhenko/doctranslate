import * as vscode from 'vscode';

/**
 * Asks every hover provider for documentation at `position`.
 * Used by the sidebar panel; the hover provider itself uses the same helpers.
 */
export async function readHoverDocumentation(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<string | undefined> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    document.uri,
    position,
  );
  if (!hovers || hovers.length === 0) {
    return undefined;
  }
  const documentation = collectDocumentation(hovers);
  return documentation || undefined;
}

/** Combines documentation from several providers, dropping duplicates. */
export function collectDocumentation(hovers: readonly vscode.Hover[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const hover of hovers) {
    for (const content of hover.contents) {
      const markdown = contentToMarkdown(content)?.trim();
      if (!markdown || seen.has(markdown)) {
        continue;
      }
      seen.add(markdown);
      parts.push(markdown);
    }
  }
  return parts.join('\n\n');
}

export function contentToMarkdown(
  content: vscode.MarkdownString | vscode.MarkedString,
): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (content instanceof vscode.MarkdownString) {
    return content.value;
  }
  if (typeof content === 'object' && content !== null && 'value' in content) {
    const marked = content as { language?: string; value: string };
    return marked.language
      ? '```' + marked.language + '\n' + marked.value + '\n```'
      : marked.value;
  }
  return undefined;
}

