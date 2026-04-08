import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PIPELINE_STATUSES, PIPELINE_ORDER } from '@/lib/constants';
import DeliveryCard from './DeliveryCard';

const DOT_COLORS = {
  triagem: 'bg-orange-400', planejamento: 'bg-zinc-400', captacao: 'bg-sky-400',
  edicao_de_video: 'bg-violet-400', estruturacao: 'bg-yellow-400', design: 'bg-blue-400',
  aprovacao: 'bg-pink-400', correcao: 'bg-red-400', agendamento: 'bg-amber-400',
  agendado: 'bg-teal-400', publicacao: 'bg-emerald-400',
};

export default function KanbanBoard({ deliveries, onStatusChange, onCardClick }) {
  const columns = {};
  PIPELINE_ORDER.forEach((s) => { columns[s] = deliveries.filter((d) => d.status === s); });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const delivery = deliveries.find((d) => String(d.id) === result.draggableId);
    if (delivery && delivery.status !== newStatus) onStatusChange(delivery.id, newStatus);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-2.5 overflow-x-auto pb-4 -mx-1 px-1" style={{ minHeight: 'calc(100vh - 260px)' }}>
        {PIPELINE_ORDER.map((status) => {
          const count = columns[status].length;
          return (
            <Droppable key={status} droppableId={status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-shrink-0 w-[270px] rounded-xl p-2 transition-colors duration-200 ${
                    snapshot.isDraggingOver ? 'bg-purple-50 dark:bg-purple-500/5' : 'bg-zinc-50/80 dark:bg-zinc-800/20'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 px-1 py-1.5 mb-2">
                    <div className={`w-2 h-2 rounded-full ${DOT_COLORS[status]}`} />
                    <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      {PIPELINE_STATUSES[status]}
                    </span>
                    {count > 0 && (
                      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 ml-auto tabular-nums">
                        {count}
                      </span>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-[60px]">
                    {columns[status].map((delivery, index) => (
                      <Draggable key={String(delivery.id)} draggableId={String(delivery.id)} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={dragProvided.draggableProps.style}
                          >
                            <DeliveryCard
                              delivery={delivery}
                              onClick={onCardClick}
                              isDragging={dragSnapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
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
