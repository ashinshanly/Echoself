# EchoSelf - Voice Adaptation System

## 📋 Overview

EchoSelf is a sophisticated web application that enables text-to-speech synthesis with voice adaptation capabilities. Leveraging state-of-the-art neural voice synthesis models, EchoSelf extracts characteristic features from user voice samples and applies them to AI-generated speech, creating a personalized voice output that retains key aspects of the user's vocal identity.

## 🏗️ Technical Architecture

The system implements a dual-layer approach to voice synthesis:

1. **Base Synthesis Layer**: Utilizes Bark neural TTS models to generate high-quality speech from text input with predefined voice presets.

2. **Voice Adaptation Layer**: Employs spectral analysis techniques to extract voice characteristics (pitch profile, formant structure) from user recordings, then applies these characteristics to the base synthesis output through pitch shifting and formant adaptation algorithms.

## ✨ Key Features

- **Voice Characteristic Extraction**: Extracts voice embeddings using the Resemblyzer voice encoder
- **Real-time Audio Visualization**: FFT-based frequency visualization during voice recording
- **Pitch and Formant Adaptation**: Pitch shifting with semitone precision and formant adjustment
- **Multi-voice Support**: Selection between user-adapted voices and pre-defined AI voice presets
- **Progressive Enhancement**: Graceful degradation when optional dependencies are missing
- **Detailed Dependency Management**: Comprehensive error handling with actionable feedback

## 🔧 Technical Specifications

- **Backend**: Flask-based Python server with RESTful API architecture
- **Frontend**: Vanilla JavaScript with modular component design
- **Audio Processing**: 
  - Voice encoding via Resemblyzer (d-vector approach)
  - Pitch extraction with Parselmouth (Praat wrapper)
  - Audio manipulation with librosa and resampy
- **Storage**: File-based audio persistence with unique identifiers
- **Voice Models**: Bark neural speech synthesis with 10 distinct voice presets

## 🚀 Installation

### Prerequisites

- Python 3.8+
- FFmpeg (required for voice adaptation features)
- Node.js and npm (for development)

### Setup Process

1. Clone the repository:
   ```bash
   git clone https://github.com/username/echoself.git
   cd echoself
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Install FFmpeg (required for voice adaptation):
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   apt-get install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   ```

5. Run the application:
   ```bash
   python app.py
   ```

6. Access the web interface at `http://127.0.0.1:5000`

### Development Note

The virtual environment directory (`venv/`) is not included in the repository and should be added to your `.gitignore` file. Each developer should create their own virtual environment following the setup steps above.

## 💻 System Requirements

- **CPU**: Multi-core processor (minimum 4 cores recommended)
- **RAM**: Minimum 8GB, 16GB recommended for optimal performance
- **Storage**: 2GB for application and model files
- **GPU**: Optional but recommended for faster synthesis (CUDA compatible)

## 🔬 Technical Implementation Details

### Voice Adaptation Algorithm

The voice adaptation process follows this technical pipeline:

1. **Recording & Embedding**:
   - Audio is captured at 48kHz, 16-bit depth
   - Silence is trimmed using a top_db threshold of 20dB
   - 256-dimensional d-vector embedding is computed via Resemblyzer

2. **Voice Synthesis**:
   - Text is tokenized and processed through Bark TTS model
   - Base voice preset is applied as a history prompt

3. **Adaptation Process**:
   - Pitch statistics are extracted from both source and target using Parselmouth
   - Pitch shift factor is calculated as the ratio between mean pitches
   - Shifting is applied using librosa's pitch_shift with n_steps calculated as 12*log2(shift_factor)
   - Formant adaptation is approximated through a two-step resampling process

4. **Normalization**:
   - Final amplitude normalization is applied to prevent clipping

## 📡 API Documentation

The application exposes several RESTful endpoints:

| Endpoint | Method | Description | Parameters |
|----------|--------|-------------|------------|
| `/upload` | POST | Upload voice sample | `audio` (WAV file), `userId` (optional) |
| `/synthesize` | POST | Generate speech | `text`, `userId`, `voice`, `use_user_voice` |
| `/voices` | GET | List available voices | None |
| `/user-voice-status` | GET | Check voice sample status | `userId` |
| `/health` | GET | System health check | None |
| `/dependencies` | GET | Check system dependencies | None |

## 📁 Project Structure

