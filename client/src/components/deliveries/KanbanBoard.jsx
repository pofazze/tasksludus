import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, PIPELINE_ORDER } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import DeliveryCard from './DeliveryCard';

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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 260px)' }}>
        {PIPELINE_ORDER.map((status) => (
          <Droppable key={status} droppableId={status}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex-shrink-0 w-[280px] rounded-xl border border-border p-2 transition-colors ${
                  snapshot.isDraggingOver ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 ${PIPELINE_STATUS_COLORS[status] || ''}`}>
                    {columns[status].length}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">{PIPELINE_STATUSES[status]}</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {columns[status].map((delivery, index) => (
                    <Draggable key={String(delivery.id)} draggableId={String(delivery.id)} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={snapshot.isDragging ? 'opacity-90 rotate-1' : ''}
                        >
                          <DeliveryCard delivery={delivery} onClick={onCardClick} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {columns[status].length === 0 && (
                    <div className="border border-dashed border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Arraste entregas aqui</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
