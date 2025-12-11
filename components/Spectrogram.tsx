
import React, { useEffect, useRef, useMemo } from 'react';
import { computeSpectrogram, getHeatmapColor } from '../utils/dsp';

interface Props {
  data: number[]; // 1D array of signal data for a SINGLE channel
  sampleRate: number;
  height?: number;
}

const Spectrogram: React.FC<Props> = ({ data, sampleRate, height = 300 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize computation so we don't re-run FFT on every render unless data changes
  const specData = useMemo(() => {
    if (!data || data.length === 0) return null;
    // Window size 256 @ 250Hz ~= 1 sec window roughly. 
    // We want good time resolution for 5s trials.
    // Try window 128 for better time res, or 256 for better freq res.
    const nFft = 256; 
    return computeSpectrogram(data, sampleRate, nFft, nFft/2);
  }, [data, sampleRate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !specData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { magnitudes, minMag, maxMag } = specData;
    const numTimeBins = magnitudes.length;
    const numFreqBins = magnitudes[0].length;

    // Set canvas resolution
    // We stretch the canvas via CSS, but draw pixels 1:1 to bins usually
    // Or we can scale drawing. Let's scale drawing to fill width.
    const containerWidth = containerRef.current?.clientWidth || 800;
    
    canvas.width = containerWidth;
    canvas.height = height;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cellWidth = canvas.width / numTimeBins;
    const cellHeight = canvas.height / numFreqBins;

    // Range for normalization
    const range = maxMag - minMag;

    for (let t = 0; t < numTimeBins; t++) {
      for (let f = 0; f < numFreqBins; f++) {
        // Draw frequency bottom-up (0Hz at bottom)
        // Array comes 0Hz first, so we invert Y coordinate
        const mag = magnitudes[t][f];
        
        // Normalize 0..1
        const norm = (mag - minMag) / (range || 1);
        
        ctx.fillStyle = getHeatmapColor(norm);
        
        // Invert Y: canvas 0 is top
        const y = canvas.height - ((f + 1) * cellHeight);
        
        // Use Math.ceil to prevent gaps between pixels due to float rounding
        ctx.fillRect(
             Math.floor(t * cellWidth), 
             Math.floor(y), 
             Math.ceil(cellWidth) + 1, 
             Math.ceil(cellHeight) + 1
        );
      }
    }
  }, [specData, height]);

  if (!specData) return <div className="text-center text-slate-400 p-8">Processing Signal Data...</div>;

  return (
    <div className="flex gap-4 w-full">
      {/* Main Spectrogram Canvas Container */}
      <div 
        className="relative flex-1 border border-slate-200 rounded-lg overflow-hidden bg-black" 
        ref={containerRef}
        style={{ height: `${height}px` }}
      >
        <canvas 
          ref={canvasRef} 
          style={{ width: '100%', height: '100%', display: 'block' }} 
        />
        
        {/* Axis Labels Overlay */}
        <div className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 px-1 rounded pointer-events-none">
          0 Hz
        </div>
        <div className="absolute top-1 left-2 text-[10px] text-white bg-black/50 px-1 rounded pointer-events-none">
          {(sampleRate / 2).toFixed(0)} Hz
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-white bg-black/50 px-1 rounded pointer-events-none">
          Time &rarr;
        </div>
      </div>

      {/* Color Legend (Colorbar) */}
      <div 
        className="flex flex-col justify-between items-center py-1 w-12 shrink-0 select-none"
        style={{ height: `${height}px` }}
      >
        <div className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
           {specData.maxMag.toFixed(0)} dB
        </div>
        
        <div 
            className="flex-1 w-3 my-1 rounded-sm border border-slate-300 relative overflow-hidden"
            style={{
                // Matches the logic in dsp.ts: Black -> Blue -> Red -> Yellow -> White
                background: 'linear-gradient(to top, rgb(0,0,0) 0%, rgb(0,0,255) 25%, rgb(255,0,0) 50%, rgb(255,255,0) 75%, rgb(255,255,255) 100%)'
            }}
            title="Signal Power Intensity"
        ></div>

        <div className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
           {specData.minMag.toFixed(0)} dB
        </div>
      </div>
    </div>
  );
};

export default Spectrogram;
