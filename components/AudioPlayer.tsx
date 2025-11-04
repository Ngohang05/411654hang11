
import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, PauseIcon, DownloadIcon, LoaderIcon } from './icons';
import { ScriptRowData } from '../types';

interface RowActionsProps {
  row: ScriptRowData;
  rowNumber: number;
  onGenerate: () => void;
  isAppBusy: boolean;
  playbackRate: number;
}

export const AudioPlayer: React.FC<RowActionsProps> = ({ row, rowNumber, onGenerate, isAppBusy, playbackRate }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Dọn dẹp tài nguyên âm thanh khi thành phần bị hủy hoặc bộ đệm âm thanh thay đổi
    return () => {
      if (sourceRef.current) {
        sourceRef.current.onended = null; // Tránh các hiệu ứng phụ còn sót lại
        sourceRef.current.stop();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
    };
  }, [row.audio?.buffer]);

  const handlePlayPause = () => {
    if (!row.audio) return;

    if (isPlaying) {
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      // Sự kiện 'onended' sẽ xử lý việc dọn dẹp trạng thái
    } else {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createBufferSource();
      source.buffer = row.audio.buffer;
      source.playbackRate.value = playbackRate;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        if (audioContextRef.current === audioContext) {
          audioContextRef.current = null;
          sourceRef.current = null;
        }
        audioContext.close().catch(console.error);
      };
      
      source.start();

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (!row.audio) return;
    const url = URL.createObjectURL(row.audio.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rowNumber}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const buttonClass = "flex items-center justify-center gap-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-md transition transform hover:scale-105 text-xs disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-center gap-2 w-full">
      <button
        onClick={handlePlayPause}
        disabled={!row.audio || isAppBusy}
        className={`${buttonClass} w-24`}
        title={isPlaying ? 'Tạm dừng' : 'Nghe'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
        <span>{isPlaying ? 'DỪNG' : 'NGHE'}</span>
      </button>
      
      <button
        onClick={onGenerate}
        disabled={!row.script || isAppBusy || row.isLoading}
        className={`${buttonClass} w-24 bg-indigo-600 hover:bg-indigo-700`}
        title="Tạo âm thanh"
      >
        {row.isLoading ? <LoaderIcon /> : <span>TẠO</span>}
      </button>
      
      <button
        onClick={handleDownload}
        disabled={!row.audio || isAppBusy}
        className={`${buttonClass} w-24`}
        title="Tải về tệp WAV"
      >
        <DownloadIcon />
        <span>TẢI VỀ</span>
      </button>

      {row.duration != null && (
         <span className="text-xs text-gray-400 w-10 text-center flex-shrink-0">{row.duration.toFixed(1)}s</span>
      )}
    </div>
  );
};