
/**
 * Digital Signal Processing Utilities
 * Implementation of STFT (Short-Time Fourier Transform) for Spectrograms
 */

// Basic Complex Number structure
class Complex {
  constructor(public real: number, public imag: number) {}
}

/**
 * Cooley-Tukey FFT algorithm (Recursive)
 * Note: For production with very large datasets, a specialized WASM or worker library is recommended.
 * This implementation is sufficient for 5-10s EEG chunks.
 */
const fft = (input: Complex[]): Complex[] => {
  const n = input.length;
  if (n <= 1) return input;

  const even = fft(input.filter((_, i) => i % 2 === 0));
  const odd = fft(input.filter((_, i) => i % 2 !== 0));

  const combined = new Array(n);
  for (let k = 0; k < n / 2; k++) {
    const angle = -2 * Math.PI * k / n;
    const w = new Complex(Math.cos(angle), Math.sin(angle));
    
    // w * odd[k]
    const wOdd = new Complex(
      w.real * odd[k].real - w.imag * odd[k].imag,
      w.real * odd[k].imag + w.imag * odd[k].real
    );

    combined[k] = new Complex(even[k].real + wOdd.real, even[k].imag + wOdd.imag);
    combined[k + n / 2] = new Complex(even[k].real - wOdd.real, even[k].imag - wOdd.imag);
  }
  return combined;
};

/**
 * Computes the magnitude spectrum of a real signal
 */
const computeMagnitude = (signal: number[]): number[] => {
  // Pad to power of 2
  const pow2 = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const complexSignal = new Array(pow2);
  
  for(let i=0; i<pow2; i++) {
    complexSignal[i] = new Complex(i < signal.length ? signal[i] : 0, 0);
  }

  const spectrum = fft(complexSignal);
  
  // Return only first half (Nyquist)
  const magnitudes = [];
  for(let i=0; i < pow2/2; i++) {
    const mag = Math.sqrt(spectrum[i].real ** 2 + spectrum[i].imag ** 2);
    magnitudes.push(mag);
  }
  return magnitudes;
};

/**
 * Hanning Window Function to reduce spectral leakage
 */
const hanningWindow = (size: number): number[] => {
  const w = new Array(size);
  for(let i=0; i<size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
};

export interface SpectrogramData {
  magnitudes: number[][]; // [TimeBin][FreqBin]
  freqs: number[];        // Frequency labels for Y axis
  times: number[];        // Time labels for X axis
  maxMag: number;
  minMag: number;
}

/**
 * Compute STFT (Short-Time Fourier Transform)
 */
export const computeSpectrogram = (
  signal: number[], 
  sampleRate: number, 
  windowSize: number = 256, 
  overlap: number = 128
): SpectrogramData => {
  const step = windowSize - overlap;
  const windowFunc = hanningWindow(windowSize);
  const result: number[][] = [];
  
  let maxMag = -Infinity;
  let minMag = Infinity;

  // Sliding window
  for (let i = 0; i <= signal.length - windowSize; i += step) {
    const chunk = [];
    // Apply window function
    for (let j = 0; j < windowSize; j++) {
      chunk.push(signal[i + j] * windowFunc[j]);
    }

    const mags = computeMagnitude(chunk);
    
    // Log scale for better visibility (dB-like)
    const logMags = mags.map(m => {
        const val = Math.log10(m + 1e-6) * 20; // convert to pseudo-dB
        if (val > maxMag) maxMag = val;
        if (val < minMag) minMag = val;
        return val;
    });

    result.push(logMags);
  }

  // Frequency bins
  const numFreqBins = windowSize / 2;
  const freqs = Array.from({length: numFreqBins}, (_, i) => (i * sampleRate) / windowSize);
  
  // Time bins
  const times = Array.from({length: result.length}, (_, i) => (i * step) / sampleRate);

  return { magnitudes: result, freqs, times, maxMag, minMag };
};

/**
 * Maps a normalized value (0-1) to a 'Magma' or 'Jet' like RGB color
 */
export const getHeatmapColor = (value: number): string => {
  // Simple "Inferno/Magma" style approximation
  // Value 0 -> Black/Purple
  // Value 0.5 -> Red/Orange
  // Value 1 -> Yellow/White
  
  const clamped = Math.max(0, Math.min(1, value));
  
  // R, G, B components based on segments
  let r, g, b;

  if (clamped < 0.25) {
      // Black to Blue/Purple
      r = 0;
      g = 0;
      b = Math.floor(clamped * 4 * 255);
  } else if (clamped < 0.5) {
      // Blue to Red
      r = Math.floor((clamped - 0.25) * 4 * 255);
      g = 0;
      b = 255 - Math.floor((clamped - 0.25) * 4 * 200);
  } else if (clamped < 0.75) {
      // Red to Yellow
      r = 255;
      g = Math.floor((clamped - 0.5) * 4 * 255);
      b = 0;
  } else {
      // Yellow to White
      r = 255;
      g = 255;
      b = Math.floor((clamped - 0.75) * 4 * 255);
  }

  return `rgb(${r},${g},${b})`;
};
