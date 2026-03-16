import { Loader2 } from 'lucide-react';

export default function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
    </div>
  );
}
