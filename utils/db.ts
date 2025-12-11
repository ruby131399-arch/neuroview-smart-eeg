import { EEGState, FileConfig } from '../types';

const DB_NAME = 'NeuroViewDB';
const DB_VERSION = 2; // Bump version for new store
const STORE_NAME = 'patient_data';
const SETTINGS_STORE = 'settings';

export interface SavedState {
    patientId: string;
    filename: string;
    config: FileConfig;
    fullData?: number[][]; // Optional - may not be in lightweight JSON
    annotations: any[];
    rawText?: string; // Optional
    fullRawText?: string; // Optional
    status?: 'configuring' | 'viewing'; // Track user's last state
    gain?: number; // Y-axis scale/gain
    timestamp: number;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject('Database error: ' + (event.target as IDBOpenDBRequest).error);

        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'patientId' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }
        };
    });
};

export const saveSetting = async (key: string, value: any) => {
    try {
        const db = await openDB();
        const tx = db.transaction(SETTINGS_STORE, 'readwrite');
        const store = tx.objectStore(SETTINGS_STORE);

        return new Promise<void>((resolve, reject) => {
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Failed to save setting:", error);
    }
};

export const getSetting = async (key: string): Promise<any> => {
    try {
        const db = await openDB();
        const tx = db.transaction(SETTINGS_STORE, 'readonly');
        const store = tx.objectStore(SETTINGS_STORE);

        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Failed to get setting:", error);
        return null;
    }
};

export const savePatientState = async (patientId: string, appState: Partial<EEGState>) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const savedData: SavedState = {
            patientId,
            filename: appState.filename || '',
            config: appState.config!,
            fullData: appState.fullData || [],
            annotations: appState.annotations || [],
            // We rely on fullData for viewer. rawText might be too heavy/unnecessary for restore.
            // But let's check if we need it. Viewer uses fullData. Config uses rawText.
            // If we restore directly to Viewer, we might not need rawText.
            // However, keeping fullRawText allows re-parse if needed. IndexedDB has large quota.
            rawText: appState.rawText, // Save the preview text
            fullRawText: appState.fullRawText,
            timestamp: Date.now()
        };

        return new Promise<void>((resolve, reject) => {
            const request = store.put(savedData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Failed to save patient state:", error);
    }
};

export const loadPatientState = async (patientId: string): Promise<SavedState | null> => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const request = store.get(patientId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Failed to load patient state:", error);
        return null;
    }
};

export const clearPatientState = async (patientId: string) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        return new Promise<void>((resolve, reject) => {
            const request = store.delete(patientId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Failed to clear patient state:", error);
    }
};
