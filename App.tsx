import React, { useState, useEffect } from 'react';
import { Activity, Upload, FileText, AlertCircle, UserCircle, LogOut, Users, Folder, HardDrive, CheckCircle } from 'lucide-react';
import { EEGState, FileConfig, PatientInfo } from './types';
import { parseEEGFile, processFullData } from './utils/parser';
import { fetchPatientData } from './utils/fhir';
import { savePatientState, loadPatientState, saveSetting, getSetting } from './utils/db';
import { connectToDirectory, saveToDirectory, loadFromDirectory, loadDataFileFromDirectory } from './utils/fs';
import ConfigStep from './components/ConfigStep';
import ViewerStep from './components/ViewerStep';
import Client from 'fhirclient/lib/Client';

interface AppProps {
  client: Client;
}

const App: React.FC<AppProps> = ({ client }) => {

  const [appState, setAppState] = useState<EEGState>({
    status: 'idle',
    config: {
      samplingRate: 256,
      channelCount: 8,
      skipRows: 0,
      skipCols: 0,
      trialDurationSec: 5,
      orientation: 'rows-are-time',
    },
    patient: {
      id: '',
      name: '',
      age: '',
      dob: '',
      gender: '',
      height: '',
      weight: ''
    },
    filename: '',
    rawText: '',
    fullData: [],
    annotations: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPatient, setIsFetchingPatient] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [settingsDirHandle, setSettingsDirHandle] = useState<any>(null);
  const [dataDirHandle, setDataDirHandle] = useState<any>(null);
  const [isSettingUpStorage, setIsSettingUpStorage] = useState(true);

  // Stored handle names for UI
  const [storedSettingsName, setStoredSettingsName] = useState<string | null>(null);
  const [storedDataName, setStoredDataName] = useState<string | null>(null);

  // Folder settings modal
  const [showFolderSettings, setShowFolderSettings] = useState(false);

  // Check for stored handles on mount
  useEffect(() => {
    const checkStorage = async () => {
      const sHandle = await getSetting('settingsDirHandle');
      const dHandle = await getSetting('dataDirHandle');

      let hasSettings = false;
      let hasData = false;

      // Try to reconnect Settings folder
      if (sHandle) {
        setStoredSettingsName(sHandle.name);
        try {
          // Check if we already have permission
          if ((await sHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            setSettingsDirHandle(sHandle);
            hasSettings = true;
          } else {
            // Permission expired, will show setup screen
            console.log("Settings folder permission expired");
          }
        } catch (err) {
          console.warn("Settings handle invalid:", err);
        }
      }

      // Try to reconnect Data folder
      if (dHandle) {
        setStoredDataName(dHandle.name);
        try {
          if ((await dHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            setDataDirHandle(dHandle);
            hasData = true;
          } else {
            // Permission expired, will show setup screen
            console.log("Data folder permission expired");
          }
        } catch (err) {
          console.warn("Data handle invalid:", err);
        }
      }

      // Auto-skip setup if we have at least one stored handle
      if (hasSettings || hasData) {
        setIsSettingUpStorage(false);
      } else {
        setIsSettingUpStorage(true);
      }
    };
    checkStorage();
  }, []);

  // Helper to persist state to FS (if connected) OR IndexedDB
  const persistState = async (patientId: string, state: any) => {
    // 1. Always save to IndexedDB as backup/cache
    await savePatientState(patientId, state);

    // 2. If valid settings folder, save lightweight JSON to disk
    if (settingsDirHandle) {
      try {
        const filename = `${patientId}.json`;
        // Create lightweight object (Exclude heavy data)
        const lightweightState = {
          patientId,
          filename: state.filename, // Reference to the data file
          config: state.config,
          annotations: state.annotations,
          status: state.status, // Track whether user was configuring or viewing
          gain: state.gain, // Y-axis scale
          timestamp: Date.now()
          // Note: fullData, rawText, fullRawText are intentionally OMITTED
        };

        await saveToDirectory(settingsDirHandle, filename, lightweightState);
        console.log("Saved lightweight config to local settings folder:", filename);
      } catch (err) {
        console.error("FS Save failed", err);
      }
    }
  };

  // Initial Patient Data Load
  useEffect(() => {
    if (isSettingUpStorage) return; // Wait for storage setup

    const loadPatient = async () => {
      setIsFetchingPatient(true);
      setPatientError(null);

      let patientData;
      try {
        patientData = await fetchPatientData(client);
      } catch (err: any) {
        console.error("Failed to fetch patient data:", err);
        setPatientError("Could not load patient context. Please verify SMART launch.");
        setIsFetchingPatient(false);
        return;
      }

      // Successfully fetched patient, now try to load saved state
      try {
        let savedStateFromFS = null;
        let savedStateFromIDB = null;

        // 1. Try Settings Folder
        if (settingsDirHandle) {
          try {
            savedStateFromFS = await loadFromDirectory(settingsDirHandle, `${patientData.id}.json`);
            if (savedStateFromFS) console.log("Loaded config from Settings Folder");
          } catch (fsErr) {
            console.warn("Could not load from Settings Folder", fsErr);
          }
        }

        // 2. Also try IndexedDB (may have fullData for status detection)
        try {
          savedStateFromIDB = await loadPatientState(patientData.id);
          if (savedStateFromIDB) console.log("Loaded from IndexedDB");
        } catch (idbErr) {
          console.warn("Could not load from IndexedDB", idbErr);
        }

        // 3. Merge: Use FS config but check IDB for fullData/status
        let savedState = savedStateFromFS || savedStateFromIDB;

        if (savedState) {
          // If FS has no status but IDB has fullData, infer status from IDB
          if (!savedState.status && savedStateFromIDB?.fullData && savedStateFromIDB.fullData.length > 0) {
            savedState.status = 'viewing';
            console.log("Inferred status 'viewing' from IndexedDB fullData");
          }

          // If still no status, infer from current savedState
          if (!savedState.status) {
            savedState.status = (savedState.fullData && savedState.fullData.length > 0) ? 'viewing' : 'configuring';
          }

          // Check if we need to load the file (for rawText or fullData)
          const needsRawText = !savedState.rawText && !savedState.fullRawText && savedState.filename;
          const shouldAutoLoadData = savedState.status === 'viewing';

          if (needsRawText) {
            // Need to load file for preview or analysis
            console.log(`Loading file for ${shouldAutoLoadData ? 'analysis' : 'preview'}: ${savedState.filename}`);

            try {
              let dataFile: File | null = null;

              // Search in Settings folder first
              if (settingsDirHandle) {
                dataFile = await loadDataFileFromDirectory(settingsDirHandle, savedState.filename);
                if (dataFile) console.log("Found data file in Settings Folder");
              }

              // Search in Data folder if not found
              if (!dataFile && dataDirHandle) {
                dataFile = await loadDataFileFromDirectory(dataDirHandle, savedState.filename);
                if (dataFile) console.log("Found data file in Data Folder");
              }

              if (dataFile) {
                // Always load the raw text
                const text = await parseEEGFile(dataFile);
                savedState.rawText = text.slice(0, 500000);
                savedState.fullRawText = text;
                console.log("Successfully loaded file text");

                // Only parse to fullData if user had analyzed before
                if (shouldAutoLoadData) {
                  const parsedData = processFullData(
                    text,
                    savedState.config.skipRows,
                    savedState.config.skipCols,
                    savedState.config.channelCount,
                    savedState.config.orientation
                  );
                  savedState.fullData = parsedData;
                  console.log("Successfully parsed data for viewing");
                }
              } else {
                console.warn("Data file not found in any connected folders");
                // Data missing, revert to configuring mode if needed
                if (shouldAutoLoadData) {
                  savedState.status = 'configuring';
                }
              }
            } catch (dataErr) {
              console.error("Error loading/parsing data file:", dataErr);
              // Continue anyway, revert to configuring if needed
              if (shouldAutoLoadData) {
                savedState.status = 'configuring';
              }
            }
          }

          // Determine final status: prioritize viewing if we have data
          let finalStatus: 'idle' | 'configuring' | 'viewing' = 'idle';
          if (savedState.fullData && savedState.fullData.length > 0) {
            finalStatus = 'viewing';
          } else if (savedState.filename && (savedState.rawText || savedState.fullRawText)) {
            finalStatus = 'configuring';
          }

          setAppState(prev => ({
            ...prev,
            status: finalStatus,
            patient: patientData, // Always use fresh FHIR patient data
            filename: savedState.filename,
            config: savedState.config,
            fullData: savedState.fullData || [],
            rawText: savedState.rawText || (savedState.fullRawText ? savedState.fullRawText.slice(0, 500000) : ''),
            fullRawText: savedState.fullRawText,
            annotations: savedState.annotations,
            gain: savedState.gain // Restore saved gain/y-scale
          }));
        } else {
          console.log("No saved data found, starting fresh.");
          setAppState(prev => ({
            ...prev,
            patient: patientData
          }));
        }
      } catch (err: any) {
        console.error("Error loading saved state:", err);
        // Even if saved state fails, we still have patient data
        setAppState(prev => ({
          ...prev,
          patient: patientData
        }));
      } finally {
        setIsFetchingPatient(false);
      }
    };

    if (client) {
      loadPatient();
    }
  }, [client, settingsDirHandle, dataDirHandle, isSettingUpStorage]);

  const handleConnectFolder = async (type: 'settings' | 'data') => {
    const handle = await connectToDirectory();
    if (handle) {
      if (type === 'settings') {
        setSettingsDirHandle(handle);
        await saveSetting('settingsDirHandle', handle);
      } else {
        setDataDirHandle(handle);
        await saveSetting('dataDirHandle', handle);
      }
    }
  };

  const handleReconnect = async (type: 'settings' | 'data') => {
    const handle = await getSetting(type === 'settings' ? 'settingsDirHandle' : 'dataDirHandle');
    if (handle) {
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        if (type === 'settings') setSettingsDirHandle(handle);
        else setDataDirHandle(handle);
        return;
      }
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        if (type === 'settings') setSettingsDirHandle(handle);
        else setDataDirHandle(handle);
      }
    }
  };

  const handleSkipStorage = () => setIsSettingUpStorage(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const text = await parseEEGFile(file);

      setAppState(prev => {
        const newState = {
          ...prev,
          status: 'configuring' as const,
          filename: file.name,
          rawText: text.slice(0, 500000),
          fullRawText: text
        };
        // Persist "Configuring" state
        persistState(prev.patient.id, newState);
        return newState;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartAnalysis = (parsedData: number[][], finalConfig: FileConfig, patientInfo: PatientInfo) => {
    const newState: EEGState = {
      ...appState,
      status: 'viewing',
      fullData: parsedData,
      config: finalConfig,
      patient: patientInfo,
      // Ensure we keep fullRawText if it was set
    };

    setAppState(newState);

    // Persist to IndexedDB
    persistState(patientInfo.id, newState);
  };

  const handleUpdateConfig = (newConfig: FileConfig) => {
    setAppState(prev => {
      const next = { ...prev, config: newConfig };
      persistState(prev.patient.id, next);
      return next;
    });
  };

  const handleUpdateAnnotations = (anns: any[]) => {
    setAppState(prev => {
      const next = { ...prev, annotations: anns };
      persistState(prev.patient.id, next);
      return next;
    });
  };

  const handleUpdateGain = (gain: number) => {
    setAppState(prev => {
      const next = { ...prev, gain };
      persistState(prev.patient.id, next);
      return next;
    });
  };

  const handleReset = () => {
    // We do NOT reset patient data in SMART on FHIR mode as it's stuck to the session
    setAppState(prev => ({
      ...prev,
      status: 'idle',
      config: {
        samplingRate: 256,
        channelCount: 8,
        skipRows: 0,
        skipCols: 0,
        trialDurationSec: 5,
        orientation: 'rows-are-time',
      },
      // Keep patient data
      patient: prev.patient,
      filename: '',
      rawText: '',
      fullData: [],
      annotations: []
    }));
  };

  const handleBack = () => {
    window.history.back();
  };

  // 1. Storage Setup Screen
  if (isSettingUpStorage) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-6 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-primary-600 p-3 rounded-xl text-white shadow-lg shadow-primary-600/20">
            <Activity size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">NeuroView</h1>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 max-w-lg w-full border border-slate-100 text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Workspace Setup</h2>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Connect your local folders to enable data persistence and automatic file loading.
          </p>

          <div className="grid grid-cols-1 gap-4 text-left">
            {/* Settings Folder */}
            <div className="p-4 rounded-xl border transition-all bg-slate-50 border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                    <Folder size={18} className="text-primary-600" /> Settings Folder
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Stores patient configurations (.json)</p>
                </div>
                {settingsDirHandle && <CheckCircle size={20} className="text-green-500" />}
              </div>

              {settingsDirHandle ? (
                <div className="text-xs font-mono text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 inline-block">
                  {settingsDirHandle.name}
                </div>
              ) : (
                storedSettingsName ? (
                  <button onClick={() => handleReconnect('settings')} className="w-full mt-2 py-2 px-3 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-2">
                    <CheckCircle size={14} /> Reconnect "{storedSettingsName}"
                  </button>
                ) : (
                  <button onClick={() => handleConnectFolder('settings')} className="w-full mt-2 py-2 px-3 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                    Select Folder...
                  </button>
                )
              )}
            </div>

            {/* Data Folder */}
            <div className="p-4 rounded-xl border transition-all bg-slate-50 border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                    <HardDrive size={18} className="text-amber-600" /> Data Folder
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Stores large EEG files (.csv, .gz)</p>
                </div>
                {dataDirHandle && <CheckCircle size={20} className="text-green-500" />}
              </div>

              {dataDirHandle ? (
                <div className="text-xs font-mono text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 inline-block">
                  {dataDirHandle.name}
                </div>
              ) : (
                storedDataName ? (
                  <button onClick={() => handleReconnect('data')} className="w-full mt-2 py-2 px-3 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-2">
                    <CheckCircle size={14} /> Reconnect "{storedDataName}"
                  </button>
                ) : (
                  <button onClick={() => handleConnectFolder('data')} className="w-full mt-2 py-2 px-3 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                    Select Folder... (Optional)
                  </button>
                )
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => setIsSettingUpStorage(false)}
              disabled={!settingsDirHandle && !dataDirHandle}
              className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-slate-500/20"
            >
              Continue to App
            </button>

            <button
              onClick={() => setIsSettingUpStorage(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Skip Setup (Session Only)
            </button>
          </div>

        </div>
      </div>
    );
  }

  // 2. Loading Screen
  if (isFetchingPatient) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p className="text-slate-600 font-medium animate-pulse">Loading Patient Context...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary-600 p-2 rounded-lg text-white">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">NeuroView</h1>
            <p className="text-xs text-slate-500 font-medium">SMART ON FHIR CONNECTED</p>
          </div>
        </div>

        <div className="flex items-center gap-2">

          <button
            onClick={() => setShowFolderSettings(true)}
            className="text-xs font-medium px-2 py-1.5 rounded-md transition-colors flex items-center gap-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200"
            title="Manage Storage Folders"
          >
            <Folder size={14} />
            <span className="hidden sm:inline">Folders</span>
          </button>

          {appState.status !== 'idle' && (
            <button
              onClick={handleReset}
              className="text-sm text-slate-600 hover:text-red-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
            >
              Close File
            </button>
          )}

          <button
            onClick={handleBack}
            title="Switch Patient"
            className="text-sm text-slate-500 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Users size={16} />
            <span className="hidden sm:inline">Switch Patient</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 relative">
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">Processing Signal Data...</p>
            </div>
          </div>
        )}

        {appState.status === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 max-w-lg w-full text-center border border-slate-100">

              {/* Step 1: Patient Context Display (Read Only) */}
              <div className="mb-8 bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <UserCircle size={28} className="text-primary-600" />
                  <h3 className="text-lg font-bold text-slate-700">Patient Context</h3>
                </div>

                {patientError ? (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {patientError}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-slate-800 bg-white border border-slate-200 rounded-lg py-3 px-4 shadow-sm">
                      <span className="font-bold text-lg block mb-1">{appState.patient.name}</span>
                      <div className="flex items-center justify-center gap-3 text-xs text-slate-500 uppercase tracking-wide">
                        <span>{appState.patient.gender}</span>
                        <span>•</span>
                        <span>{appState.patient.age ? `${appState.patient.age} yo` : 'Age unknown'}</span>
                        <span>•</span>
                        <span className="font-mono">{appState.patient.dob}</span>
                      </div>
                    </div>
                    {(appState.patient.height || appState.patient.weight) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white border border-slate-200 rounded py-2">
                          <span className="text-slate-400 block text-[10px] uppercase">Height</span>
                          <span className="font-medium text-slate-700">{appState.patient.height || '-'}</span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded py-2">
                          <span className="text-slate-400 block text-[10px] uppercase">Weight</span>
                          <span className="font-medium text-slate-700">{appState.patient.weight || '-'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: File Upload */}
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Upload EEG Data</h2>
              <p className="text-slate-500 mb-6 text-sm">
                Supported formats: .csv, .txt, .gz
              </p>

              <div className="relative group max-w-xs mx-auto">
                <input
                  type="file"
                  accept=".csv,.txt,.gz"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <button className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-slate-500/20 group-hover:scale-[1.02] flex items-center justify-center gap-2">
                  <FileText size={20} />
                  Select Data File
                </button>
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm text-left">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {appState.status === 'configuring' && (
          <ConfigStep
            rawText={appState.rawText}
            fullText={appState.fullRawText || ''}
            filename={appState.filename}
            initialConfig={appState.config}
            initialPatient={appState.patient}
            onStart={handleStartAnalysis}
          />
        )}

        {appState.status === 'viewing' && (
          <ViewerStep
            data={appState.fullData}
            config={appState.config}
            patient={appState.patient}
            filename={appState.filename}
            existingAnnotations={appState.annotations}
            onUpdateAnnotations={handleUpdateAnnotations}
            onConfigChange={handleUpdateConfig}
            initialGain={appState.gain}
            onGainChange={handleUpdateGain}
          />
        )}
      </main>

      {/* Folder Settings Modal */}
      {showFolderSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowFolderSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Folder Settings</h2>
              <button onClick={() => setShowFolderSettings(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Settings Folder */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-start gap-3 mb-3">
                  <Folder size={20} className="text-primary-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">Settings Folder</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Stores patient configurations (.json)</p>
                  </div>
                  {settingsDirHandle && <CheckCircle size={18} className="text-green-500" />}
                </div>

                {settingsDirHandle ? (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-green-700 bg-green-50 px-3 py-2 rounded border border-green-100">
                      {settingsDirHandle.name}
                    </div>
                    <button
                      onClick={() => handleConnectFolder('settings')}
                      className="w-full py-2 px-3 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      Change Folder
                    </button>
                  </div>
                ) : (
                  storedSettingsName ? (
                    <button
                      onClick={() => handleReconnect('settings')}
                      className="w-full py-2 px-3 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} /> Reconnect "{storedSettingsName}"
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectFolder('settings')}
                      className="w-full py-2 px-3 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                      Select Folder
                    </button>
                  )
                )}
              </div>

              {/* Data Folder */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-start gap-3 mb-3">
                  <HardDrive size={20} className="text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">Data Folder</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Stores large EEG files (.csv, .gz)</p>
                  </div>
                  {dataDirHandle && <CheckCircle size={18} className="text-green-500" />}
                </div>

                {dataDirHandle ? (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-green-700 bg-green-50 px-3 py-2 rounded border border-green-100">
                      {dataDirHandle.name}
                    </div>
                    <button
                      onClick={() => handleConnectFolder('data')}
                      className="w-full py-2 px-3 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      Change Folder
                    </button>
                  </div>
                ) : (
                  storedDataName ? (
                    <button
                      onClick={() => handleReconnect('data')}
                      className="w-full py-2 px-3 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} /> Reconnect "{storedDataName}"
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectFolder('data')}
                      className="w-full py-2 px-3 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                    >
                      Select Folder (Optional)
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowFolderSettings(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;