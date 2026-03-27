import { useEffect, useCallback } from 'react';

export default function useServerEvent(eventTypes, callback) {
  const stableCallback = useCallback(callback, []);

  useEffect(() => {
    const handler = (e) => {
      if (eventTypes.includes(e.detail?.type)) {
        stableCallback(e.detail);
      }
    };
    window.addEventListener('sse', handler);
    return () => window.removeEventListener('sse', handler);
  }, [eventTypes, stableCallback]);
}
