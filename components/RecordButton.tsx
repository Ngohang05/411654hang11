import React from 'react';
import { MicrophoneIcon, StopIcon } from './icons';

interface RecordButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}

export const RecordButton: React.FC<RecordButtonProps> = ({ isRecording, onStart, onStop, disabled }) => {
  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
        ${isRecording 
          ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' 
          : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-400'
        }
        ${disabled ? 'bg-gray-600 cursor-not-allowed' : ''}
      `}
    >
      <span className="sr-only">{isRecording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}</span>
      {isRecording ? <StopIcon /> : <MicrophoneIcon />}
      {isRecording && <span className="absolute w-full h-full bg-red-500 rounded-full animate-ping opacity-75"></span>}
    </button>
  );
};