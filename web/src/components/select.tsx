import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from './cn.ts';

export function Select({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onValueChange(value: string): void;
  options: { value: string; label: string; disabled?: boolean }[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={label}
        title={options.find((option) => option.value === value)?.label}
        className={cn(
          'app-select app:box-border app:flex app:h-9 app:min-w-0 app:items-center app:justify-between app:gap-3 app:rounded-lg app:border app:border-solid app:border-zinc-200 app:bg-white app:px-3 app:font-sans app:text-[13px] app:font-normal app:leading-5 app:text-zinc-700 app:shadow-xs app:cursor-pointer app:hover:border-zinc-300 app:focus-visible:outline-2 app:focus-visible:outline-offset-2 app:focus-visible:outline-zinc-400 app:disabled:cursor-not-allowed app:disabled:opacity-45',
          className,
        )}
      >
        <SelectPrimitive.Value
          className="app:min-w-0 app:truncate app:text-left"
          placeholder={placeholder}
        />
        <SelectPrimitive.Icon className="app:flex app:shrink-0 app:text-zinc-500">
          <ChevronDown size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="app-select-menu app:z-[2020] app:min-w-[var(--radix-select-trigger-width)] app:max-w-[calc(100vw-24px)] app:max-h-[min(320px,var(--radix-select-content-available-height))] app:overflow-hidden app:rounded-xl app:border app:border-solid app:border-zinc-200 app:bg-white app:font-sans app:text-[13px] app:text-zinc-700 app:shadow-[0_12px_40px_#18181b18,0_3px_8px_#18181b08]"
        >
          <SelectPrimitive.ScrollUpButton className="app:flex app:h-6 app:items-center app:justify-center app:text-zinc-500">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="app:p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="app-select-option app:relative app:flex app:min-h-8 app:items-center app:rounded-md app:py-2 app:pr-9 app:pl-2.5 app:leading-5 app:cursor-pointer app:outline-none app:data-[highlighted]:bg-zinc-100 app:data-[highlighted]:text-zinc-950 app:data-[disabled]:pointer-events-none app:data-[disabled]:opacity-40"
              >
                <SelectPrimitive.ItemText className="app:min-w-0 app:max-w-full app:truncate">
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="app:absolute app:right-3 app:flex app:items-center app:text-zinc-800">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="app:flex app:h-6 app:items-center app:justify-center app:text-zinc-500">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
