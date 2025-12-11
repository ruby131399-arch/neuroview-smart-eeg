export type DataOrientation = 'rows-are-time' | 'rows-are-channels';

export interface FileConfig {
  samplingRate: number;
  channelCount: number;
  skipRows: number;
  skipCols: number;
  trialDurationSec: number;
  orientation: DataOrientation;
}

export interface PatientInfo {
  id: string;
  name: string;
  age: string;
  dob: string;
  gender?: string;
  height?: string;
  weight?: string;
}

export interface Annotation {
  id: string;
  trialIndex: number;
  timestamp: number; // relative to start of recording in seconds
  note: string;
  type: 'artifact' | 'seizure' | 'normal' | 'other';
}

export interface EEGState {
  status: 'idle' | 'configuring' | 'viewing';
  config: FileConfig;
  patient: PatientInfo;
  filename: string;
  rawText: string; // Small buffer for preview
  fullRawText?: string; // Full content for parsing
  fullData: number[][]; // [Row][Channel]
  annotations: Annotation[];
  gain?: number; // Y-axis scale/gain for visualization
}

export type ParsedData = number[][];