# NeuroView SMART EEG

A modern, browser-based EEG data viewer and analysis tool integrated with SMART on FHIR for seamless electronic health record (EHR) integration.

[![Deploy Status](https://github.com/ruby131399-arch/neuroview-smart-eeg/actions/workflows/deploy.yml/badge.svg)](https://github.com/ruby131399-arch/neuroview-smart-eeg/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🌐 **Live Demo**: [https://ruby131399-arch.github.io/neuroview-smart-eeg/](https://ruby131399-arch.github.io/neuroview-smart-eeg/)

---

## 📋 Overview

NeuroView is a SMART on FHIR-enabled web application that allows healthcare professionals to visualize and analyze EEG (electroencephalography) data directly within their EHR workflow. Built with modern web technologies, it provides an intuitive interface for reviewing patient EEG recordings, adding annotations, and performing spectral analysis.

### Key Features

- 🔐 **SMART on FHIR Integration** - Seamlessly launch from EHR systems with automatic patient context
- 📊 **Interactive EEG Visualization** - Multi-channel time-series display with customizable gain and window settings
- 📁 **Dual Storage System** - Separate folders for patient settings (JSON) and large EEG data files
- 🔄 **Flexible Data Import** - Support for CSV format with configurable parsing options
- 📝 **Annotation Tools** - Add timestamped notes and event markers during review
- 🎨 **Spectrogram Analysis** - Real-time frequency domain visualization
- 💾 **Persistent State** - Auto-save settings and analysis progress using IndexedDB
- 📱 **Responsive Design** - Works across desktop and tablet devices
- 🚀 **Progressive Web App** - Fast loading with modern web standards

---

## 🛠️ Technology Stack

### Frontend
- **React 19** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool and dev server
- **Tailwind CSS** - Utility-first styling

### Data Processing
- **PapaParse** - CSV parsing
- **Pako** - GZIP compression support
- **Custom DSP** - FFT and spectrogram generation

### Storage & APIs
- **IndexedDB** - Client-side persistent storage
- **File System Access API** - Direct file system integration
- **SMART on FHIR Client** - EHR integration

### Visualization
- **Recharts** - Spectral analysis charts
- **Lucide React** - Modern iconography
- **Custom Canvas** - High-performance EEG rendering

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager
- Modern browser with File System Access API support (Chrome, Edge)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/ruby131399-arch/neuroview-smart-eeg.git
   cd neuroview-smart-eeg
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   Navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The production build will be output to the `dist/` directory.

---

## 📖 Usage

### SMART Launch

1. Navigate to [SMART Health IT Launcher](https://launch.smarthealthit.org/)
2. Enter the Launch URL:
   ```
   https://ruby131399-arch.github.io/neuroview-smart-eeg/launch.html
   ```
3. Select a patient from the sandbox
4. Click "Launch App!"

### Folder Setup (First Time)

1. **Settings Folder** - Choose a location to store patient configuration files (lightweight JSON)
2. **Data Folder** - Choose a location for large EEG data files (optional, can be same as settings)

The app will remember your folder permissions for future sessions.

### Loading EEG Data

1. Upload a CSV file containing EEG data
2. Configure parsing parameters:
   - Sampling rate (Hz)
   - Number of channels
   - Skip rows/columns
   - Data orientation (rows as time vs. rows as channels)
3. Preview the parsed data
4. Click "Analyze Data" to begin visualization

### Viewing and Analysis

- **Navigate Trials** - Use arrow buttons or page controls
- **Adjust Gain** - Modify Y-axis scale for better visibility
- **Change Window** - Set trial duration (seconds per page)
- **Add Annotations** - Mark events with timestamped notes
- **View Spectrogram** - Switch to frequency domain analysis
- **Scroll Mode** - Visualize entire dataset in continuous view

---

## 🏗️ Architecture

### Data Flow

```
SMART Launch → Patient Context → App State
                                     ↓
User Uploads EEG File → Parser → Preview
                                     ↓
User Configures → Full Analysis → Visualization
                                     ↓
User Annotates/Adjusts → State Persistence
```

### Storage Strategy

- **IndexedDB**: Patient metadata, annotations, analysis state
- **File System (Settings Folder)**: Lightweight JSON configs with filename references
- **File System (Data Folder)**: Large EEG data files (not duplicated in RAM)

This dual-folder approach optimizes storage by avoiding data duplication while maintaining fast access to settings.

### Key Components

- **`App.tsx`** - Main application logic, FHIR client, state management
- **`ConfigStep.tsx`** - Data upload and parsing configuration
- **`ViewerStep.tsx`** - EEG visualization and analysis controls
- **`EEGCanvas.tsx`** - High-performance canvas rendering
- **`Spectrogram.tsx`** - Frequency domain visualization
- **`utils/parser.ts`** - CSV parsing and data transformation
- **`utils/dsp.ts`** - Digital signal processing (FFT, windowing)
- **`utils/db.ts`** - IndexedDB operations
- **`utils/fs.ts`** - File System Access API helpers

---

## 🔧 Configuration

### Vite Config

The app is configured for GitHub Pages deployment with a base path:

```typescript
// vite.config.ts
export default defineConfig({
  base: '/neuroview-smart-eeg/',
  // ...
});
```

### SMART on FHIR

Launch configuration in `public/launch.html`:

```javascript
FHIR.oauth2.authorize({
  clientId: "my_web_app",
  scope: "launch/patient patient/Patient.read patient/Observation.read online_access openid profile",
  redirectUri: "https://ruby131399-arch.github.io/neuroview-smart-eeg/",
  iss: urlParams.get('iss')
});
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for type safety
- Follow existing code style and formatting
- Add comments for complex logic
- Test changes across different browsers
- Update documentation as needed

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **SMART Health IT** - FHIR client library and testing tools
- **React Community** - Excellent ecosystem and tooling
- **Open Source Contributors** - Dependencies that make this possible

---

## 📞 Support

- **Documentation**: [Wiki](https://github.com/ruby131399-arch/neuroview-smart-eeg/wiki)
- **Issues**: [GitHub Issues](https://github.com/ruby131399-arch/neuroview-smart-eeg/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ruby131399-arch/neuroview-smart-eeg/discussions)

---

## 🔒 Security & Privacy

- All patient data processing occurs **client-side**
- No data is transmitted to external servers
- File System Access API requires explicit user permission
- Complies with HIPAA guidelines for local data handling
- Session-based authentication through SMART on FHIR

---

## 🗺️ Roadmap

- [ ] PDF export of annotated sessions
- [ ] Additional signal processing filters
- [ ] Multi-patient comparison view
- [ ] Offline mode with Service Worker
- [ ] Mobile app wrapper (Capacitor)
- [ ] Additional file format support (EDF, BDF)

---

**Made with ❤️ for better EEG analysis workflows**
