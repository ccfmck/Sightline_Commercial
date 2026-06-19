import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface TableHeaderCellProps {
  children?: ReactNode;
  className?: string;
  widthClass?: string;
  align?: 'left' | 'right' | 'center';
  onClick?: () => void;
  sticky?: boolean;
  stickyLeft?: string;
}

export function TableHeaderCell({
  children,
  className,
  widthClass,
  align = 'left',
  onClick,
  sticky,
  stickyLeft,
}: TableHeaderCellProps) {
  return (
    <th
      className={cn(
        'bg-slate-50 px-2 py-2 align-bottom',
        widthClass,
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        onClick && 'cursor-pointer hover:bg-slate-100',
        sticky && 'sticky z-10',
        stickyLeft,
        className,
      )}
      onClick={onClick}
    >
      <span className="block whitespace-normal break-words text-[10px] font-medium uppercase leading-snug tracking-wide text-slate-500 sm:text-[11px]">
        {children}
      </span>
    </th>
  );
}

export const dataTableClassName = 'w-full table-fixed text-left text-xs sm:text-sm';
