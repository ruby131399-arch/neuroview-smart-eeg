import React, { useState, useMemo } from 'react';
import { FileConfig, PatientInfo } from '../types';
import { processFullData } from '../utils/parser';
import { fetchPatientData } from '../utils/fhir';
import { Settings, ArrowRight, Grid, Clock, Activity, AlignVerticalSpaceAround, AlignHorizontalSpaceAround, ZoomIn, User, Search, Loader2 } from 'lucide-react';
import EEGCanvas from './EEGCanvas';

interface Props {
    rawText: string;
    fullText: string;
    filename: string;
    initialConfig: FileConfig;
    initialPatient: PatientInfo;
    onStart: (data: number[][], config: FileConfig, patient: PatientInfo) => void;
}

const ConfigStep: React.FC<Props> = ({ rawText, fullText, filename, initialConfig, initialPatient, onStart }) => {
    const [config, setConfig] = useState<FileConfig>(initialConfig);
    const [patient, setPatient] = useState<PatientInfo>(initialPatient);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewScale, setPreviewScale] = useState(1);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    // FHIR Search Logic
    const handleSearchPatient = async () => {
        const id = patient.id.trim();
        if (!id) return;

        setIsSearching(true);
        setSearchError(null);
        try {
            const data = await fetchPatientData(id);
            setPatient(data);
        } catch (e: any) {
            setSearchError("Not found");
        } finally {
            setIsSearching(false);
        }
    };

    // Parse a chunk of data for preview purposes
    // Parse a chunk of data for preview purposes
    const parsedPreviewRaw = useMemo(() => {
        // Use fullText if available to ensure we can reach deep rows that might be outside the initial rawText buffer
        const textToUse = fullText.length > rawText.length ? fullText : rawText;

        const lines: string[] = [];
        // We need enough data for the Chart (e.g. 3 seconds @ 500Hz = ~1500 points) + Table (20 rows)
        // Revert to smaller limits as requested
        const limit = config.orientation === 'rows-are-time' ? 2000 : Math.max(256, config.channelCount + 10);

        let pos = 0;
        let skipped = 0;

        // Auto-detect delimiter preference (favors \n, falls back to \r)
        const delimiter = textToUse.indexOf('\n') !== -1 ? '\n' : '\r';

        while (pos < textToUse.length && lines.length < limit) {
            const nextDelim = textToUse.indexOf(delimiter, pos);
            const end = nextDelim === -1 ? textToUse.length : nextDelim;

            const line = textToUse.slice(pos, end).trim();
            pos = end + 1;

            if (line.length > 0) {
                if (skipped < config.skipRows) {
                    skipped++;
                } else {
                    lines.push(line);
                }
            }

            if (nextDelim === -1) break;
        }

        return lines.map((line) => {
            const values = line.split(/[,\t;]+/).map(v => v.trim());
            const usefulCols = values.slice(config.skipCols).map(v => parseFloat(v));
            return usefulCols;
        });
    }, [fullText, rawText, config.skipRows, config.skipCols, config.orientation, config.channelCount]);

    // Prepare data for Canvas (Standardized: Rows = Time)
    const canvasData = useMemo(() => {
        if (parsedPreviewRaw.length === 0) return [];

        if (config.orientation === 'rows-are-time') {
            return parsedPreviewRaw;
        } else {
            // Transpose: Input is [Channel][Time] -> Output [Time][Channel]
            const channelRows = parsedPreviewRaw;
            if (channelRows.length === 0) return [];

            const numChannels = Math.min(channelRows.length, config.channelCount);
            const numPoints = channelRows[0].length;

            const transposed: number[][] = [];
            for (let t = 0; t < numPoints; t++) {
                const timePoint: number[] = [];
                for (let ch = 0; ch < numChannels; ch++) {
                    timePoint.push(channelRows[ch][t] || 0);
                }
                transposed.push(timePoint);
            }
            return transposed;
        }
    }, [parsedPreviewRaw, config.orientation, config.channelCount]);

    const handleStart = () => {
        setIsProcessing(true);
        setTimeout(() => {
            try {
                const data = processFullData(
                    fullText,
                    config.skipRows,
                    config.skipCols,
                    config.channelCount,
                    config.orientation
                );
                onStart(data, config, patient);
            } catch (e) {
                console.error(e);
                alert("Error parsing data. Please check your settings.");
                setIsProcessing(false);
            }
        }, 100);
    };

    const colors = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#d946ef', '#64748b'];

    return (
        <div className="h-full flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar Controls */}
            <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0 z-10 shadow-lg">
                <div className="p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Settings size={20} className="text-primary-600" />
                        Configuration
                    </h2>
                    <p className="text-sm text-slate-500 mt-1 truncate" title={filename}>{filename}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">

                    {/* Patient Info Section */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <User size={16} className="text-primary-600" /> Patient Information
                        </label>
                        <div className="space-y-1 relative">
                            <span className="text-xs text-slate-500">Patient ID (FHIR Lookup)</span>
                            <div className="relative flex gap-1">
                                <input
                                    type="text"
                                    value={patient.id}
                                    onChange={e => {
                                        setPatient({ ...patient, id: e.target.value });
                                        setSearchError(null);
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && handleSearchPatient()}
                                    placeholder="Enter ID..."
                                    className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm uppercase"
                                />
                                <button
                                    onClick={handleSearchPatient}
                                    disabled={isSearching || !patient.id}
                                    className="px-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                </button>
                            </div>
                            {searchError && <div className="text-[10px] text-red-500">{searchError}</div>}
                        </div>

                        {patient.name && (
                            <div className="text-xs font-medium text-slate-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 animate-in fade-in">
                                {patient.name} ({patient.gender || 'Unknown'})
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Age</span>
                                <input
                                    type="text"
                                    value={patient.age}
                                    onChange={e => setPatient({ ...patient, age: e.target.value })}
                                    placeholder="Age"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm bg-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Birth Date</span>
                                <input
                                    type="date"
                                    value={patient.dob}
                                    onChange={e => setPatient({ ...patient, dob: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm bg-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Height</span>
                                <input
                                    type="text"
                                    value={patient.height || ''}
                                    onChange={e => setPatient({ ...patient, height: e.target.value })}
                                    placeholder="cm"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm bg-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Weight</span>
                                <input
                                    type="text"
                                    value={patient.weight || ''}
                                    onChange={e => setPatient({ ...patient, weight: e.target.value })}
                                    placeholder="kg"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm bg-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100"></div>

                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Grid size={16} /> Data Layout
                        </label>

                        <div className="grid grid-cols-1 gap-2">
                            <button
                                onClick={() => setConfig({ ...config, orientation: 'rows-are-time' })}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${config.orientation === 'rows-are-time'
                                    ? 'bg-blue-50 border-primary-500 text-primary-700 ring-1 ring-primary-500'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                <AlignVerticalSpaceAround size={18} className="shrink-0" />
                                <div className="text-left">
                                    <div className="font-semibold">Time in Rows</div>
                                    <div className="text-[10px] opacity-70">Standard CSV format</div>
                                </div>
                            </button>

                            <button
                                onClick={() => setConfig({ ...config, orientation: 'rows-are-channels' })}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${config.orientation === 'rows-are-channels'
                                    ? 'bg-blue-50 border-primary-500 text-primary-700 ring-1 ring-primary-500'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                <AlignHorizontalSpaceAround size={18} className="shrink-0 rotate-90" />
                                <div className="text-left">
                                    <div className="font-semibold">Channels in Rows</div>
                                    <div className="text-[10px] opacity-70">Matrix / Transposed</div>
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Skip Rows</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.skipRows}
                                    onChange={e => setConfig({ ...config, skipRows: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Skip Columns</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.skipCols}
                                    onChange={e => setConfig({ ...config, skipCols: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100"></div>

                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Clock size={16} /> Signal Properties
                        </label>

                        <div className="space-y-1">
                            <span className="text-xs text-slate-500">Sampling Frequency (Hz)</span>
                            <input
                                type="number"
                                min="1"
                                value={config.samplingRate}
                                onChange={e => setConfig({ ...config, samplingRate: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-slate-500">Number of Channels</span>
                            <input
                                type="number"
                                min="1"
                                max="128"
                                value={config.channelCount}
                                onChange={e => setConfig({ ...config, channelCount: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-slate-100"></div>

                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700">Display Settings</label>
                        <div className="space-y-1">
                            <span className="text-xs text-slate-500">Trial Duration (Seconds)</span>
                            <input
                                type="number"
                                min="1"
                                value={config.trialDurationSec}
                                onChange={e => setConfig({ ...config, trialDurationSec: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
                            />
                        </div>
                    </div>

                </div>

                <div className="p-5 bg-slate-50 border-t border-slate-200">
                    <button
                        onClick={handleStart}
                        disabled={isProcessing}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isProcessing ? (
                            <>Loading...</>
                        ) : (
                            <>Analyze Data <ArrowRight size={18} /></>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main Preview Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-6">

                {/* Visual Preview Removed */}

                {/* Bottom Half: Numeric Data Grid */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Grid size={16} className="text-slate-500" />
                            File Content Preview
                        </h3>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs text-slate-400 mr-2">
                                Showing first {Math.min(20, parsedPreviewRaw.length)} rows starting after Skip
                            </span>
                            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                                Skipped Rows: {config.skipRows}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs text-left text-slate-600 font-mono">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-2 w-16 bg-slate-100/90 border-r border-slate-200">#</th>
                                    {/* Dynamic Headers based on Orientation */}
                                    {config.orientation === 'rows-are-time' ? (
                                        <>
                                            <th className="px-4 py-2 w-24 bg-slate-100/90 border-r border-slate-200 text-slate-500">Time Est.</th>
                                            {Array.from({ length: 10 }).map((_, i) => (
                                                <th key={i} className={`px-4 py-2 whitespace-nowrap ${i < config.channelCount ? 'bg-blue-50/50 text-blue-700 font-bold' : 'text-slate-300 font-normal'}`}>
                                                    {i < config.channelCount ? `CH ${i + 1}` : `Col ${i + 1}`}
                                                </th>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-4 py-2 w-24 bg-slate-100/90 border-r border-slate-200 text-slate-500">Label</th>
                                            {Array.from({ length: 10 }).map((_, i) => (
                                                <th key={i} className="px-4 py-2 whitespace-nowrap text-slate-500 font-normal">
                                                    Sample {i}
                                                </th>
                                            ))}
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {parsedPreviewRaw.slice(0, 20).map((row, rowIdx) => (
                                    <tr key={rowIdx} className={`hover:bg-slate-50 ${config.orientation === 'rows-are-channels' && rowIdx < config.channelCount ? 'bg-blue-50/20' : ''}`}>
                                        <td className="px-4 py-1.5 font-medium text-slate-400 bg-slate-50/50 border-r border-slate-200">
                                            {config.skipRows + rowIdx + 1}
                                        </td>
                                        {config.orientation === 'rows-are-time' ? (
                                            <td className="px-4 py-1.5 text-slate-500 border-r border-slate-200">
                                                {(rowIdx / config.samplingRate).toFixed(3)}s
                                            </td>
                                        ) : (
                                            <td className={`px-4 py-1.5 border-r border-slate-200 font-bold ${rowIdx < config.channelCount ? 'text-blue-700' : 'text-slate-300'}`}>
                                                {rowIdx < config.channelCount ? `CH ${rowIdx + 1}` : `Row ${rowIdx + 1}`}
                                            </td>
                                        )}

                                        {/* Show first 10 columns */}
                                        {row.slice(0, 10).map((val, colIdx) => (
                                            <td key={colIdx} className={`px-4 py-1.5 whitespace-nowrap text-slate-600`}>
                                                {!isNaN(val) ? val : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {parsedPreviewRaw.length === 0 && (
                            <div className="p-8 text-center text-slate-400">
                                No valid data found after skipping {config.skipRows} rows.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigStep;