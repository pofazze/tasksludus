'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function Sheet({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

function SheetTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

function SheetClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

function SheetOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({ className, children, side = 'right', ...props }) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        className={cn(
          'fixed z-50 flex flex-col bg-background ring-1 ring-foreground/10 shadow-lg transition-transform duration-200 ease-out outline-none',
          'data-open:animate-in data-closed:animate-out',
          side === 'right' && 'inset-y-0 right-0 w-full sm:max-w-[480px] data-open:slide-in-from-right data-closed:slide-out-to-right',
          side === 'left' && 'inset-y-0 left-0 w-full sm:max-w-[480px] data-open:slide-in-from-left data-closed:slide-out-to-left',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 rounded-md p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X size={16} />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-6 pt-6 pb-4 border-b border-zinc-800', className)} {...props} />
  );
}

function SheetTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title className={cn('text-base font-semibold text-zinc-100', className)} {...props} />
  );
}

function SheetDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-zinc-500', className)} {...props} />
  );
}

function SheetBody({ className, ...props }) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)} {...props} />
  );
}

function SheetFooter({ className, ...props }) {
  return (
    <div className={cn('flex items-center gap-2 justify-end px-6 py-4 border-t border-zinc-800', className)} {...props} />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
