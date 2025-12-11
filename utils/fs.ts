import { SavedState } from './db';

// Interface for TS recognition if not available globally
interface FileSystemDirectoryHandle extends FileSystemHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
    getFile(): Promise<File>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    close(): Promise<void>;
}

declare global {
    interface Window {
        showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
    }
}

export const connectToDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
        if ('showDirectoryPicker' in window) {
            return await window.showDirectoryPicker();
        } else {
            alert("Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.");
            return null;
        }
    } catch (err) {
        console.error("User cancelled or failed to pick directory:", err);
        return null; // User cancelled
    }
};

export const saveToDirectory = async (dirHandle: FileSystemDirectoryHandle, filename: string, data: SavedState) => {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2)); // Pretty print for user readability
        await writable.close();
        console.log(`Saved ${filename} to local directory.`);
    } catch (err) {
        console.error("Failed to save to directory:", err);
        throw err;
    }
};

export const loadFromDirectory = async (dirHandle: FileSystemDirectoryHandle, filename: string): Promise<SavedState | null> => {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text) as SavedState;
    } catch (err) {
        // It's normal if file doesn't exist yet
        // console.log("File not found in directory:", filename);
        return null;
    }
};

/**
 * Helper to load an EEG data file from a directory handle
 * Returns a File object if found, null otherwise
 */
export const loadDataFileFromDirectory = async (dirHandle: FileSystemDirectoryHandle, filename: string): Promise<File | null> => {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        return file;
    } catch (err) {
        console.log(`Data file "${filename}" not found in this directory`);
        return null;
    }
};
