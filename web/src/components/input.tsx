import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'app-input app:box-border app:h-9 app:w-full app:min-w-0 app:rounded-lg app:border app:border-solid app:border-zinc-200 app:bg-white app:px-3 app:py-2 app:font-sans app:text-[13px] app:leading-5 app:text-zinc-800 app:shadow-xs app:placeholder:text-zinc-500 app:focus-visible:border-zinc-400 app:focus-visible:outline-2 app:focus-visible:outline-offset-2 app:focus-visible:outline-zinc-300 app:disabled:cursor-not-allowed app:disabled:bg-zinc-50 app:disabled:text-zinc-400',
        className,
      )}
      {...props}
    />
  );
}

export function Field({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'app-field app:flex app:min-w-0 app:flex-col app:gap-2 app:font-sans app:text-xs app:font-medium app:leading-5 app:text-zinc-700',
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'app-checkbox app:m-0 app:size-4 app:shrink-0 app:cursor-pointer app:accent-zinc-800 app:focus-visible:outline-2 app:focus-visible:outline-offset-2 app:focus-visible:outline-zinc-400 app:disabled:cursor-not-allowed app:disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
