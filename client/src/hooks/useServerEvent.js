import { useEffect, useRef } from 'react';

export default function useServerEvent(eventTypes, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (e) => {
      if (eventTypes.includes(e.detail?.type)) {
        callbackRef.current(e.detail);
      }
    };
    window.addEventListener('sse', handler);
    return () => window.removeEventListener('sse', handler);
  }, [eventTypes]);
}
