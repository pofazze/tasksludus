import { useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function useSSE() {
  const esRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'connected') return;
          window.dispatchEvent(new CustomEvent('sse', { detail: event }));
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; close only if CLOSED state
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          // Retry after 5s
          setTimeout(connect, 5000);
        }
      };
    };

    connect();
    return () => esRef.current?.close();
  }, []);
}
