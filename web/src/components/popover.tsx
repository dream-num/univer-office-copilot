import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({
  className,
  sideOffset = 8,
  collisionPadding = 12,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'app-popover app:z-[2060] app:max-w-[calc(100vw-24px)] app:max-h-[var(--radix-popover-content-available-height)] app:overflow-y-auto app:rounded-xl app:border app:border-solid app:border-zinc-200 app:bg-white app:font-sans app:text-[13px] app:text-zinc-700 app:shadow-[0_12px_40px_#18181b18,0_3px_8px_#18181b08] app:outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
