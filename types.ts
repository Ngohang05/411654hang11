export interface Voice {
  id: string;
  name: string;
  description: string;
}

export interface ScriptRowData {
  id: number;
  character: string;
  script: string;
  style: string;
  language: string;
  voice: Voice;
  audio: { buffer: AudioBuffer; blob: Blob } | null;
  duration: number | null;
  isLoading: boolean;
  error: string | null;
  pause: number;
}