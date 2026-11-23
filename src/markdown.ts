/**
 * Markdown helpers for translating hover documentation.
 *
 * The translator must never touch code. Before a request we replace fenced
 * code blocks, inline code spans, links, URLs and HTML tags with opaque
 * placeholders, send only natural-language prose to the model and put the
 * original snippets back afterwards. If the model loses a placeholder the
 * translation is rejected instead of showing mangled code.
 */

export interface MarkdownSegment {
  readonly kind: 'text' | 'code';
  readonly text: string;
}

export interface MaskedMarkdown {
  readonly maskedText: string;
  readonly tokens: ReadonlyMap<string, string>;
}

const TOKEN_PATTERN = /⟦[A-Z]+\d+⟧/g;
const OPEN_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** Splits Markdown into prose and fenced code blocks, preserving every byte. */
export function splitMarkdown(markdown: string): MarkdownSegment[] {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const segments: MarkdownSegment[] = [];
  let prose: string[] = [];
  let code: string[] | null = null;
  let fence: { char: string; length: number } | null = null;

  const flushProse = (): void => {
    if (prose.length > 0) {
      segments.push({ kind: 'text', text: prose.join('\n') });
      prose = [];
    }
  };

  for (const line of lines) {
    if (code && fence) {
      code.push(line);
      if (isClosingFence(line, fence)) {
        segments.push({ kind: 'code', text: code.join('\n') });
        code = null;
        fence = null;
      }
      continue;
    }

    const opened = OPEN_FENCE.exec(line);
    if (opened) {
      flushProse();
      code = [line];
      fence = { char: opened[2][0], length: opened[2].length };
      continue;
    }

    prose.push(line);
  }

  if (code) {
    // An unterminated fence is treated as code until the end of the snippet.
    segments.push({ kind: 'code', text: code.join('\n') });
  }
  flushProse();
  return segments;
}

/**
 * Replaces code, links, URLs and HTML tags with placeholders of the form
 * `⟦X12⟧`. The masked text can be translated and restored losslessly.
 */
export function maskMarkdown(markdown: string): MaskedMarkdown {
  const tokens = new Map<string, string>();
  let nextTokenId = 0;

  const token = (prefix: string, value: string): string => {
    const placeholder = `⟦${prefix}${nextTokenId++}⟧`;
    tokens.set(placeholder, value);
    return placeholder;
  };

  const maskedText = splitMarkdown(markdown)
    .map((segment) => {
      if (segment.kind === 'code') {
        return token('B', segment.text);
      }
      return maskInline(segment.text, token);
    })
    .join('\n');

  return { maskedText, tokens };
}

/** Puts original snippets back and removes placeholders the model invented. */
export function restoreMarkdown(text: string, tokens: ReadonlyMap<string, string>): string {
  let restored = text;
  for (const [placeholder, original] of tokens) {
    restored = restored.split(placeholder).join(original);
  }
  return restored.replace(TOKEN_PATTERN, '');
}

/** Returns placeholders present in the masked text but missing from the answer. */
export function findMissingTokens(maskedText: string, translation: string): string[] {
  const expected = new Set(maskedText.match(TOKEN_PATTERN) ?? []);
  return [...expected].filter((placeholder) => !translation.includes(placeholder));
}

/** Number of letters outside placeholders; used to skip hovers with no prose. */
export function countLetters(text: string): number {
  const stripped = text.replace(TOKEN_PATTERN, ' ');
  return (stripped.match(/\p{L}/gu) ?? []).length;
}

/**
 * Cleans a model answer: normalises newlines, removes a surrounding code fence
 * some models add despite instructions, trims whitespace.
 */
export function normalizeModelOutput(output: string): string {
  let text = output.replace(/\r\n?/g, '\n').trim();
  const fenced = /^```[a-zA-Z0-9_-]*[ \t]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }
  return text;
}

function maskInline(text: string, token: (prefix: string, value: string) => string): string {
  let masked = text;

  masked = masked.replace(
    /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+[^<>]*)?\/?>/g,
    (match) => token('H', match),
  );

  masked = masked.replace(/(`+)([^`\n]*?)\1/g, (match) => token('C', match));

  masked = masked.replace(
    /\]\(\s*([^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (match) => `](${token('U', match.slice(2, -1))})`,
  );

  masked = masked.replace(/\bhttps?:\/\/[^\s<>()[\]"']+/g, (match) => token('U', match));

  return masked;
}

function isClosingFence(line: string, fence: { char: string; length: number }): boolean {
  const match = CLOSE_FENCE.exec(line);
  if (!match) {
    return false;
  }
  return match[1][0] === fence.char && match[1].length >= fence.length;
}
