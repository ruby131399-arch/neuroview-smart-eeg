import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FileConfig } from '../types';

interface EEGCanvasProps {
    data: number[][]; // [row][col] -> [channel][time] if transposed? No, data is array of rows [ch0, ch1...]
    // The Input Data is: array of SAMPLES. Each sample is array of CHANNELS.
    // e.g. [[ch0_t0, ch1_t0], [ch0_t1, ch1_t1]...]
    config: FileConfig;
    height?: number;
    yScale: number; // Gain
    channelColors?: string[];
    startTime?: number; // Absolute start time in seconds
}

const EEGCanvas: React.FC<EEGCanvasProps> = ({
    data,
    config,
    height = 600,
    yScale,
    channelColors = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#d946ef', '#64748b'],
    startTime = 0
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, time: number, values: number[] } | null>(null);

    // State for dynamic height measurement
    const [observedHeight, setObservedHeight] = useState(height || 0);

    // 1. Maintain observed height if no explicit height prop is provided
    useEffect(() => {
        if (height) {
            setObservedHeight(height);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        // Initial measurement
        if (container.clientHeight > 0) {
            setObservedHeight(container.clientHeight);
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setObservedHeight(entry.contentRect.height);
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [height]);

    // Constants based on FINAL height
    // Enforce minimum height per channel to prevent crushing/clipping
    // 40px per channel + 50px vertical padding (20 top + 30 bottom)
    const minRequiredHeight = (config.channelCount * 40) + 50;
    const finalHeight = Math.max(observedHeight, minRequiredHeight);

    // Draw Function
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || data.length === 0 || finalHeight === 0) return;

        // Handle Resize / Retina Display
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();

        // Use container width, but our calculated finalHeight
        canvas.width = rect.width * dpr;
        canvas.height = finalHeight * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${finalHeight}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, finalHeight);

        // Drawing Config
        const totalPoints = data.length;
        const totalTime = totalPoints / config.samplingRate;

        const padding = { top: 20, bottom: 30, left: 50, right: 20 };
        const usableWidth = rect.width - padding.left - padding.right;
        const usableHeight = finalHeight - padding.top - padding.bottom;

        const xStep = usableWidth / (totalPoints - 1); // Pixels per sample

        const slotHeight = usableHeight / config.channelCount;

        // Draw each channel
        for (let ch = 0; ch < config.channelCount; ch++) {
            ctx.beginPath();
            ctx.strokeStyle = channelColors[ch % channelColors.length];
            ctx.lineWidth = 1.5;

            const channelIndex = ch;
            const centerY = padding.top + (channelIndex * slotHeight) + (slotHeight / 2);

            // Move to first point
            const firstVal = data[0][ch] || 0;
            ctx.moveTo(padding.left, centerY - (firstVal * yScale));

            for (let t = 1; t < totalPoints; t++) {
                const val = data[t][ch] || 0;
                const x = padding.left + (t * xStep);
                const y = centerY - (val * yScale);
                ctx.lineTo(x, y);
            }

            ctx.stroke();

            // Draw Label (Channel Name) in Left Margin
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`CH ${ch + 1}`, padding.left - 10, centerY + 3);
            ctx.textAlign = 'start';
        }

        // Draw X-Axis (Time)
        if (totalTime > 0) {
            const axisY = finalHeight - padding.bottom + 5; // Bottom line position

            ctx.beginPath();
            ctx.strokeStyle = '#cbd5e1'; // slate-300
            ctx.lineWidth = 1;
            ctx.moveTo(padding.left, axisY);
            ctx.lineTo(padding.left + usableWidth, axisY);
            ctx.stroke();

            // Ticks
            ctx.fillStyle = '#64748b'; // slate-500
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';

            // Determine tick interval (aim for ~5-10 ticks)
            let tickInterval = 1;
            if (totalTime > 10) tickInterval = 2;
            if (totalTime > 30) tickInterval = 5;

            for (let sec = 0; sec <= Math.ceil(totalTime); sec += tickInterval) {
                const sampleIndex = sec * config.samplingRate;
                if (sampleIndex >= totalPoints && sec < totalTime) continue; // Skip if beyond data

                // Clamp to end
                const effectiveIndex = Math.min(sampleIndex, totalPoints - 1);

                const x = padding.left + (effectiveIndex * xStep);

                // Tick
                ctx.beginPath();
                ctx.moveTo(x, axisY);
                ctx.lineTo(x, axisY + 4);
                ctx.stroke();

                // Label
                ctx.fillText(`${sec + startTime}s`, x, axisY + 14);
            }
        }

    }, [data, config, finalHeight, yScale, channelColors]);

    // Interaction Handler
    const handleMouseMove = (e: React.MouseEvent) => {
        const container = containerRef.current;
        if (!container || data.length === 0) return;

        const rect = container.getBoundingClientRect();

        const padding = { top: 20, bottom: 30, left: 50, right: 20 };
        const usableWidth = rect.width - padding.left - padding.right;

        const x = e.clientX - rect.left;

        // Ignore if in margins
        if (x < padding.left || x > rect.width - padding.right) {
            setTooltip(null);
            return;
        }

        // Find index
        const totalPoints = data.length;
        const xStep = usableWidth / (totalPoints - 1);
        const relativeX = x - padding.left;
        const index = Math.round(relativeX / xStep);

        if (index >= 0 && index < totalPoints) {
            const time = startTime + (index / config.samplingRate);
            const values = data[index]; // array of all ch values

            // X position for tooltip line
            const lineX = padding.left + (index * xStep);

            setTooltip({
                x: lineX,
                y: e.clientY - rect.top, // Not used heavily, rigid tooltip usually better
                time,
                values
            });
        }
    };

    const handleMouseLeave = () => setTooltip(null);

    return (
        <div
            ref={containerRef}
            className="relative w-full cursor-crosshair select-none"
            style={{ height: height ? height : '100%' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <canvas ref={canvasRef} />

            {/* Tooltip Overlay */}
            {tooltip && (
                <>
                    {/* Vertical Line */}
                    <div
                        className="absolute top-0 bottom-0 w-px bg-slate-400 pointer-events-none"
                        style={{ left: tooltip.x }}
                    />

                    {/* Floating Info Box */}
                    <div
                        className="absolute top-0 bg-white/90 border border-slate-200 shadow-lg p-3 rounded-lg text-xs pointer-events-none z-20"
                        style={{
                            left: tooltip.x + 10 > containerRef.current!.offsetWidth - 150 ? tooltip.x - 160 : tooltip.x + 10,
                            top: 10
                        }}
                    >
                        <div className="font-bold text-slate-700 mb-1">Time: {tooltip.time.toFixed(3)}s</div>
                        <div className="space-y-0.5">
                            {tooltip.values.map((v, i) => (
                                <div key={i} className="flex justify-between gap-4" style={{ color: channelColors[i % channelColors.length] }}>
                                    <span>CH{i + 1}:</span>
                                    <span className="font-mono">{v.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EEGCanvas;
