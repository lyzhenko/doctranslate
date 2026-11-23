export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export const PROMPT_VERSION = 'v1';

const RULES = [
  'You are a precise technical translator for software documentation.',
  'Translate the Markdown documentation the user sends. Translate only natural-language prose.',
  '',
  'Rules:',
  '1. Never translate code, identifiers, API names, type names, file names, URLs, e-mail addresses, or tags such as @param, @returns, @throws, @example, @deprecated.',
  '2. Keep the Markdown structure exactly as it is: headings, lists, tables, block quotes, emphasis, links, images and blank lines.',
  '3. The text contains opaque placeholders like ⟦B0⟧, ⟦C1⟧, ⟦U2⟧ and ⟦H3⟧. They stand for code blocks, inline code, URLs and HTML tags. Keep every placeholder verbatim, in the same position, and never translate, merge, split, reorder, duplicate or drop one.',
  '4. Keep technical terms that have no established target-language equivalent in English (for example "callback", "promise", "runtime").',
  '5. Output only the translated Markdown. Do not add explanations, notes, quotes or surrounding code fences. Do not add a "Translation:" prefix.',
  '6. Preserve the original meaning and tone of the documentation.',
];

export function buildTranslationMessages(
  markdown: string,
  targetLanguageName: string,
  targetLanguageCode: string,
): ChatMessage[] {
  const system = [
    ...RULES,
    '',
    `Target language: ${targetLanguageName} (language code "${targetLanguageCode}").`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: markdown },
  ];
}

/**
 * Second attempt used when the model dropped or altered placeholders. Passing
 * the broken answer back as an assistant message makes the correction cheap
 * and keeps the conversation consistent.
 */
export function buildPlaceholderRetryMessages(
  markdown: string,
  previousAnswer: string,
  missingTokens: readonly string[],
  targetLanguageName: string,
  targetLanguageCode: string,
): ChatMessage[] {
  return [
    ...buildTranslationMessages(markdown, targetLanguageName, targetLanguageCode),
    { role: 'assistant', content: previousAnswer },
    {
      role: 'user',
      content:
        'Your previous answer lost or altered these placeholders: ' +
        `${missingTokens.join(', ')}. Return the complete translation again, ` +
        'keeping every placeholder exactly as written and in its original position.',
    },
  ];
}
