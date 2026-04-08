import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PIPELINE_STATUSES, PIPELINE_ORDER } from '@/lib/constants';
import DeliveryCard from './DeliveryCard';

const COLUMN_COLORS = {
  triagem: { dot: 'bg-orange-500', bg: 'from-orange-500/5', border: 'border-orange-200 dark:border-orange-900/30' },
  planejamento: { dot: 'bg-zinc-400', bg: 'from-zinc-400/5', border: 'border-zinc-200 dark:border-zinc-800' },
  captacao: { dot: 'bg-sky-500', bg: 'from-sky-500/5', border: 'border-sky-200 dark:border-sky-900/30' },
  edicao_de_video: { dot: 'bg-violet-500', bg: 'from-violet-500/5', border: 'border-violet-200 dark:border-violet-900/30' },
  estruturacao: { dot: 'bg-yellow-500', bg: 'from-yellow-500/5', border: 'border-yellow-200 dark:border-yellow-900/30' },
  design: { dot: 'bg-blue-500', bg: 'from-blue-500/5', border: 'border-blue-200 dark:border-blue-900/30' },
  aprovacao: { dot: 'bg-pink-500', bg: 'from-pink-500/5', border: 'border-pink-200 dark:border-pink-900/30' },
  correcao: { dot: 'bg-red-500', bg: 'from-red-500/5', border: 'border-red-200 dark:border-red-900/30' },
  agendamento: { dot: 'bg-amber-500', bg: 'from-amber-500/5', border: 'border-amber-200 dark:border-amber-900/30' },
  agendado: { dot: 'bg-teal-500', bg: 'from-teal-500/5', border: 'border-teal-200 dark:border-teal-900/30' },
  publicacao: { dot: 'bg-emerald-500', bg: 'from-emerald-500/5', border: 'border-emerald-200 dark:border-emerald-900/30' },
};

export default function KanbanBoard({ deliveries, onStatusChange, onCardClick }) {
  const columns = {};
  PIPELINE_ORDER.forEach((status) => { columns[status] = deliveries.filter((d) => d.status === status); });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const delivery = deliveries.find((d) => String(d.id) === result.draggableId);
    if (delivery && delivery.status !== newStatus) {
      onStatusChange(delivery.id, newStatus);
    }
  };

  const totalDeliveries = deliveries.length;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
          {totalDeliveries} {totalDeliveries === 1 ? 'entrega' : 'entregas'}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
          {PIPELINE_ORDER.map((status) => {
            const count = columns[status].length;
            if (count === 0) return null;
            const pct = (count / totalDeliveries) * 100;
            const color = COLUMN_COLORS[status]?.dot || 'bg-zinc-400';
            return (
              <div
                key={status}
                className={`h-full ${color} first:rounded-l-full last:rounded-r-full transition-all duration-500`}
                style={{ width: `${pct}%` }}
                title={`${PIPELINE_STATUSES[status]}: ${count}`}
              />
            );
          })}
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-3 overflow-x-auto pb-6 -mx-2 px-2 snap-x" style={{ minHeight: 'calc(100vh - 280px)' }}>
        {PIPELINE_ORDER.map((status) => {
          const colors = COLUMN_COLORS[status] || { dot: 'bg-zinc-400', bg: 'from-zinc-400/5', border: 'border-zinc-200' };
          const count = columns[status].length;

          return (
            <Droppable key={status} droppableId={status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`
                    flex-shrink-0 w-[290px] rounded-2xl snap-start
                    bg-gradient-to-b ${colors.bg} to-transparent
                    border ${snapshot.isDraggingOver
                      ? 'border-purple-400/60 dark:border-purple-500/40 bg-purple-50/50 dark:bg-purple-500/5 shadow-lg shadow-purple-500/10'
                      : `${colors.border} border-dashed`
                    }
                    transition-all duration-300 ease-out
                    p-2.5
                  `}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2.5 px-1.5 py-2 mb-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-white dark:ring-zinc-900 shadow-sm`} />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 tracking-wide">
                      {PIPELINE_STATUSES[status]}
                    </span>
                    <span className={`
                      ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums
                      ${count > 0
                        ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                      }
                    `}>
                      {count}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2.5 min-h-[80px]">
                    {columns[status].map((delivery, index) => (
                      <Draggable key={String(delivery.id)} draggableId={String(delivery.id)} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                              transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                            }}
                          >
                            <DeliveryCard
                              delivery={delivery}
                              onClick={onCardClick}
                              isDragging={snapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {count === 0 && !snapshot.isDraggingOver && (
                      <div className="flex flex-col items-center justify-center py-8 opacity-40">
                        <div className="w-8 h-8 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center mb-2">
                          <span className="text-zinc-400 text-xs">+</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium">Arraste aqui</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
