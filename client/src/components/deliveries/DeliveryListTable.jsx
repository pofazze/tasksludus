import { useReactTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS } from '@/lib/constants';
import { ExternalLink, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';

const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

const baseColumns = [
  { accessorKey: 'title', header: 'Título', cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
  { accessorKey: 'user_name', header: 'Responsável', cell: ({ row }) => {
    const d = row.original;
    return d.user_name ? (
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6"><AvatarImage src={d.user_avatar_url} /><AvatarFallback className="text-[8px] bg-muted">{initials(d.user_name)}</AvatarFallback></Avatar>
        <span className="text-sm">{d.user_name}</span>
      </div>
    ) : '—';
  }},
  { accessorKey: 'content_type', header: 'Formato', cell: ({ row }) => <Badge variant="secondary">{CONTENT_TYPE_LABELS[row.original.content_type] || row.original.content_type}</Badge> },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[row.original.status] || ''}>{PIPELINE_STATUSES[row.original.status] || row.original.status}</Badge> },
  { accessorKey: 'clickup_task_id', header: 'ClickUp', cell: ({ row }) => {
    const id = row.original.clickup_task_id;
    return id ? (
      <a href={`https://app.clickup.com/t/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
        {id} <ExternalLink size={12} />
      </a>
    ) : <span className="text-muted-foreground">—</span>;
  }},
];

export default function DeliveryListTable({ deliveries, onRowClick, onEdit, canManage }) {
  const [sorting, setSorting] = useState([]);

  const columns = canManage ? [...baseColumns, {
    id: 'actions', header: '', cell: ({ row }) => (
      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit?.(row.original); }}><Pencil size={16} /></Button>
    ),
  }] : baseColumns;

  const table = useReactTable({
    data: deliveries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id} onClick={header.column.getToggleSortingHandler()} className="cursor-pointer select-none">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} onClick={() => onRowClick?.(row.original)} className="cursor-pointer">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Nenhuma entrega encontrada</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-2 py-3">
          <span className="text-xs text-muted-foreground">Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft size={16} /></Button>
            <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight size={16} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
