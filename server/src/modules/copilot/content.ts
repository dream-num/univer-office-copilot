type Chunk = {
  content?: unknown;
  contentBlocks?: unknown;
  additional_kwargs?: Record<string, unknown>;
};
export function publicDeltas(chunk: Chunk): { text: string; reasoning: string } {
  const blocks = Array.isArray(chunk.contentBlocks)
    ? chunk.contentBlocks
    : Array.isArray(chunk.content)
      ? chunk.content
      : [];
  let text = typeof chunk.content === 'string' ? chunk.content : '',
    reasoning = '';
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    if (
      block.type === 'text' &&
      typeof block.text === 'string' &&
      typeof chunk.content !== 'string'
    )
      text += block.text;
    if (block.type === 'reasoning')
      reasoning +=
        typeof block.reasoning === 'string'
          ? block.reasoning
          : typeof block.text === 'string'
            ? block.text
            : Array.isArray(block.summary)
              ? block.summary
                  .filter(
                    (part): part is { type: string; text: string } =>
                      !!part &&
                      typeof part === 'object' &&
                      part.type === 'summary_text' &&
                      typeof part.text === 'string',
                  )
                  .map((part) => part.text)
                  .join('')
              : '';
    if (block.type === 'thinking' && typeof block.thinking === 'string')
      reasoning += block.thinking;
  }
  if (!reasoning && typeof chunk.additional_kwargs?.reasoning_content === 'string')
    reasoning = chunk.additional_kwargs.reasoning_content;
  return { text, reasoning };
}
