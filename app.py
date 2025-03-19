from flask import Flask, request, jsonify, send_file
import os
from werkzeug.utils import secure_filename
import uuid
import tempfile
import time
import numpy as np
import soundfile as sf
import torch
import warnings
import librosa
import parselmouth
from parselmouth.praat import call
from resemblyzer import VoiceEncoder
from pydub import AudioSegment
import io
import resampy
import scipy
import shutil
import sys

# Set up environment variables for Hugging Face downloads
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = "1"
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = "1"
os.environ['TRANSFORMERS_OFFLINE'] = "0"
os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = "300"  # 5 minutes timeout

# Initialize Flask app
app = Flask(__name__, static_folder='.', static_url_path='')
UPLOAD_FOLDER = 'uploads'
SYNTH_FOLDER = 'synthesized'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(SYNTH_FOLDER, exist_ok=True)

# Suppress NumPy warnings (optional)
warnings.filterwarnings('ignore', category=UserWarning)

# Check FFmpeg availability
def check_ffmpeg():
    """Check if FFmpeg is available in the system path"""
    return shutil.which('ffmpeg') is not None

FFMPEG_AVAILABLE = check_ffmpeg()
print(f"FFmpeg available: {FFMPEG_AVAILABLE}")
if not FFMPEG_AVAILABLE:
    print("WARNING: FFmpeg not found in PATH. Voice processing will be limited.")
    print("Install FFmpeg with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)")

# Initialize voice encoder for voice adaptation
try:
    print("Loading voice encoder...")
    voice_encoder = VoiceEncoder()
    print("Voice encoder loaded!")
    VOICE_ENCODER_LOADED = True
except Exception as e:
    print(f"Error loading voice encoder: {e}")
    VOICE_ENCODER_LOADED = False

# Import Bark after environment setup
try:
    print("Loading Bark models... this may take a minute.")
    from bark import generate_audio, preload_models
    from bark.generation import SAMPLE_RATE
    
    # Print CPU/GPU status
    if torch.cuda.is_available():
        device = "GPU"
        device_name = torch.cuda.get_device_name(0)
        print(f"Using GPU: {device_name}")
    else:
        device = "CPU"
        print("No GPU available. Using CPU. Voice generation will be slow.")
    
    # Preload models with increased timeouts
    preload_models()
    print("Bark models loaded successfully!")
    BARK_LOADED = True
except Exception as e:
    print(f"Error loading Bark: {e}")
    print("Falling back to simple audio generation...")
    BARK_LOADED = False

# Available voice presets
VOICE_PRESETS = {
    "male_1": "v2/en_speaker_0",
    "male_2": "v2/en_speaker_1", 
    "male_3": "v2/en_speaker_2",
    "female_1": "v2/en_speaker_3",
    "female_2": "v2/en_speaker_4",
    "female_3": "v2/en_speaker_5",
    "male_excited": "v2/en_speaker_6",
    "female_excited": "v2/en_speaker_7",
    "male_american": "v2/en_speaker_8",
    "female_american": "v2/en_speaker_9",
}

