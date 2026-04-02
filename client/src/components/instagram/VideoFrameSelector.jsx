import { useState, useRef, useCallback } from 'react';
import { proxyMediaUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export default function VideoFrameSelector({ videoUrl, onSelectFrame, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);

  const handleLoaded = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      setDuration(v.duration);
      setReady(true);
    }
  }, []);

  function handleSeek(e) {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
  }

  function captureFrame() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (blob) onSelectFrame(blob);
    }, 'image/jpeg', 0.9);
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        src={proxyMediaUrl(videoUrl)}
        onLoadedMetadata={handleLoaded}
        className="w-full rounded-lg max-h-[200px] bg-black"
        crossOrigin="anonymous"
        preload="metadata"
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      {ready && (
        <>
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-[#9A48EA] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-[#9A48EA] hover:bg-[#B06AF0] text-white" onClick={captureFrame}>
              <Check size={12} className="mr-1" /> Usar este frame
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
