import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useAuthStore from '@/stores/authStore';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bem-vindo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{user?.name}</p>
            <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Entregas do Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" style={{ color: '#9A48EA' }}>—</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bonus Estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" style={{ color: '#2D8A56' }}>—</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
