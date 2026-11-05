import { parentPort, workerData } from 'node:worker_threads';

function invalid(message: string): never {
  const error = new Error(message);
  error.name = 'AttachmentInputError';
  throw error;
}
async function prepare(bytes: Uint8Array, filename: string) {
  const extension = filename.toLowerCase().split('.').at(-1);
  if (['txt', 'md', 'markdown'].includes(extension ?? '')) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return invalid('Use a UTF-8 text or Markdown file.');
    }
    if (text.includes('\0')) invalid('This file is not a supported text document.');
    if (text.length > 200000)
      invalid(
        'Text attachments support up to 200,000 characters. Split this file into smaller parts.',
      );
    return {
      kind: extension === 'txt' ? 'text' : 'markdown',
      mediaType: 'text/plain; charset=utf-8',
      text,
    };
  }
  if (extension === 'pdf') {
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-')
      invalid('Choose a valid PDF file.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
    });
    try {
      const document = await loading.promise;
      if (document.numPages > 100)
        invalid('PDF attachments support up to 100 pages. Split this PDF into smaller parts.');
      let text = '',
        hasText = false;
      for (let page = 1; page <= document.numPages; page++) {
        const value = await document.getPage(page);
        const content = await value.getTextContent();
        hasText ||= content.items.some((item) => 'str' in item && !!item.str.trim());
        text +=
          `\n[Page ${page}]\n` +
          content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
            .join('');
        value.cleanup();
        if (text.length > 200000)
          invalid('This PDF has too much text. Split it into smaller parts.');
      }
      const empty = !hasText;
      return {
        kind: 'pdf',
        mediaType: 'application/pdf',
        text,
        pages: document.numPages,
        ...(empty
          ? {
              note: 'No text layer found. Scanned PDFs need OCR before Copilot can read their contents.',
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException')
        invalid('Upload an unlocked PDF. Password-protected PDFs are not supported.');
      throw error;
    } finally {
      await loading.destroy();
    }
  }
  const buffer = Buffer.from(bytes);
  const format = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      ? 'jpeg'
      : /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString())
        ? 'gif'
        : buffer.subarray(0, 4).toString() === 'RIFF' &&
            buffer.subarray(8, 12).toString() === 'WEBP'
          ? 'webp'
          : null;
  if (
    !format ||
    !['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension ?? '') ||
    (extension === 'jpg' ? 'jpeg' : extension) !== format
  )
    invalid('Choose a valid PNG, JPEG, WebP or GIF image.');
  const { default: sharp } = await import('sharp');
  const image = sharp(buffer, { limitInputPixels: 40000000, failOn: 'warning' });
  const metadata = await image.metadata();
  const preview = await image
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  if (preview.length > 4 * 1024 * 1024)
    invalid('This image is too complex. Upload a smaller image.');
  return {
    kind: 'image',
    mediaType: `image/${format}`,
    text: '',
    preview,
    width: metadata.width,
    height: metadata.height,
    ...((metadata.pages ?? 1) > 1
      ? { note: 'Only the first frame of this animated image is used.' }
      : {}),
  };
}
try {
  parentPort!.postMessage({ value: await prepare(workerData.bytes, workerData.filename) });
} catch (error) {
  parentPort!.postMessage({
    error:
      error instanceof Error && error.name === 'AttachmentInputError'
        ? error.message
        : 'This file could not be processed. Check its format and try again.',
  });
}
