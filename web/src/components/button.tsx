import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { Tooltip } from './tooltip.tsx';

const variants = cva(
  'button app:inline-flex app:shrink-0 app:items-center app:justify-center app:gap-2 app:rounded-lg app:border app:border-solid app:border-transparent app:font-sans app:text-[13px] app:font-medium app:leading-5 app:no-underline app:whitespace-nowrap app:cursor-pointer app:transition-[background-color,border-color,box-shadow] app:focus-visible:outline-2 app:focus-visible:outline-offset-2 app:focus-visible:outline-zinc-400 app:disabled:cursor-not-allowed app:disabled:opacity-45 app:motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default:
          'button-primary app:bg-zinc-800 app:text-white app:shadow-xs app:hover:bg-zinc-700',
        secondary:
          'button-secondary app:border-zinc-200 app:bg-white app:text-zinc-700 app:shadow-xs app:hover:bg-zinc-50 app:hover:border-zinc-300',
        ghost:
          'button-ghost app:bg-transparent app:text-zinc-500 app:hover:bg-zinc-100 app:hover:text-zinc-800',
        destructive:
          'button-destructive app:border-red-200 app:bg-red-50 app:text-red-700 app:hover:bg-red-100',
      },
      size: {
        default: 'app:h-9 app:px-3.5 app:py-0',
        sm: 'button-small app:h-8 app:px-2.5 app:py-0 app:text-xs',
        icon: 'icon-button app:size-8 app:p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  tooltip,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof variants> & {
    asChild?: boolean;
    tooltip?: string;
  }) {
  const Component = asChild ? Slot : 'button';
  const hint = tooltip ?? (size === 'icon' ? props['aria-label'] : undefined);
  const button = (
    <Component
      className={cn(variants({ variant, size }), className)}
      {...props}
      title={hint ? undefined : props.title}
    />
  );
  return hint ? (
    <Tooltip content={hint} disabled={props.disabled}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
