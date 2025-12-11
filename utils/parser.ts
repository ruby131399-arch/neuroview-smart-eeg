import pako from 'pako';
import Papa from 'papaparse';
import { DataOrientation } from '../types';

/**
 * Reads a file and returns its text content.
 * Handles .gz decompression if detected.
 */
export const parseEEGFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error("File is empty");

        // Check if file extension suggests GZIP or magic numbers
        const isGzip = file.name.endsWith('.gz');

        if (isGzip) {
           // Assume ArrayBuffer for GZ
           if (result instanceof ArrayBuffer) {
             const decompressed = pako.inflate(new Uint8Array(result), { to: 'string' });
             resolve(decompressed);
           } else {
             // Should not happen if readAsArrayBuffer is called
             reject(new Error("Invalid read mode for GZIP"));
           }
        } else {
          // Plain text
          if (typeof result === 'string') {
            resolve(result);
          } else {
             // If array buffer came back for text file, decode it
             const dec = new TextDecoder('utf-8');
             resolve(dec.decode(result as ArrayBuffer));
          }
        }
      } catch (e: any) {
        reject(e);
      }
    };

    reader.onerror = () => reject(new Error("File read error"));

    if (file.name.endsWith('.gz')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
};

/**
 * Parses the full text content into a number[][] array.
 * ALWAYS returns [Time][Channel] format regardless of input orientation.
 */
export const processFullData = (
  text: string, 
  skipRows: number, 
  skipCols: number, 
  expectedChannels: number,
  orientation: DataOrientation
): number[][] => {
  // Use PapaParse for robust CSV handling
  const parsed = Papa.parse(text, {
    skipEmptyLines: true,
    fastMode: true, 
  });

  const rawRows = parsed.data as string[][];

  if (orientation === 'rows-are-time') {
      // STANDARD FORMAT: Rows = Time Points, Columns = Channels
      const dataRows = rawRows.slice(skipRows);
      const result: number[][] = [];
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const numRow: number[] = [];
        
        // Safety check
        if (row.length <= skipCols) continue;

        for (let j = skipCols; j < row.length; j++) {
          const val = parseFloat(row[j]);
          numRow.push(!isNaN(val) ? val : 0);
          
          // Optimization: Stop if we have enough channels
          if (numRow.length >= expectedChannels) break;
        }
        
        if (numRow.length > 0) {
          result.push(numRow);
        }
      }
      return result;

  } else {
      // TRANSPOSED FORMAT: Rows = Channels, Columns = Time Points
      // Structure:
      // Row 0 + skipRows -> Channel 1 Data
      // Row 1 + skipRows -> Channel 2 Data
      
      // 1. Identify valid channel rows
      const channelRows = rawRows.slice(skipRows, skipRows + expectedChannels);
      
      if (channelRows.length === 0) return [];

      // 2. Determine time length (columns)
      // Use the first channel to determine length
      const firstRow = channelRows[0];
      const timePointsCount = firstRow.length - skipCols;
      
      if (timePointsCount <= 0) return [];

      // 3. Initialize result array [Time][Channel]
      // Pre-allocating somewhat helps, but pushing is safer for variable lengths
      const result: number[][] = new Array(timePointsCount);

      for (let t = 0; t < timePointsCount; t++) {
          result[t] = new Array(channelRows.length).fill(0);
      }

      // 4. Fill data (Transposing)
      for (let ch = 0; ch < channelRows.length; ch++) {
          const rowData = channelRows[ch];
          for (let t = 0; t < timePointsCount; t++) {
              const colIdx = t + skipCols;
              if (colIdx < rowData.length) {
                  const val = parseFloat(rowData[colIdx]);
                  result[t][ch] = !isNaN(val) ? val : 0;
              }
          }
      }

      return result;
  }
};