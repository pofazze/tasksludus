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
  const STORAGE_KEY = 'sheet-width';
  const MIN_W = 380;
  const MAX_W = typeof window !== 'undefined' ? window.innerWidth * 0.7 : 800;
  const DEFAULT_W = 480;

  const [width, setWidth] = React.useState(() => {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_W; }
    catch { return DEFAULT_W; }
  });
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const dragging = React.useRef(false);

  React.useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;
      const w = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setWidth(w);
    }
    function onMouseUp() {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
      }
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [width]);

  function startDrag(e) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        style={isMobile ? { width: '100vw' } : { width: `${width}px` }}
        className={cn(
          'fixed z-50 flex flex-col bg-background ring-1 ring-foreground/10 shadow-lg transition-transform duration-200 ease-out outline-none',
          'data-open:animate-in data-closed:animate-out',
          side === 'right' && 'inset-y-0 right-0 data-open:slide-in-from-right data-closed:slide-out-to-right',
          side === 'left' && 'inset-y-0 left-0 data-open:slide-in-from-left data-closed:slide-out-to-left',
          className
        )}
        {...props}
      >
        {!isMobile && (
          <div
            onMouseDown={startDrag}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#9A48EA]/30 active:bg-[#9A48EA]/50 transition-colors z-10"
          />
        )}
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
    <div className={cn('flex flex-col gap-1.5 px-4 pt-5 pb-3 md:px-6 md:pt-6 md:pb-4 border-b border-border', className)} {...props} />
  );
}

function SheetTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title className={cn('text-base font-semibold text-foreground', className)} {...props} />
  );
}

function SheetDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

function SheetBody({ className, ...props }) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-4 py-3 md:px-6 md:py-4', className)} {...props} />
  );
}

function SheetFooter({ className, ...props }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 justify-end px-4 py-3 md:px-6 md:py-4 border-t border-border', className)} {...props} />
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
