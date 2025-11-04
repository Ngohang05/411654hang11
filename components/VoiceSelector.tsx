
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PREBUILT_VOICES } from '../constants';
import { Voice } from '../types';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { ChevronDownIcon, PlayIcon, PauseIcon, LoaderIcon } from './icons';

interface VoiceSelectorProps {
  selectedVoice: Voice | null;
  onVoiceChange: (voice: Voice) => void;
  disabled: boolean;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onVoiceChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewCache, setPreviewCache] = useState<Record<string, AudioBuffer>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const stopCurrentPlayback = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    setPlayingPreview(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      stopCurrentPlayback();
    };
  }, [stopCurrentPlayback]);

  useEffect(() => {
    if (!isOpen) {
      stopCurrentPlayback();
    }
  }, [isOpen, stopCurrentPlayback]);

  const handleSelectVoice = (voice: Voice) => {
    onVoiceChange(voice);
    setIsOpen(false);
  };

  const playAudio = useCallback((buffer: AudioBuffer, voiceId: string) => {
    stopCurrentPlayback();
    const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (playingPreview === voiceId) {
        setPlayingPreview(null);
      }
      if (audioContextRef.current === context) {
        audioContextRef.current = null;
      }
      context.close().catch(console.error);
    };
    source.start();
    audioContextRef.current = context;
    sourceRef.current = source;
    setPlayingPreview(voiceId);
  }, [stopCurrentPlayback, playingPreview]);

  const handlePreview = async (e: React.MouseEvent, voice: Voice) => {
    e.stopPropagation();
    if (loadingPreview) return;
    if (playingPreview === voice.id) {
      stopCurrentPlayback();
      return;
    }

    if (previewCache[voice.id]) {
      playAudio(previewCache[voice.id], voice.id);
      return;
    }

    setLoadingPreview(voice.id);
    stopCurrentPlayback();

    try {
      const base64Audio = await generateSpeech("Xin chào, đây là bản xem trước giọng nói của tôi.", voice.id);
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const decodedBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);
        await audioContext.close();
        setPreviewCache(prev => ({ ...prev, [voice.id]: audioBuffer }));
        playAudio(audioBuffer, voice.id);
      }
    } catch (error) {
      console.error("Lỗi tạo xem trước giọng nói:", error);
      alert("Không thể tạo xem trước giọng nói.");
    } finally {
      setLoadingPreview(null);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <label htmlFor="voice-selector-button" className="block text-sm font-medium text-gray-300 mb-2">
        Chọn một giọng nói
      </label>
      <button
        id="voice-selector-button"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center justify-between w-full bg-gray-900 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 text-gray-200 disabled:bg-gray-700 disabled:cursor-not-allowed transform hover:scale-[1.02]"
      >
        <span>{selectedVoice?.name || 'Nhiều giọng nói'}</span>
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className="absolute z-10 top-full mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          <ul className="divide-y divide-gray-700">
            {PREBUILT_VOICES.map(voice => (
              <li
                key={voice.id}
                onClick={() => handleSelectVoice(voice)}
                className="p-3 hover:bg-gray-700/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{voice.name}</p>
                    <p className="text-sm text-gray-400">{voice.description}</p>
                  </div>
                  <button
                    onClick={(e) => handlePreview(e, voice)}
                    className="p-2 rounded-full hover:bg-gray-600 text-gray-300 hover:text-white transition transform hover:scale-110"
                    aria-label={`Nghe thử giọng ${voice.name}`}
                  >
                    {loadingPreview === voice.id ? <LoaderIcon /> : 
                     playingPreview === voice.id ? <PauseIcon /> : 
                     <PlayIcon />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
       <p className="text-xs text-gray-400 mt-2">
        {selectedVoice?.description || 'Nhiều giọng nói đang được sử dụng. Chọn một giọng nói để áp dụng cho tất cả các dòng.'}
      </p>
    </div>
  );
};