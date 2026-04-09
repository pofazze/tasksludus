import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Target, Calculator, Package,
  BarChart3, TrendingUp, Sliders, LogOut, Trophy, Wallet, Rocket, CalendarDays, ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import useAuthStore from '@/stores/authStore';

const navItems = {
  dev: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/boost', icon: Calculator, label: 'Boost' },
    { to: '/roles', icon: Wallet, label: 'Cargos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  ceo: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  director: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
  ],
  manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  account_manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
  ],
  producer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  client: [
    { to: '/portal', icon: LayoutDashboard, label: 'Portal' },
  ],
};

export default function Sidebar({ onNavigate }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  let items = navItems[user?.role] || [];
  // Social media producers get additional nav items
  if (user?.role === 'producer' && user?.producer_type === 'social_media') {
    items = [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/clients', icon: Package, label: 'Clientes' },
      { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
      { to: '/aprovacoes', icon: ClipboardCheck, label: 'Aprovacoes' },
      { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
      { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
      { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
      { to: '/ranking', icon: Trophy, label: 'Ranking' },
    ];
  }
  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate('/login');
  };

  return (
    <aside className="w-56 h-full bg-white dark:bg-[#0C0C0F] border-r border-border flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <img src="/logo.svg" alt="Ludus" className="h-6" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-all duration-150 ${
                isActive
                  ? 'bg-purple-50 text-purple-700 font-medium dark:bg-[#9A48EA]/12 dark:text-[#C084FC]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-[#71717A] dark:hover:text-[#A1A1AA] dark:hover:bg-white/[0.04]'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 ring-1 ring-black/5 dark:ring-white/10">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="text-[10px] bg-slate-100 text-slate-500 dark:bg-[#1C1C22] dark:text-[#A1A1AA]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair"
            className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:text-[#EF4444] dark:hover:bg-[#EF4444]/10"
          >
            <LogOut size={14} />
          </Button>
        </div>
      </div>
    </aside>
  );
}
