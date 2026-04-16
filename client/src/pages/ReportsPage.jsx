import { useState } from 'react';
import FilterBar from '@/components/reports/FilterBar';
import QualityTab from '@/components/reports/QualityTab';

const TABS = [
  { key: 'quality', label: 'Qualidade' },
  { key: 'capacity', label: 'Capacidade' },
  { key: 'client', label: 'Cliente' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('quality');
  const [filters, setFilters] = useState({});

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-semibold text-foreground mb-4">Relatórios</h1>

      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {activeTab === 'quality' && <QualityTab filters={filters} />}
      {activeTab === 'capacity' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 2).</p>}
      {activeTab === 'client' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 3).</p>}
    </div>
  );
}
