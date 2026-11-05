import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

const itemStyle =
  'app:relative app:flex app:min-h-9 app:items-center app:gap-2.5 app:rounded-md app:px-2.5 app:py-2 app:font-sans app:text-[13px] app:leading-5 app:text-zinc-600 app:cursor-pointer app:outline-none app:data-[highlighted]:bg-zinc-100 app:data-[highlighted]:text-zinc-900 app:data-[disabled]:pointer-events-none app:data-[disabled]:opacity-40';

export function MenuContent({
  className,
  sideOffset = 6,
  collisionPadding = 12,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'app-menu app:z-[2050] app:min-w-48 app:max-w-[calc(100vw-24px)] app:max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] app:overflow-y-auto app:rounded-xl app:border app:border-solid app:border-zinc-200 app:bg-white app:p-1.5 app:font-sans app:text-[13px] app:text-zinc-700 app:shadow-[0_12px_40px_#18181b18,0_3px_8px_#18181b08]',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.SubContent>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        collisionPadding={12}
        sideOffset={6}
        className={cn(
          'app-menu app:z-[2051] app:w-64 app:max-w-[calc(100vw-24px)] app:rounded-xl app:border app:border-solid app:border-zinc-200 app:bg-white app:p-1.5 app:font-sans app:text-[13px] app:text-zinc-700 app:shadow-[0_12px_40px_#18181b18,0_3px_8px_#18181b08]',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item className={cn(itemStyle, className)} {...props} />;
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(itemStyle, 'app:pr-9', className)} {...props}>
      {children}
      <DropdownMenu.ItemIndicator className="app:absolute app:right-3 app:flex app:items-center app:text-zinc-800">
        <Check size={14} />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="app:mx-1 app:my-1.5 app:h-px app:bg-zinc-100" />;
}
