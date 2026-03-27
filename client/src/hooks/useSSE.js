import { useEffect, useRef } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function useSSE() {
  const esRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const es = new EventSource(`${BASE_URL}/events/stream?token=${token}`);
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
