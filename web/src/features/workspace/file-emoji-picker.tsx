import { lazy, Suspense, useState, type ReactNode } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '../../components/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover.tsx';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

export function FileEmojiPicker({
  value,
  onChange,
  defaultIcon,
  disabled,
}: {
  value: string | null;
  onChange(value: string | null): void;
  defaultIcon: ReactNode;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          aria-label="Change file icon"
          tooltip="Choose an emoji"
          disabled={disabled}
          className="app:w-12 app:px-0"
        >
          {value ? (
            <span aria-hidden="true" className="app:text-xl app:leading-none">
              {value}
            </span>
          ) : (
            defaultIcon
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose file icon"
        className="file-emoji-popover app:w-80 app:p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Suspense
          fallback={
            <div
              role="status"
              className="app:flex app:h-[340px] app:items-center app:justify-center app:gap-2 app:text-zinc-500"
            >
              <LoaderCircle size={16} className="app:animate-spin app:motion-reduce:animate-none" />
              Loading emojis…
            </div>
          }
        >
          <EmojiPicker
            emojiStyle="native"
            colorScheme="light"
            width="100%"
            height={340}
            autoFocusSearch
            previewConfig={{ showPreview: false }}
            className="file-emoji-picker"
            onEmojiClick={(selection) => {
              onChange(selection.emoji);
              setOpen(false);
            }}
          />
        </Suspense>
        <div className="app:border-0 app:border-t app:border-solid app:border-zinc-100 app:p-1">
          <Button
            type="button"
            variant="ghost"
            className="app:w-full app:justify-start"
            disabled={!value}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <RotateCcw size={14} />
            Use default icon
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
