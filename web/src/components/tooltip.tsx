import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  disabled = false,
}: {
  content: string;
  children: ReactElement;
  disabled?: boolean;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        asChild
        onFocus={(event) => {
          if (!event.currentTarget.matches(':focus-visible')) event.preventDefault();
        }}
      >
        {disabled ? <span className="app:inline-flex">{children}</span> : children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          collisionPadding={12}
          className="app-tooltip app:z-[2100] app:max-w-[min(280px,calc(100vw-24px))] app:rounded-lg app:bg-zinc-800 app:px-3 app:py-2 app:font-sans app:text-xs app:leading-5 app:text-white app:shadow-md app:[overflow-wrap:anywhere]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