# Keep track of the uploaded voice for the session
user_voice_samples = {}
user_voice_embeddings = {}
user_voice_errors = {}  # Track processing errors by user

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/upload', methods=['POST'])
def upload_audio():
    if 'audio' not in request.files:
        return jsonify({'message': 'No audio file uploaded'}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'message': 'Empty filename'}), 400
    
    # Generate a unique ID for this user session
    user_id = request.form.get('userId', str(uuid.uuid4()))
    
    filename = secure_filename(audio_file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, f"{user_id}_{filename}")
    audio_file.save(filepath)
    
    # Store the reference to this voice sample
    user_voice_samples[user_id] = filepath
    
    # Clear any previous errors for this user
    if user_id in user_voice_errors:
        del user_voice_errors[user_id]
        
    # Check FFmpeg first
    if not FFMPEG_AVAILABLE:
        error_msg = "FFmpeg not found. Voice adaptation requires FFmpeg to be installed."
        user_voice_errors[user_id] = {
            "error_type": "missing_dependency",
            "message": error_msg,
            "solution": "Install FFmpeg with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)"
        }
        return jsonify({
            'message': 'Voice sample received but cannot be processed: ' + error_msg,
            'userId': user_id,
            'voice_processed': False,
            'error': user_voice_errors[user_id]
        })
    
    # Process the voice sample to extract characteristics if voice encoder is loaded
    voice_processed = False
    if VOICE_ENCODER_LOADED:
        try:
            # Get the voice embedding
            wav, sr = librosa.load(filepath, sr=16000)  # Resample to 16kHz for the encoder
            # Trim silence
            wav, _ = librosa.effects.trim(wav, top_db=20)
            # Get embedding
            embedding = voice_encoder.embed_utterance(wav)
            user_voice_embeddings[user_id] = embedding
            voice_processed = True
            print(f"Voice embedding created for user {user_id}")
        except Exception as e:
            error_message = str(e) if str(e) else "Unknown error during voice processing"
            print(f"Error processing voice sample: {error_message}")
            # Store the error information
            user_voice_errors[user_id] = {
                "error_type": "processing_failed",
                "message": error_message,
                "solution": "Try recording again with clearer audio or check system audio settings."
            }
            return jsonify({
                'message': 'Voice sample received but could not be processed: ' + error_message,
                'userId': user_id,
                'voice_processed': False,
                'error': user_voice_errors[user_id]
            })
    else:
        user_voice_errors[user_id] = {
            "error_type": "encoder_not_loaded",
            "message": "Voice encoder not available",
            "solution": "Check server logs for errors with the voice encoder."
        }
    
    message = 'Voice sample received and processed!' if voice_processed else 'Voice sample received but could not be processed for adaptation. Using preset voices.'
    
    response_data = {
        'message': message, 
        'userId': user_id,
        'voice_processed': voice_processed
    }
    
    # Include error information if available
    if not voice_processed and user_id in user_voice_errors:
        response_data['error'] = user_voice_errors[user_id]
    
    return jsonify(response_data)

@app.route('/synthesize', methods=['POST'])
def synthesize_audio():
    global BARK_LOADED
    
    data = request.get_json()
    text = data.get('text', '')
    user_id = data.get('userId', '')
    voice_id = data.get('voice', 'female_1')  # Default to female_1 if not specified
    use_user_voice = data.get('use_user_voice', False) 
    
    # Check if user voice adaptation is possible
    can_adapt_voice = user_id in user_voice_embeddings
    
    # If adaptation was requested but isn't possible, prepare an explanation
    adaptation_requested_but_failed = use_user_voice and not can_adapt_voice
    adaptation_failure_reason = None
    
    if adaptation_requested_but_failed:
        if user_id in user_voice_errors:
            adaptation_failure_reason = user_voice_errors[user_id]
        else:
            adaptation_failure_reason = {
                "error_type": "no_voice_sample",
                "message": "No processed voice sample available",
                "solution": "Record your voice in the 'Learn Your Voice' tab first."
            }
    
    # Final determination if we can use voice adaptation
    use_user_voice = use_user_voice and can_adapt_voice
    
    if not text:
        return jsonify({'message': 'No text provided.'}), 400
    
    try:
        # Generate a unique filename for the synthesized audio
        output_filename = f"{user_id}_{int(time.time())}.wav"
        output_path = os.path.join(SYNTH_FOLDER, output_filename)
        
        print(f"Synthesizing audio for text: '{text}'")
        print(f"Output path: {output_path}")
        print(f"Using voice: {voice_id}")
        print(f"Using user voice adaptation: {use_user_voice}")
        
        if BARK_LOADED:
            # Use Bark to generate audio
            selected_voice = VOICE_PRESETS.get(voice_id, "v2/en_speaker_0")
            
            # Generate audio with Bark
            audio_array = generate_audio(text, history_prompt=selected_voice)
            
            # Apply voice adaptation if requested and available
            if use_user_voice and user_id in user_voice_embeddings and user_id in user_voice_samples:
                print(f"Applying voice adaptation for user {user_id}")
                audio_array = adapt_voice(audio_array, user_id)
            
            # Save the audio file
            sf.write(output_path, audio_array, SAMPLE_RATE)
        else:
            # Fallback to simple sine wave tone if Bark fails to load
            print("Bark not available. Using simple tone generation")
            fallback_generate_audio(output_path, text)
        
        # Check if the file was created
        if not os.path.exists(output_path):
            print("Output file was not created!")
            raise Exception("Failed to generate audio file - file not created")
        
        file_size = os.path.getsize(output_path)
        if file_size == 0:
            print("Output file is empty!")
            raise Exception("Failed to generate audio file - file is empty")
            
        print(f"Successfully created audio file: {output_path}, size: {file_size} bytes")
        
        # Absolute URL for the audio file
        file_url = request.host_url.rstrip('/') + f'/synthesized/{output_filename}'
        
        # Return both streaming and download options
        response_data = {
            'message': 'Audio synthesized successfully',
            'file_url': file_url,
            'file_size': file_size,
            'download_url': file_url + '?download=true',
            'user_voice_applied': use_user_voice
        }
        
        # Include adaptation failure information if relevant
        if adaptation_requested_but_failed and adaptation_failure_reason:
            response_data['adaptation_failure'] = adaptation_failure_reason
            
        return jsonify(response_data)
    
    except Exception as e:
        print(f"Error during synthesis: {e}")
        return jsonify({'message': f'Error synthesizing audio: {str(e)}'}), 500

