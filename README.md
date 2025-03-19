# Voice Clone Studio

A web application that allows you to record your voice and then synthesize speech in your own voice from any text.

## Features

- Record voice samples through your browser
- Audio visualization while recording
- Text-to-speech synthesis that mimics your voice
- Modern and responsive UI

## Technology Stack

- Backend: Flask (Python)
- Frontend: HTML, CSS, JavaScript
- Voice Cloning: [YourTTS](https://github.com/coqui-ai/TTS) model from Coqui TTS
- Audio Processing: Web Audio API

## Installation

1. Clone this repository
2. Install the dependencies:
```
pip install -r requirements.txt
```
3. Run the application:
```
python app.py
```
4. Open your browser and navigate to `http://localhost:5000`

## Usage

1. **Learn Your Voice**: Click on the "Record" button and read the provided text aloud for 10-15 seconds. Stop when finished.
2. **Text to Speech**: After your voice is processed, you can switch to the "Text to Speech" tab and enter any text you want to synthesize.
3. **Synthesize**: Click "Speak" to generate speech in your voice.

## Requirements

- Python 3.7+
- Modern web browser (Chrome, Firefox, Safari)
- Microphone access for recording

## How It Works

Voice Clone Studio uses the YourTTS model from the Coqui TTS library, which is a zero-shot multi-speaker voice cloning model. The system:

1. Records a short sample of your voice
2. Extracts voice characteristics
3. Uses these characteristics to synthesize new speech while preserving your voice identity

## Privacy

Your voice recordings are stored locally on the server running this application. No data is sent to external services.

## License

MIT

## Acknowledgements

- [Coqui TTS](https://github.com/coqui-ai/TTS) for the YourTTS model
- Web Audio API for audio processing
- Flask for the backend framework 