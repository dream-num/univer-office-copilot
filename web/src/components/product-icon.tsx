import { FileText, NotepadText, Sheet, Presentation, Table2, LayoutDashboard } from 'lucide-react';
import type { DocumentFlavor, FileType } from '@univer-copilot/shared';

export function ProductIcon({
  type,
  documentFlavor,
  size = 17,
  emoji,
}: {
  type: FileType;
  documentFlavor?: DocumentFlavor | null;
  size?: number;
  emoji?: string | null;
}) {
  if (emoji)
    return (
      <span
        className="product-icon file-emoji"
        style={{ width: size, height: size, fontSize: size }}
        aria-hidden="true"
      >
        {emoji}
      </span>
    );
  const Icon = {
    sheet: Sheet,
    doc: documentFlavor === 'traditional' ? FileText : NotepadText,
    slide: Presentation,
    base: Table2,
    board: LayoutDashboard,
  }[type];
  return <Icon size={size} className={`product-icon product-${type}`} />;
}
