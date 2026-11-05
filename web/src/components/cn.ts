import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({ prefix: 'app' });
export const cn = (...values: ClassValue[]) => merge(clsx(values));
