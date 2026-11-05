import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';
import { Button } from './button.tsx';
import { cn } from './cn.ts';

export function Dialog({
  title,
  description,
  open,
  onClose,
  children,
  wide = false,
  initialFocus,
  footer,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay app:fixed app:inset-0 app:z-[2000] app:bg-zinc-950/30 app:backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          ref={content}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (initialFocus?.current ?? content.current)?.focus({ preventScroll: true });
          }}
          className={cn(
            'modal app:fixed app:top-1/2 app:left-1/2 app:z-[2001] app:flex app:w-[calc(100vw-2rem)] app:max-w-[520px] app:max-h-[min(85dvh,780px)] app:-translate-x-1/2 app:-translate-y-1/2 app:flex-col app:overflow-hidden app:rounded-2xl app:border app:border-solid app:border-zinc-200 app:bg-white app:font-sans app:text-[13px] app:leading-5 app:text-zinc-700 app:shadow-[0_24px_80px_#18181b26,0_4px_16px_#18181b0d] app:outline-none',
            wide && 'app:max-w-[760px]',
          )}
        >
          <div className="modal-header app:flex app:shrink-0 app:items-start app:justify-between app:gap-5 app:p-5 app:pb-4 app:sm:p-6 app:sm:pb-5">
            <div className="app:min-w-0">
              <DialogPrimitive.Title className="app:m-0 app:text-lg app:font-semibold app:leading-7 app:tracking-[-0.35px] app:text-zinc-800">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={cn(
                  'app:mt-1.5 app:mb-0 app:text-[13px] app:font-normal app:leading-[1.65] app:text-zinc-500 app:[overflow-wrap:anywhere]',
                  !description && 'app:sr-only',
                )}
              >
                {description ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                className="app:-mt-0.5 app:-mr-1 app:size-7 app:rounded-md"
              >
                <X size={18} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="modal-body app:min-h-0 app:overflow-y-auto app:px-5 app:pb-5 app:sm:px-6 app:sm:pb-6">
            {children}
          </div>
          {footer && (
            <div className="modal-footer app:shrink-0 app:border-0 app:border-t app:border-solid app:border-zinc-200 app:px-5 app:py-4 app:sm:px-6">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
