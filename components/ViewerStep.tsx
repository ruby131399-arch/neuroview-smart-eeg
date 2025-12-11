
import React, { useState, useMemo, useEffect } from 'react';
import { FileConfig, Annotation, PatientInfo } from '../types';
import { ChevronLeft, ChevronRight, Plus, Tag, Trash2, AlertOctagon, CheckCircle, HelpCircle, AlertTriangle, ZoomIn, User, Clock, Activity, Waves } from 'lucide-react';
import AnnotationList from './AnnotationList';
import Spectrogram from './Spectrogram';
import EEGCanvas from './EEGCanvas';

interface Props {
    data: number[][]; // [row][col]
    config: FileConfig;
    patient: PatientInfo;
    filename: string;
    existingAnnotations: Annotation[];
    onUpdateAnnotations: (anns: Annotation[]) => void;
    onConfigChange: (config: FileConfig) => void;
    initialGain?: number; // Saved gain value
    onGainChange?: (gain: number) => void; // Callback when gain changes
}

// Helper Hook for Debouncing
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

const ViewerStep: React.FC<Props> = ({ data, config, patient, filename, existingAnnotations, onUpdateAnnotations, onConfigChange, initialGain, onGainChange }) => {
    const [currentTrial, setCurrentTrial] = useState(0);
    const [annotations, setAnnotations] = useState<Annotation[]>(existingAnnotations);
    const [newNote, setNewNote] = useState('');
    const [selectedType, setSelectedType] = useState<Annotation['type']>('normal');

    // Debounced State
    const [yScale, setYScale] = useState(initialGain || 1); // Use saved gain or default to 1
    const [tempScale, setTempScale] = useState((initialGain || 1).toString());
    const debouncedScale = useDebounce(tempScale, 500);

    const [tempDuration, setTempDuration] = useState(config.trialDurationSec.toString());
    const debouncedDuration = useDebounce(tempDuration, 500);

    // New State for View Mode and Spectrogram Channel
    const [viewMode, setViewMode] = useState<'raw' | 'spectrogram'>('raw');
    const [spectrogramChannel, setSpectrogramChannel] = useState(0);
    const [isScrollMode, setIsScrollMode] = useState(false);

    // Effect: Update Scale when Debounced Value changes
    useEffect(() => {
        const val = parseFloat(debouncedScale);
        if (!isNaN(val) && val !== yScale) {
            setYScale(val);
            onGainChange?.(val); // Notify parent component
        }
    }, [debouncedScale, yScale, onGainChange]);

    // Effect: Update Duration when Debounced Value changes
    useEffect(() => {
        const val = parseInt(debouncedDuration);
        if (!isNaN(val) && val > 0 && val !== config.trialDurationSec) {
            onConfigChange({ ...config, trialDurationSec: val });
        }
    }, [debouncedDuration, config, onConfigChange]);

    // Calculate constants
    const pointsPerTrial = config.samplingRate * config.trialDurationSec;
    const totalTrials = Math.ceil(data.length / pointsPerTrial);

    // Prepare data for the current trial or full view
    const currentTrialDataSlice = useMemo(() => {
        if (isScrollMode) return data; // Return all data
        const startIndex = currentTrial * pointsPerTrial;
        const endIndex = Math.min(startIndex + pointsPerTrial, data.length);
        return data.slice(startIndex, endIndex);
    }, [data, currentTrial, pointsPerTrial, isScrollMode]);

    // Extract single channel data for Spectrogram
    const spectrogramDataSeries = useMemo(() => {
        if (viewMode !== 'spectrogram') return [];
        return currentTrialDataSlice.map(row => row[spectrogramChannel] || 0);
    }, [currentTrialDataSlice, viewMode, spectrogramChannel]);

    const handlePrev = () => setCurrentTrial(c => Math.max(0, c - 1));
    const handleNext = () => setCurrentTrial(c => Math.min(totalTrials - 1, c + 1));

    const addAnnotation = () => {
        if (!newNote.trim()) return;

        const newAnn: Annotation = {
            id: Date.now().toString(),
            trialIndex: currentTrial,
            timestamp: currentTrial * config.trialDurationSec,
            note: newNote,
            type: selectedType
        };

        const updated = [...annotations, newAnn];
        setAnnotations(updated);
        onUpdateAnnotations(updated);
        setNewNote('');
    };

    const deleteAnnotation = (id: string) => {
        const updated = annotations.filter(a => a.id !== id);
        setAnnotations(updated);
        onUpdateAnnotations(updated);
    };

    const jumpToTrial = (idx: number) => {
        setCurrentTrial(idx);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [totalTrials]);

    // Colors for lines
    const colors = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#d946ef', '#64748b'];

    // Memoize the visualization content
    const visualizationContent = useMemo(() => {
        if (viewMode === 'raw') {
            return (
                <>
                    <div className="absolute top-2 right-2 z-10 bg-white/90 p-2 rounded text-xs text-slate-500 font-mono pointer-events-none border border-slate-100 shadow-sm">
                        {config.channelCount} Channels @ {config.samplingRate}Hz
                    </div>

                    {currentTrialDataSlice.length > 0 ? (
                        <div className={`w-full h-full overflow-auto relative ${isScrollMode ? 'overflow-x-auto' : ''}`}>
                            <div style={{
                                width: isScrollMode ? Math.min(Math.max(1000, (currentTrialDataSlice.length / config.samplingRate) * 100), 32000) : '100%',
                                height: '100%'
                            }}>
                                <EEGCanvas
                                    data={currentTrialDataSlice}
                                    config={config}
                                    yScale={yScale}
                                    channelColors={colors}
                                    startTime={isScrollMode ? 0 : currentTrial * config.trialDurationSec}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            No Data available for this trial range
                        </div>
                    )}
                </>
            );
        } else {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <div className="w-full h-full flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-bold text-slate-700">
                                Time-Frequency Analysis (Channel {spectrogramChannel + 1})
                            </h4>
                            <span className="text-xs text-slate-500 font-mono">
                                Window: Hanning | FFT: 256
                            </span>
                        </div>
                        <div className="flex-1 bg-slate-900 rounded-lg overflow-auto relative">
                            {spectrogramDataSeries.length > 0 ? (
                                <Spectrogram
                                    data={spectrogramDataSeries}
                                    sampleRate={config.samplingRate}
                                    height={500}
                                />
                            ) : (
                                <div className="text-white text-center mt-20">No Data</div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
    }, [viewMode, config, currentTrialDataSlice, spectrogramDataSeries, spectrogramChannel, colors, yScale]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="flex-1 flex overflow-hidden">
                {/* Main Center Area */}
                <div className="flex-1 flex flex-col p-4 overflow-y-auto relative">
                    {/* Top Toolbar */}
                    <div className="flex flex-col gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                        {/* Row 1: Navigation & Patient */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button onClick={handlePrev} disabled={currentTrial === 0} className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors">
                                    <ChevronLeft />
                                </button>
                                <div className="text-center">
                                    <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Trial</span>
                                    <div className="font-mono text-lg font-bold text-slate-800">
                                        {currentTrial + 1} <span className="text-slate-400">/ {totalTrials}</span>
                                    </div>
                                </div>
                                <button onClick={handleNext} disabled={currentTrial === totalTrials - 1} className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors">
                                    <ChevronRight />
                                </button>
                            </div>
                            {/* Patient Badge */}
                            {(patient.id || patient.name) && (
                                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 text-blue-800">
                                    <User size={16} />
                                    <div className="flex flex-col leading-none">
                                        <span className="font-bold text-xs">{patient.name || 'Unknown Patient'}</span>
                                        <span className="text-[10px] opacity-70">
                                            {patient.age ? `${patient.age}yo` : ''}
                                            {patient.gender ? ` • ${patient.gender}` : ''}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="h-px bg-slate-100 w-full" />
                        {/* Row 2: Controls & View Toggles */}
                        <div className="flex items-center justify-between">
                            {/* View Mode Tabs */}
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setViewMode('raw')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'raw' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Activity size={16} /> Raw Signals
                                </button>
                                <button
                                    onClick={() => setViewMode('spectrogram')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'spectrogram' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Waves size={16} /> Spectrogram
                                </button>
                                <div className="ml-2 pl-2 border-l border-slate-200">
                                    <button
                                        onClick={() => setIsScrollMode(!isScrollMode)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${isScrollMode ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}
                                        title="View entire dataset in one scrollable view"
                                    >
                                        <Activity size={16} /> {isScrollMode ? 'Scrolling All' : 'Paged View'}
                                    </button>
                                </div>
                            </div>
                            {/* Dynamic Controls based on View Mode */}
                            <div className="flex items-center gap-4 text-sm">
                                {viewMode === 'raw' ? (
                                    <div className="flex items-center gap-4 animate-in fade-in">
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                            <ZoomIn size={16} className="text-slate-500" />
                                            <span className="text-slate-600 font-medium">Gain:</span>
                                            <input
                                                type="number"
                                                value={tempScale}
                                                onChange={(e) => setTempScale(e.target.value)}
                                                step="0.1"
                                                className="w-16 bg-transparent border-0 border-b border-slate-300 focus:border-primary-500 focus:ring-0 px-1 py-0 text-right font-mono text-slate-800"
                                            />
                                            <span className="text-xs text-slate-400">x</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4 animate-in fade-in">
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                            <span className="text-slate-600 font-medium">Channel:</span>
                                            <select
                                                value={spectrogramChannel}
                                                onChange={(e) => setSpectrogramChannel(Number(e.target.value))}
                                                className="bg-transparent border-none text-sm font-mono text-primary-700 font-bold focus:ring-0 cursor-pointer"
                                            >
                                                {Array.from({ length: config.channelCount }).map((_, i) => (
                                                    <option key={i} value={i}>Channel {i + 1}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                    <Clock size={16} className="text-slate-500" />
                                    <span className="text-slate-600 font-medium">Window:</span>
                                    <input
                                        type="number"
                                        value={tempDuration}
                                        onChange={(e) => setTempDuration(e.target.value)}
                                        className="w-12 bg-transparent border-0 border-b border-slate-300 focus:border-primary-500 focus:ring-0 px-1 py-0 text-right font-mono text-slate-800"
                                    />
                                    <span className="text-xs text-slate-400">s</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visualization Area */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-2 relative flex flex-col min-h-[300px] overflow-hidden">
                        {visualizationContent}
                    </div>
                </div>
                {/* Right Sidebar */}
                <aside className="w-80 bg-white border-l border-slate-200 flex flex-col z-20 shadow-xl shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Tag size={18} className="text-primary-600" />
                            Annotate Trial {currentTrial + 1}
                        </h3>
                    </div>
                    <div className="p-4 space-y-3 border-b border-slate-200">
                        <select
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value as any)}
                        >
                            <option value="normal">Mark as Normal</option>
                            <option value="artifact">Artifact (Noise)</option>
                            <option value="seizure">Seizure Activity</option>
                            <option value="other">Other</option>
                        </select>
                        <textarea
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                            rows={3}
                            placeholder="Enter observations..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    addAnnotation();
                                }
                            }}
                        />
                        <button
                            onClick={addAnnotation}
                            disabled={!newNote.trim()}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Plus size={16} /> Add Note
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-slate-50">
                        <AnnotationList
                            annotations={annotations}
                            currentTrial={currentTrial}
                            onDelete={deleteAnnotation}
                            onJump={jumpToTrial}
                        />
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default ViewerStep;
