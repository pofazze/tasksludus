import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Target, Calculator, Package,
  BarChart3, TrendingUp, Sliders, LogOut, Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import useAuthStore from '@/stores/authStore';

const navItems = {
  ceo: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/calculations', icon: Calculator, label: 'Calculos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  director: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/calculations', icon: Calculator, label: 'Calculos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  account_manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
  ],
  producer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  client: [
    { to: '/portal', icon: LayoutDashboard, label: 'Portal' },
  ],
};

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const items = navItems[user?.role] || [];
  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 h-screen bg-white border-r flex flex-col">
      <div className="p-4">
        <h1 className="text-lg font-bold" style={{ color: '#9A48EA' }}>TasksLudus</h1>
      </div>

      <Separator />

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-purple-50 text-purple-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-3 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar_url} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut size={16} />
        </Button>
      </div>
    </aside>
  );
}