```
echoself/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── uploads/               # Directory for user voice samples
├── synthesized/           # Directory for generated audio
├── css/
│   └── style.css          # Application styling
├── js/
│   └── main.js            # Frontend application logic
└── index.html             # Main application interface
```

## 🔄 Git Configuration

### .gitignore Setup

Create a `.gitignore` file in the project root with the following entries:

```
# Virtual Environment
venv/
env/
.venv/
ENV/

# Python artifacts
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
*.egg-info/
*.egg

# Audio files and uploaded content
uploads/*
!uploads/.gitkeep
synthesized/*
!synthesized/.gitkeep

# Development files
.env
.vscode/
.idea/
*.swp
.DS_Store
```

## ⚡ Performance Considerations

### CPU Usage

The application is computationally intensive, particularly during:

1. **Model Loading**: The Bark model loading process can take 30-60 seconds on first startup
2. **Speech Synthesis**: Generation of audio from text (10-30 seconds depending on text length)
3. **Voice Adaptation**: The pitch shifting and formant manipulation (5-10 seconds per synthesis)

Performance metrics from testing:

| Text Length | CPU Time (no GPU) | Memory Usage |
|-------------|------------------|--------------|
| Short phrase (5 words) | ~15 seconds | ~1.2GB |
| Medium text (25 words) | ~1 minute | ~1.5GB |
| Long paragraph (100+ words) | ~4 minutes | ~2GB |

### GPU Acceleration

When CUDA-compatible hardware is available, the application will automatically utilize GPU acceleration for the Bark model, significantly improving performance:

| Text Length | CPU Time | GPU Time (RTX 2070) |
|-------------|----------|---------------------|
| Short phrase (5 words) | ~15 seconds | ~3 seconds |
| Medium text (25 words) | ~1 minute | ~12 seconds |
| Long paragraph (100+ words) | ~4 minutes | ~45 seconds |

To enable GPU acceleration, ensure that PyTorch is installed with CUDA support:

```bash
pip install torch==2.0.0+cu117 -f https://download.pytorch.org/whl/cu117/torch_stable.html
```

## 🔍 Troubleshooting

### Missing FFmpeg

Voice adaptation requires FFmpeg for audio processing. If you encounter errors related to FFmpeg:

```
Missing Dependency: FFmpeg not found. Voice adaptation requires FFmpeg to be installed.
```

Install FFmpeg using the appropriate method for your operating system, then restart the application.

### Voice Embedding Errors

If voice processing fails despite FFmpeg being installed:

1. Ensure your microphone is properly connected and working
2. Record in a quiet environment with minimal background noise
3. Speak clearly for at least 10 seconds during recording
4. Check the server logs for specific error messages

## 💾 Data Management

### User Voice Samples

Voice samples are stored in the `uploads/` directory with unique identifiers. These files:

- Are never overwritten for the same user ID
- Contain raw voice recordings at 48kHz sample rate
- Average 300-500KB in size for a 15-second recording

### Synthesized Audio

Generated audio files are stored in the `synthesized/` directory and:

- Can be streamed directly from the server
- Are accessible through unique URLs
- Can be downloaded by users for offline use

## 🚢 Deployment

### Production Setup

For production deployment, consider the following options:

#### Option 1: Gunicorn + Nginx

```bash
# Install production server
pip install gunicorn

# Run with gunicorn
gunicorn -w 4 -b 127.0.0.1:8000 app:app
```

#### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p uploads synthesized

# Run the application
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]

EXPOSE 5000
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

1. Follow PEP 8 style guidelines for Python code
2. Include docstrings for new functions and classes
3. Add appropriate error handling for user-facing features
4. Write tests for new functionality
5. Update documentation to reflect changes

## 🔒 Privacy and Security Considerations

When deploying this application, be aware of these privacy considerations:

- Voice samples may contain personally identifiable information
- Generated speech could be misused for impersonation
- No built-in authentication is provided by default

Recommended security enhancements:

1. Implement user authentication before allowing voice uploads
2. Add rate limiting to prevent API abuse
3. Consider encrypting stored voice samples
4. Implement HTTPS to protect data in transit
5. Add clear user consent mechanisms before processing voice data

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Contact

Project Link: [https://github.com/ashinshanly/echoself](https://github.com/ashinshanly/echoself)

---

*The EchoSelf project demonstrates voice adaptation techniques for educational and research purposes. Users are responsible for compliance with applicable laws and regulations regarding voice synthesis and impersonation.*
