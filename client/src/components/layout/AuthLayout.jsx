import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Menu, Package, CalendarDays, BarChart3, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import Sidebar from './Sidebar';

export default function AuthLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 bg-white dark:bg-[#0C0C0F] border-r border-border" style={{ width: '14rem' }}>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border md:hidden">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <span className="text-white font-display text-[10px] font-bold">T</span>
            </div>
            <span className="font-display font-semibold text-sm text-foreground tracking-tight">TasksLudus</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-border bg-white/95 dark:bg-[#0C0C0F]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
        <NavLink
          to="/clients"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-slate-400 dark:text-zinc-500'}`
          }
        >
          <Package size={20} />
          Clientes
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-slate-400 dark:text-zinc-500'}`
          }
        >
          <CalendarDays size={20} />
          Agenda
        </NavLink>
        <NavLink
          to="/deliveries"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-slate-400 dark:text-zinc-500'}`
          }
        >
          <BarChart3 size={20} />
          Entregas
        </NavLink>
        <NavLink
          to="/aprovacoes"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-slate-400 dark:text-zinc-500'}`
          }
        >
          <ClipboardCheck size={20} />
          Aprovacoes
        </NavLink>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium text-slate-400 dark:text-zinc-500 transition-colors"
        >
          <Menu size={20} />
          Menu
        </button>
      </nav>
    </div>
  );
}