def adapt_voice(audio_array, user_id):
    """Apply voice adaptation based on user's voice sample"""
    try:
        # Load the original user voice sample
        user_sample_path = user_voice_samples[user_id]
        user_sample, user_sr = librosa.load(user_sample_path, sr=None)
        
        # Ensure the audio is in the right format
        if user_sr != SAMPLE_RATE:
            user_sample = resampy.resample(user_sample, user_sr, SAMPLE_RATE)
        
        # Extract pitch with Parselmouth
        source_sound = parselmouth.Sound(audio_array, SAMPLE_RATE)
        source_pitch = source_sound.to_pitch()
        
        target_sound = parselmouth.Sound(user_sample, SAMPLE_RATE) 
        target_pitch = target_sound.to_pitch()
        
        # Get pitch statistics 
        source_mean_pitch = call(source_pitch, "Get mean", 0, 0, "Hertz")
        target_mean_pitch = call(target_pitch, "Get mean", 0, 0, "Hertz")
        
        if source_mean_pitch > 0 and target_mean_pitch > 0:
            # Calculate pitch shift ratio to match target voice
            pitch_ratio = target_mean_pitch / source_mean_pitch
            
            # Apply pitch shifting (within reasonable limits to avoid artifacts)
            shift_factor = max(0.5, min(2.0, pitch_ratio))  # Limit within 0.5x to 2x range
            print(f"Pitch shift factor: {shift_factor}")
            
            # Apply pitch shifting
            pitched_audio = librosa.effects.pitch_shift(
                audio_array, 
                sr=SAMPLE_RATE,
                n_steps=12 * np.log2(shift_factor)  # Convert ratio to semitones
            )
            
            # Apply a slight formant adjustment to better match the target voice
            # This is a simple approximation
            alpha = 0.85 + (0.3 * (1 - shift_factor))  # Range roughly 0.85-1.15
            alpha = max(0.8, min(1.2, alpha))  # Keep in reasonable range
            
            # Apply rudimentary "formant shift" by resampling and then resampling back
            temp_sr = int(SAMPLE_RATE * alpha)
            formant_audio = resampy.resample(pitched_audio, SAMPLE_RATE, temp_sr)
            formant_audio = resampy.resample(formant_audio, temp_sr, SAMPLE_RATE)
            
            # Normalize amplitude
            formant_audio = formant_audio / np.max(np.abs(formant_audio)) * 0.9
            
            return formant_audio
        
        # If pitch extraction fails, return original
        return audio_array
        
    except Exception as e:
        print(f"Error in voice adaptation: {e}")
        # Return the original audio if adaptation fails
        return audio_array

def fallback_generate_audio(output_path, text):
    """Fallback audio generation method using simple sine waves"""
    sample_rate = 22050  # Sample rate
    pitch = 220.0  # Base frequency (A3)
    duration = min(len(text) * 0.1, 10.0)  # Duration based on text length
    
    # Create a simple sine wave
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    
    # Vary the tone based on text content to create some variation
    mod_freq = 1.0 + (sum(ord(c) for c in text) % 10) / 10.0
    
    # Generate samples with some amplitude modulation for interest
    samples = 0.5 * np.sin(2 * np.pi * pitch * t * mod_freq)
    samples += 0.3 * np.sin(4 * np.pi * pitch * t * mod_freq)
    samples *= np.exp(-0.5 * t / duration)  # Apply envelope
    
    # Save as WAV file
    sf.write(output_path, samples, sample_rate)

# Add a route to directly download synthesized files
@app.route('/synthesized/<path:filename>')
def download_file(filename):
    download = request.args.get('download', False)
    filepath = os.path.join(SYNTH_FOLDER, filename)
    
    # Check if file exists
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    # For direct download
    if download:
        return send_file(filepath, 
                     mimetype='audio/wav',
                     as_attachment=True,
                     download_name=filename)
    
    # For streaming in browser
    return send_file(filepath, mimetype='audio/wav')

