export default function KpiCard({ label, value, subtitle }) {
  return (
    <div className="flex flex-col p-4 rounded-lg border border-border bg-card min-w-[160px]">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {subtitle && <span className="text-xs text-muted-foreground mt-1">{subtitle}</span>}
    </div>
  );
}
