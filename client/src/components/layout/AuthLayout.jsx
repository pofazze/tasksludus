import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AuthLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
