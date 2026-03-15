import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>TasksLudus</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 mb-4">Metas, performance e portal de clientes</p>
          <Button>Comecar</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
