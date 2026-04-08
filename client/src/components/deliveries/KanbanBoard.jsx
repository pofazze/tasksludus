import { useState, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PIPELINE_STATUSES, PIPELINE_ORDER } from '@/lib/constants';
import DeliveryCard from './DeliveryCard';

const DOT_COLORS = {
  triagem: 'bg-orange-400', planejamento: 'bg-muted-foreground', captacao: 'bg-sky-400',
  edicao_de_video: 'bg-violet-400', estruturacao: 'bg-yellow-400', design: 'bg-blue-400',
  aprovacao: 'bg-pink-400', correcao: 'bg-red-400', agendamento: 'bg-amber-400',
  agendado: 'bg-teal-400', publicacao: 'bg-emerald-400',
};

const COUNT_COLORS = {
  triagem: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  planejamento: 'bg-secondary text-muted-foreground dark:bg-zinc-700 dark:text-zinc-300',
  captacao: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
  edicao_de_video: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  estruturacao: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  design: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  aprovacao: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
  correcao: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  agendamento: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  agendado: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
  publicacao: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
};

const PAGE_SIZE = 8;

function InfiniteColumn({ status, cards, onCardClick, provided, snapshot }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const observerRef = useRef(null);

  const lastCardRef = useCallback((node) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node || visibleCount >= cards.length) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, cards.length));
      }
    }, { threshold: 0.5 });
    observerRef.current.observe(node);
  }, [visibleCount, cards.length]);

  const visibleCards = cards.slice(0, visibleCount);
  const hasMore = visibleCount < cards.length;

  return (
    <div
      ref={provided.innerRef}
      {...provided.droppableProps}
      className={`
        flex-shrink-0 w-[280px] rounded-2xl p-2 transition-all duration-200
        ${snapshot.isDraggingOver
          ? 'bg-purple-50/80 dark:bg-purple-500/5 ring-1 ring-purple-300/50 dark:ring-purple-500/20'
          : 'bg-zinc-50/60 dark:bg-zinc-800/15'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-1.5 py-2 mb-1.5">
        <div className={`w-2 h-2 rounded-full ${DOT_COLORS[status]} shadow-sm`} />
        <span className="text-[11px] font-semibold text-muted-foreground dark:text-zinc-400 uppercase tracking-wider flex-1">
          {PIPELINE_STATUSES[status]}
        </span>
        {cards.length > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${COUNT_COLORS[status] || 'bg-secondary text-muted-foreground'}`}>
            {cards.length}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="space-y-2 min-h-[60px] max-h-[calc(100vh-300px)] overflow-y-auto pr-0.5 scrollbar-thin">
        {visibleCards.map((delivery, index) => (
          <Draggable key={String(delivery.id)} draggableId={String(delivery.id)} index={index}>
            {(dragProvided, dragSnapshot) => (
              <div
                ref={(node) => {
                  dragProvided.innerRef(node);
                  if (index === visibleCards.length - 1) lastCardRef(node);
                }}
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
        {hasMore && (
          <div className="text-center py-2">
            <span className="text-[10px] text-muted-foreground dark:text-zinc-600 font-medium">
              +{cards.length - visibleCount} mais...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ deliveries, onStatusChange, onCardClick }) {
  const columns = {};
  PIPELINE_ORDER.forEach((s) => { columns[s] = deliveries.filter((d) => d.status === s); });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const delivery = deliveries.find((d) => String(d.id) === result.draggableId);
    if (delivery && delivery.status !== newStatus) onStatusChange(delivery.id, newStatus);
  };

  const totalDeliveries = deliveries.length;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* Progress bar */}
      {totalDeliveries > 0 && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground dark:text-zinc-500 uppercase tracking-widest tabular-nums">
            {totalDeliveries} {totalDeliveries === 1 ? 'entrega' : 'entregas'}
          </span>
          <div className="flex-1 h-1 rounded-full bg-secondary dark:bg-zinc-800 overflow-hidden flex">
            {PIPELINE_ORDER.map((status) => {
              const count = columns[status].length;
              if (count === 0) return null;
              return (
                <div
                  key={status}
                  className={`h-full ${DOT_COLORS[status]} first:rounded-l-full last:rounded-r-full transition-all duration-700`}
                  style={{ width: `${(count / totalDeliveries) * 100}%` }}
                  title={`${PIPELINE_STATUSES[status]}: ${count}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="flex gap-2.5 overflow-x-auto pb-4 -mx-1 px-1 snap-x" style={{ minHeight: 'calc(100vh - 280px)' }}>
        {PIPELINE_ORDER.map((status) => (
          <Droppable key={status} droppableId={status}>
            {(provided, snapshot) => (
              <InfiniteColumn
                status={status}
                cards={columns[status]}
                onCardClick={onCardClick}
                provided={provided}
                snapshot={snapshot}
              />
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
