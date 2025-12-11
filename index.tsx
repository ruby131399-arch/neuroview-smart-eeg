import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { oauth2 as SMART } from 'fhirclient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Helper to clear session if we see a new code but have an old session (Browser Back / State Replay Support)
try {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  if (code && state) {
    const key = state;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const session = JSON.parse(stored);
      if (session.tokenResponse) {
        console.log("Detected State Replay (Likely Browser Back). Clearing old token to force re-auth with new code.");
        delete session.tokenResponse;
        sessionStorage.setItem(key, JSON.stringify(session));
      }
    }
  }
} catch (e) {
  console.warn("Error sanitizing session:", e);
}

SMART.ready()
  .then((client) => {
    root.render(
      <React.StrictMode>
        <App client={client} />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(
      <div style={{ padding: 20, fontFamily: 'sans-serif', color: 'red' }}>
        <h1>SMART Launch Failed</h1>
        <p>Could not initialize SMART client application.</p>
        <pre>{error.message}</pre>
        <p>Please launch this app from a SMART on FHIR compatible launcher (e.g. smarthealthit.org).</p>
      </div>
    );
  });