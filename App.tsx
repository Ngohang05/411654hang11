

import React, { useState, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { PREBUILT_VOICES } from './constants';
import { ScriptRowData, Voice } from './types';
import { generateSpeech } from './services/geminiService';
import { decode, decodeAudioData, bufferToWav } from './utils/audioUtils';
import { AudioPlayer } from './components/AudioPlayer';
import { VoiceSelector } from './components/VoiceSelector';
import { LoaderIcon, PlusIcon, TrashIcon, GithubIcon, PlayIcon, PauseIcon, DownloadIcon, UploadIcon, SubtitleIcon, WandIcon } from './components/icons';

const generateColorFromString = (str: string): string => {
  if (!str) return 'transparent';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const App: React.FC = () => {
  const [scriptRows, setScriptRows] = useState<ScriptRowData[]>([
    {
      id: 1,
      character: 'Người dẫn chuyện',
      script: 'Xin chào, chào mừng bạn đến với trình tạo giọng nói AI. Bạn có thể nhập kịch bản của mình tại đây hoặc tải lên một tệp Excel.',
      style: 'thân thiện',
      language: 'vi',
      voice: PREBUILT_VOICES[0],
      audio: null,
      duration: null,
      isLoading: false,
      error: null,
      pause: 0.5,
    },
  ]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingSubtitles, setIsDownloadingSubtitles] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentlyPlayingRowId, setCurrentlyPlayingRowId] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [generationEstimate, setGenerationEstimate] = useState<number | null>(null);
  const [showVoiceSync, setShowVoiceSync] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playAllSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playAllAudioContextRef = useRef<AudioContext | null>(null);
  const playAllTimeoutRef = useRef<number | null>(null);
  const estimateTimerRef = useRef<number | null>(null);


  const isBusy = isGeneratingAll || isDownloadingAll || isPlayingAll || isDownloadingSubtitles;

  const characterColors = useMemo(() => {
    const colors = new Map<string, string>();
    const uniqueCharacters = [...new Set(scriptRows.map(r => r.character))];
    uniqueCharacters.forEach(char => {
      // FIX: Add a type guard to ensure `char` is a string. `char` could be inferred as `unknown`
      // in some strict TypeScript environments, causing a type error.
      if (typeof char === 'string' && char) {
        colors.set(char, generateColorFromString(char));
      }
    });
    return colors;
  }, [scriptRows]);

  const updateRow = useCallback((id: number, updates: Partial<ScriptRowData>) => {
    setScriptRows(rows =>
      rows.map(row => (row.id === id ? { ...row, ...updates } : row))
    );
  }, []);

  const handleAddRow = () => {
    setShowVoiceSync(false);
    setScriptRows(rows => [
      ...rows,
      {
        id: rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1,
        character: `Nhân vật ${rows.length + 1}`,
        script: '',
        style: 'trung tính',
        language: 'vi',
        voice: PREBUILT_VOICES[0],
        audio: null,
        duration: null,
        isLoading: false,
        error: null,
        pause: 0.5,
      },
    ]);
  };

  const handleRemoveRow = (id: number) => {
    setShowVoiceSync(false);
    setScriptRows(rows => rows.filter(row => row.id !== id));
  };

  const handleInputChange = (id: number, field: keyof Omit<ScriptRowData, 'id' | 'voice' | 'audio' | 'duration' | 'isLoading' | 'error' | 'pause' | 'language'>, value: string) => {
    updateRow(id, { [field]: value });
  };

  const handlePauseChange = (id: number, value: string) => {
    if (value === '') {
        updateRow(id, { pause: 0 });
        return;
    }
    const pauseValue = parseFloat(value);
    if (!isNaN(pauseValue) && pauseValue >= 0) {
        updateRow(id, { pause: pauseValue });
    }
  };
  
  const handleGenerateSpeech = useCallback(async (row: ScriptRowData) => {
    if (!row || !row.script) return;
    const { id, style, script, voice, language } = row;

    updateRow(id, { isLoading: true, error: null, audio: null, duration: null });

    try {
      let fullPrompt: string;

      if (language === 'en') {
        const promptInstruction = "Read the following English text";
        const styleInstruction = style ? ` in a ${style} voice` : "";
        fullPrompt = `${promptInstruction}${styleInstruction}: ${script}`;
      } else { // Default to Vietnamese ('vi')
        const promptInstruction = "Hãy đọc đoạn văn bản tiếng Việt sau";
        const styleInstruction = style ? ` với giọng ${style}` : "";
        fullPrompt = `${promptInstruction}${styleInstruction}: ${script}`;
      }
      
      const base64Audio = await generateSpeech(fullPrompt, voice.id);
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const decodedBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);
        const audioBlob = bufferToWav(audioBuffer);
        
        updateRow(id, {
          audio: { buffer: audioBuffer, blob: audioBlob },
          duration: audioBuffer.duration,
          isLoading: false,
        });
        await audioContext.close();
      } else {
        throw new Error("Đã nhận dữ liệu âm thanh trống từ API.");
      }
    } catch (error) {
      console.error(`Lỗi tạo giọng nói cho dòng ${id}:`, error);
      // FIX: Explicitly handle the unknown error type to ensure a string is always produced.
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      updateRow(id, {
        isLoading: false,
        error: errorMessage,
      });
    }
  }, [updateRow]);

  const handleGenerateAll = async () => {
    if (estimateTimerRef.current) {
        clearInterval(estimateTimerRef.current);
    }
    setIsGeneratingAll(true);
    const rowsToGenerate = scriptRows.filter(row => row.script && !row.audio);
    
    const CHARS_PER_SECOND_ESTIMATE = 25;
    const OVERHEAD_PER_REQUEST_SECONDS = 0.8;
    const totalChars = rowsToGenerate.reduce((acc, row) => acc + row.script.length, 0);
    const initialEstimate = Math.ceil((totalChars / CHARS_PER_SECOND_ESTIMATE) + (rowsToGenerate.length * OVERHEAD_PER_REQUEST_SECONDS));
    setGenerationEstimate(initialEstimate);

    estimateTimerRef.current = window.setInterval(() => {
        setGenerationEstimate(prev => (prev !== null && prev > 1 ? prev - 1 : null));
    }, 1000);

    const generationPromises = rowsToGenerate.map(row => handleGenerateSpeech(row));

    try {
        await Promise.all(generationPromises);
    } catch (error) {
        console.error("Một hoặc nhiều quá trình tạo giọng nói đã thất bại:", error);
    } finally {
        if (estimateTimerRef.current) {
            clearInterval(estimateTimerRef.current);
            estimateTimerRef.current = null;
        }
        setGenerationEstimate(null);
        setIsGeneratingAll(false);
    }
  };

  const stopAllPlayback = useCallback(async () => {
    if (playAllTimeoutRef.current) {
      clearTimeout(playAllTimeoutRef.current);
      playAllTimeoutRef.current = null;
    }
    if (playAllSourceRef.current) {
      playAllSourceRef.current.onended = null;
      try { playAllSourceRef.current.stop(); } catch (e) {}
      playAllSourceRef.current = null;
    }
    if (playAllAudioContextRef.current) {
      if (playAllAudioContextRef.current.state !== 'closed') {
        await playAllAudioContextRef.current.close().catch(console.error);
      }
      playAllAudioContextRef.current = null;
    }
    setIsPlayingAll(false);
    setCurrentlyPlayingRowId(null);
  }, []);

  const handlePlayAll = async () => {
    if (isPlayingAll) {
      await stopAllPlayback();
      return;
    }
  
    const rowsWithAudio = scriptRows.filter(
      (row): row is ScriptRowData & { audio: { buffer: AudioBuffer; blob: Blob } } =>
        !!row.audio?.buffer
    );
  
    if (rowsWithAudio.length === 0) {
      alert("Chưa có âm thanh nào được tạo để phát.");
      return;
    }
  
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playAllAudioContextRef.current = audioContext;
      setIsPlayingAll(true);
  
      let currentIndex = 0;
  
      const playNextInQueue = () => {
        if (currentIndex >= rowsWithAudio.length || !playAllAudioContextRef.current || playAllAudioContextRef.current.state === 'closed') {
          stopAllPlayback();
          return;
        }
  
        const currentRow = rowsWithAudio[currentIndex];
        setCurrentlyPlayingRowId(currentRow.id);
  
        const source = audioContext.createBufferSource();
        source.buffer = currentRow.audio.buffer;
        source.playbackRate.value = playbackRate;
        source.connect(audioContext.destination);
        playAllSourceRef.current = source;
  
        source.onended = () => {
          if (playAllSourceRef.current !== source) {
            return;
          }

          if (playAllAudioContextRef.current?.state === 'closed') {
            return;
          }
          const pauseDuration = currentRow.pause ?? 0;
          playAllTimeoutRef.current = window.setTimeout(() => {
            currentIndex++;
            playNextInQueue();
          }, pauseDuration * 1000);
        };
  
        source.start();
      };
  
      playNextInQueue();
    } catch (error) {
      console.error("Lỗi khi phát tất cả âm thanh:", error);
      alert("Đã có lỗi xảy ra khi phát âm thanh.");
      await stopAllPlayback();
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    try {
      const rowsWithAudio = scriptRows.filter(row => row.audio);

      if (rowsWithAudio.length === 0) {
        alert("Chưa có âm thanh nào được tạo. Vui lòng tạo âm thanh trước khi tải xuống.");
        setIsDownloadingAll(false);
        return;
      }

      for (let i = 0; i < scriptRows.length; i++) {
        const row = scriptRows[i];
        if (row.audio) {
          const url = URL.createObjectURL(row.audio.blob);
          const a = document.createElement('a');
          a.href = url;
          
          const characterName = (row.character || `nhan_vat_${i + 1}`).replace(/[\s/\\?%*:|"<>]/g, '_').trim();
          
          a.download = `${i + 1}-${characterName}.wav`;
          
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

    } catch (error) {
       console.error("Lỗi khi tải xuống nhiều tệp âm thanh:", error);
       alert("Đã có lỗi xảy ra khi chuẩn bị các tệp tải xuống.");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const formatSrtTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
  };

  const handleDownloadSubtitles = () => {
      setIsDownloadingSubtitles(true);
      try {
          const rowsWithAudio = scriptRows.filter(row => row.audio && row.duration != null);
          if (rowsWithAudio.length === 0) {
              alert("Chưa có âm thanh nào được tạo. Không thể tạo phụ đề.");
              return;
          }

          let srtContent = '';
          let currentTime = 0;

          rowsWithAudio.forEach((row, index) => {
              if (row.duration) {
                  const startTime = currentTime;
                  const endTime = currentTime + row.duration;

                  srtContent += `${index + 1}\n`;
                  srtContent += `${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n`;
                  srtContent += `${row.script}\n\n`;

                  currentTime = endTime + (row.pause ?? 0);
              }
          });

          const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'phude.srt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

      } catch (error) {
          console.error("Lỗi khi tạo tệp phụ đề:", error);
          alert("Đã có lỗi xảy ra khi tạo tệp phụ đề.");
      } finally {
          setIsDownloadingSubtitles(false);
      }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setShowVoiceSync(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        
        const dataRows = rows.slice(1);

        if (dataRows.length === 0) {
          throw new Error("Tệp Excel trống hoặc không có dữ liệu (bỏ qua hàng tiêu đề).");
        }
        
        const defaultVoiceForUpload = PREBUILT_VOICES[0];
        const newScriptRows: ScriptRowData[] = dataRows
          .map((row, index) => {
              const character = row[1] || '';
              const script = row[2] || '';
              const style = row[3] || 'trung tính';
              const langRaw = String(row[4] || 'vi').toLowerCase();
              const language = langRaw.includes('en') ? 'en' : 'vi';

              if (!character && !script) {
                  return null;
              }

              return {
                id: index + 1,
                character: String(character).trim() || `Nhân vật ${index + 1}`,
                script: String(script).trim(),
                style: String(style).trim(),
                language,
                voice: defaultVoiceForUpload,
                audio: null,
                duration: null,
                isLoading: false,
                error: null,
                pause: 0.5,
              };
          })
          .filter((row): row is ScriptRowData => row !== null);

        if (newScriptRows.length === 0) {
           throw new Error("Không tìm thấy dữ liệu hợp lệ trong các cột dự kiến (Nhân vật, Kịch bản). Vui lòng kiểm tra tệp Excel của bạn.");
        }

        setScriptRows(newScriptRows);
        setShowVoiceSync(true);

      } catch (error) {
        setShowVoiceSync(false);
        console.error("Lỗi khi xử lý tệp Excel:", error);
        alert(`Đã xảy ra lỗi khi đọc tệp Excel: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`);
      }
    };
    reader.onerror = () => {
        alert('Không thể đọc tệp. Vui lòng thử lại.');
    };
    reader.readAsArrayBuffer(file);
    
    if(event.target) {
      event.target.value = '';
    }
  };

  const handleVoiceChange = (voice: Voice) => {
      setShowVoiceSync(false);
      setScriptRows(rows => rows.map(row => ({...row, voice: voice})));
  };

  const handleSyncVoices = () => {
    const voiceMap = new Map<string, Voice>();
    PREBUILT_VOICES.forEach(voice => {
      voiceMap.set(voice.name.toLowerCase(), voice);
    });

    let changesMade = 0;
    const updatedRows = scriptRows.map(row => {
      const characterNameLower = row.character.toLowerCase();
      const matchedVoice = voiceMap.get(characterNameLower);
      if (matchedVoice && row.voice.id !== matchedVoice.id) {
        changesMade++;
        return { ...row, voice: matchedVoice };
      }
      return row;
    });

    if (changesMade > 0) {
      setScriptRows(updatedRows);
      alert(`Đồng bộ giọng nói hoàn tất. Đã cập nhật ${changesMade} dòng.`);
    } else {
      alert('Không tìm thấy nhân vật nào có tên trùng với giọng nói có sẵn để đồng bộ.');
    }
    setShowVoiceSync(false);
  };
  
  const getGlobalVoice = (): Voice | null => {
    if (scriptRows.length === 0) {
      return PREBUILT_VOICES[0];
    }
    const firstVoiceId = scriptRows[0].voice.id;
    const allHaveSameVoice = scriptRows.every(row => row.voice.id === firstVoiceId);
    return allHaveSameVoice ? scriptRows[0].voice : null;
  };
  
  const globalVoice = getGlobalVoice();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">TM -MEDIA (voice)</h1>
          </div>
          <a 
            href="https://github.com/google/aistudio-apps/tree/main/prototyping/voiceover-studio" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mt-4 sm:mt-0"
          >
            <GithubIcon />
            <span>Xem trên GitHub</span>
          </a>
        </header>

        <main>
          <div className="bg-gray-800 rounded-lg shadow-lg">
            <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-800 rounded-t-lg border-b border-gray-700">
              <div className="flex-shrink-0 w-full sm:w-auto sm:max-w-xs">
                 <VoiceSelector
                    selectedVoice={globalVoice}
                    onVoiceChange={handleVoiceChange}
                    disabled={isBusy}
                 />
              </div>

              <div className="flex-grow flex flex-wrap items-center justify-end gap-4">
                 <div className="flex items-center gap-2">
                    <label htmlFor="playback-rate" className="text-sm font-medium text-gray-300 whitespace-nowrap">Tốc độ:</label>
                    <input
                        id="playback-rate"
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={playbackRate}
                        onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                        disabled={isBusy}
                        className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-sm font-semibold text-white w-10 text-right">{playbackRate.toFixed(1)}x</span>
                </div>
                <button
                  onClick={handlePlayAll}
                  disabled={isBusy || scriptRows.every(r => !r.audio)}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isPlayingAll ? <PauseIcon /> : <PlayIcon />}
                  <span>{isPlayingAll ? 'Dừng' : 'Nghe tất cả'}</span>
                </button>
                 
                <button
                  onClick={handleGenerateAll}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isGeneratingAll ? <LoaderIcon /> : <PlayIcon />}
                  <span>
                    {isGeneratingAll 
                        ? `Đang tạo... ${generationEstimate !== null ? `(${generationEstimate}s)` : ''}` 
                        : 'Tạo tất cả'}
                  </span>
                </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={isBusy || scriptRows.every(r => !r.audio)}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isDownloadingAll ? <LoaderIcon /> : <DownloadIcon />}
                  <span>{isDownloadingAll ? 'Đang chuẩn bị...' : 'Tải xuống tất cả'}</span>
                </button>
                <button
                  onClick={handleDownloadSubtitles}
                  disabled={isBusy || scriptRows.every(r => !r.audio)}
                  className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isDownloadingSubtitles ? <LoaderIcon /> : <SubtitleIcon />}
                  <span>{isDownloadingSubtitles ? 'Đang tạo...' : 'Tải phụ đề'}</span>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                
                {showVoiceSync && (
                  <button
                    onClick={handleSyncVoices}
                    disabled={isBusy}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    title="Tự động gán giọng nói cho các nhân vật có tên trùng với giọng nói có sẵn."
                  >
                    <WandIcon />
                    <span>Đồng bộ giọng nói</span>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition transform hover:scale-105 disabled:bg-gray-800 disabled:cursor-not-allowed"
                >
                  <UploadIcon />
                  <span>Tải lên Excel</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[50px_1.5fr_3fr_1.5fr_1fr_120px_320px_auto] gap-4 items-center p-4 font-semibold text-sm text-gray-400 bg-gray-900/50">
              <div className="text-center">SỐ THỨ TỰ</div>
              <div>Nhân vật</div>
              <div>Kịch bản</div>
              <div>Chỉ dẫn Phong cách</div>
              <div>Ngôn ngữ</div>
              <div className="text-center">Tạm dừng (s)</div>
              <div className="text-center">Hành động</div>
              <div></div>
            </div>

            <div className="divide-y divide-gray-700">
             {scriptRows.map((row, index) => (
                <div key={row.id} className={`grid grid-cols-[50px_1.5fr_3fr_1.5fr_1fr_120px_320px_auto] gap-4 items-center p-4 hover:bg-gray-700/50 transition-colors ${
                  currentlyPlayingRowId === row.id ? 'bg-blue-900/50' : ''
                }`}>
                  <div className="text-center text-gray-400">{index + 1}</div>
                  
                  <input
                    type="text"
                    value={row.character}
                    onChange={(e) => handleInputChange(row.id, 'character', e.target.value)}
                    disabled={isBusy}
                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                    style={{ borderLeft: `4px solid ${characterColors.get(row.character) || 'transparent'}` }}
                  />
                  <textarea
                    value={row.script}
                    onChange={(e) => handleInputChange(row.id, 'script', e.target.value)}
                    disabled={isBusy}
                    rows={2}
                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                  />
                   <input
                    type="text"
                    value={row.style}
                    onChange={(e) => handleInputChange(row.id, 'style', e.target.value)}
                    placeholder="ví dụ: vui vẻ, thì thầm, trang trọng"
                    disabled={isBusy}
                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                  />
                  <select
                    value={row.language}
                    onChange={(e) => updateRow(row.id, { language: e.target.value })}
                    disabled={isBusy}
                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                  >
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                  <input
                    type="number"
                    value={row.pause}
                    onChange={(e) => handlePauseChange(row.id, e.target.value)}
                    step="0.1"
                    min="0"
                    disabled={isBusy}
                    className="w-20 mx-auto bg-gray-700 border-gray-600 rounded-md p-2 text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                    title="Khoảng dừng sau dòng này (giây)"
                   />
                  <div className="col-span-1">
                     <AudioPlayer
                        row={row}
                        rowNumber={index + 1}
                        onGenerate={() => handleGenerateSpeech(row)}
                        isAppBusy={isBusy}
                        playbackRate={playbackRate}
                      />
                  </div>
                  <button
                    onClick={() => handleRemoveRow(row.id)}
                    disabled={isBusy}
                    className="text-gray-500 hover:text-red-500 transition transform hover:scale-110 disabled:text-gray-700 disabled:cursor-not-allowed p-2 rounded-full"
                    title="Xóa dòng"
                  >
                    <TrashIcon />
                  </button>
                </div>
             ))}
            </div>

            <div className="p-4 border-t border-gray-700">
               <button
                  onClick={handleAddRow}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition transform hover:scale-105 w-full sm:w-auto disabled:bg-gray-800 disabled:cursor-not-allowed"
                >
                  <PlusIcon />
                  <span>Thêm dòng</span>
                </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;