@app.route('/health', methods=['GET'])
def health_check():
    status = "ok" if BARK_LOADED else "limited" 
    return jsonify({
        'status': status,
        'bark_loaded': BARK_LOADED,
        'voice_adaptation_loaded': VOICE_ENCODER_LOADED,
        'ffmpeg_available': FFMPEG_AVAILABLE,
        'device': 'GPU' if torch.cuda.is_available() else 'CPU'
    })

@app.route('/dependencies', methods=['GET'])
def check_dependencies():
    """Check system dependencies and provide installation instructions"""
    dependencies = {
        'ffmpeg': {
            'available': FFMPEG_AVAILABLE,
            'installation': {
                'macos': 'brew install ffmpeg',
                'linux': 'apt-get install ffmpeg',
                'windows': 'Download from https://ffmpeg.org/download.html'
            }
        },
        'voice_encoder': {
            'available': VOICE_ENCODER_LOADED
        },
        'bark': {
            'available': BARK_LOADED
        }
    }
    
    return jsonify(dependencies)

@app.route('/voices', methods=['GET'])
def get_voices():
    try:
        # Get user IDs that have voice samples
        user_voices = [
            {'id': 'user_' + user_id, 'name': f"Your Uploaded Voice", 'is_user_voice': True}
            for user_id in user_voice_embeddings.keys()
        ]
        
        # Add AI voices
        ai_voices = [
            {'id': key, 'name': f"AI Voice: {key.replace('_', ' ').title()}", 'is_user_voice': False} 
            for key in VOICE_PRESETS.keys()
        ]
        
        # Combine both lists, putting user voices first
        all_voices = user_voices + ai_voices
        
        return jsonify({'voices': all_voices})
    except Exception as e:
        print(f"Error getting voices: {e}")
        return jsonify({'message': f'Error getting voices: {str(e)}'}), 500

@app.route('/user-voice-status', methods=['GET'])
def user_voice_status():
    """Check if a user has a processed voice sample"""
    user_id = request.args.get('userId', '')
    
    if not user_id:
        return jsonify({'has_voice': False, 'message': 'No user ID provided'}), 400
    
    has_voice = user_id in user_voice_embeddings
    message = 'Voice sample found and processed' if has_voice else 'No voice sample found for this user'
    
    response_data = {
        'has_voice': has_voice,
        'message': message,
        'ffmpeg_available': FFMPEG_AVAILABLE
    }
    
    # Include error information if available
    if user_id in user_voice_errors:
        response_data['error'] = user_voice_errors[user_id]
    
    return jsonify(response_data)

# Add a test route with alternative audio generation
@app.route('/test-audio')
def test_audio():
    try:
        # Generate a simple sine wave as a WAV file
        print("Generating test audio file...")
        test_file = os.path.join(SYNTH_FOLDER, "test_tone.wav")
        
        # Generate a simple sine wave
        sample_rate = 44100  # 44.1 kHz
        duration = 2  # seconds
        frequency = 440  # Hz (A4 note)
        
        # Generate samples
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        samples = (32767 * np.sin(2 * np.pi * frequency * t)).astype(np.int16)
        
        # Write to WAV file
        sf.write(test_file, samples, sample_rate)
        
        print(f"Test audio file generated at {test_file}")
        
        # Return a page with audio element
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Audio Test</title>
            <style>
                body {{ font-family: Arial, sans-serif; text-align: center; margin: 50px; }}
                .container {{ max-width: 600px; margin: 0 auto; }}
                audio {{ width: 100%; margin: 20px 0; }}
                .download {{ display: block; margin: 20px auto; padding: 10px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }}
                .message {{ margin: 20px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Audio Test Page</h1>
                <p>This is a test page to verify audio playback works in your browser.</p>
                
                <div class="message">
                    If you can hear a tone when you press play, audio playback is working correctly.
                </div>
                
                <audio controls>
                    <source src="/synthesized/test_tone.wav" type="audio/wav">
                    Your browser does not support the audio element.
                </audio>
                
                <a href="/synthesized/test_tone.wav?download=true" class="download">Download Test Audio</a>
                
                <div>
                    <p>If you can't hear anything:</p>
                    <ul style="text-align: left;">
                        <li>Check your system volume</li>
                        <li>Try using the download link and play the file in your media player</li>
                        <li>Try a different browser</li>
                        <li>Check browser console for errors</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
    
    except Exception as e:
        print(f"Error generating test audio: {e}")
        return jsonify({'message': f'Error generating test audio: {str(e)}'}), 500

if __name__ == "__main__":
    app.run(debug=True)