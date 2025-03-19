// Voice Clone Studio - Main JavaScript
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const learnTab = document.getElementById('learnTab');
  const synthesizeTab = document.getElementById('synthesizeTab');
  const learnSection = document.getElementById('learnSection');
  const synthesizeSection = document.getElementById('synthesizeSection');
  const recordButton = document.getElementById('recordButton');
  const stopButton = document.getElementById('stopButton');
  const recordStatus = document.getElementById('recordStatus');
  const synthesizeButton = document.getElementById('synthesizeButton');
  const synthesisText = document.getElementById('synthesisText');
  const synthAudio = document.getElementById('synthAudio');
  const visualizer = document.getElementById('visualizer');
  const voiceSelector = document.getElementById('voiceSelector');
  
  // App State
  let mediaRecorder;
  let audioChunks = [];
  let userId = localStorage.getItem('userId') || null;
  let isRecording = false;
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let canvasCtx = visualizer.getContext('2d');
  let animationFrame = null;
  let useVoiceAdaptation = true; // Default to enable voice adaptation
  
  // Tab Navigation
  learnTab.addEventListener('click', () => {
    learnTab.classList.add('active');
    synthesizeTab.classList.remove('active');
    learnSection.classList.remove('hidden');
    synthesizeSection.classList.add('hidden');
  });
  
  synthesizeTab.addEventListener('click', () => {
    synthesizeTab.classList.add('active');
    learnTab.classList.remove('active');
    synthesizeSection.classList.remove('hidden');
    learnSection.classList.add('hidden');
    
    // Load available voices if not already populated
    if (voiceSelector && voiceSelector.options.length <= 1) {
      loadVoices();
    }
    
    // Check if user has a processed voice sample
    if (userId) {
      checkUserVoiceStatus(userId);
    }
  });
  
  // Create voice adaptation toggle if it doesn't exist
  if (!document.getElementById('voiceAdaptationToggle')) {
    const voiceSelector = document.querySelector('.voice-selector');
    if (voiceSelector) {
      const adaptationToggle = document.createElement('div');
      adaptationToggle.className = 'adaptation-toggle';
      adaptationToggle.innerHTML = `
        <label class="toggle-switch">
          <input type="checkbox" id="voiceAdaptationToggle" checked>
          <span class="toggle-slider"></span>
        </label>
        <span>Apply voice adaptation</span>
      `;
      voiceSelector.appendChild(adaptationToggle);
      
      // Add event listener to the toggle
      document.getElementById('voiceAdaptationToggle').addEventListener('change', function() {
        useVoiceAdaptation = this.checked;
        console.log(`Voice adaptation ${useVoiceAdaptation ? 'enabled' : 'disabled'}`);
      });
    }
  }
  
  // Record Button
  recordButton.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupMediaRecorder(stream);
      setupAudioVisualization(stream);
      startRecording();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      showMessage('Cannot access microphone. Please check permissions.', 'error');
    }
  });
  
  // Stop Button
  stopButton.addEventListener('click', () => {
    stopRecording();
  });
  
  // Synthesize Button
  synthesizeButton.addEventListener('click', async () => {
    const text = synthesisText.value.trim();
    if (!text) {
      showMessage('Please enter text to synthesize.', 'error');
      return;
    }
    
    await synthesizeVoice(text);
  });
  
  // Check if user has a processed voice sample
  async function checkUserVoiceStatus(userId) {
    try {
      const response = await fetch(`/user-voice-status?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to check voice status');
      }
      
      const data = await response.json();
      
      if (data.has_voice) {
        showMessage('Your voice sample is ready for adaptation!', 'success');
        
        // Enable the voice adaptation toggle
        const adaptationToggle = document.getElementById('voiceAdaptationToggle');
        if (adaptationToggle) {
          adaptationToggle.disabled = false;
          adaptationToggle.checked = true;
          adaptationToggle.parentElement.parentElement.classList.remove('disabled');
        }
      } else {
        // If user has no processed voice, disable adaptation toggle
        const adaptationToggle = document.getElementById('voiceAdaptationToggle');
        if (adaptationToggle) {
          adaptationToggle.disabled = true;
          adaptationToggle.checked = false;
          adaptationToggle.parentElement.parentElement.classList.add('disabled');
        }
        
        // If there's a specific error, show it
        if (data.error) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'voice-processing-error';
          
          const errorType = data.error.error_type || 'unknown';
          let errorMsg = '';
          
          if (errorType === 'missing_dependency') {
            errorMsg = `
              <div class="error-title">Missing Dependency: ${data.error.message}</div>
              <div class="error-solution">
                <strong>Solution:</strong> ${data.error.solution}
              </div>
            `;
            // Special message for FFmpeg
            if (!data.ffmpeg_available) {
              showMessage('Voice adaptation requires FFmpeg. Please install it to use this feature.', 'error');
            }
          } else {
            errorMsg = `
              <div class="error-title">${data.error.message}</div>
              ${data.error.solution ? `<div class="error-solution">${data.error.solution}</div>` : ''}
            `;
          }
          
          errorDiv.innerHTML = errorMsg;
          
          // Add error info below voice selector
          const voiceSelectorDiv = document.querySelector('.voice-selector');
          if (voiceSelectorDiv && !document.querySelector('.voice-processing-error')) {
            voiceSelectorDiv.appendChild(errorDiv);
          }
        }
      }
    } catch (err) {
      console.error('Error checking voice status:', err);
    }
  }
  
  // Load available voices
  async function loadVoices() {
    try {
      const response = await fetch('/voices');
      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }
      
      const data = await response.json();
      
      if (data.voices && data.voices.length > 0) {
        // Clear existing options except the first one
        while (voiceSelector.options.length > 1) {
          voiceSelector.remove(1);
        }
        
        // Group voices by type
        const userVoices = data.voices.filter(voice => voice.is_user_voice);
        const aiVoices = data.voices.filter(voice => !voice.is_user_voice);
        
        // Add user voices first if available
        if (userVoices.length > 0) {
          const userOptgroup = document.createElement('optgroup');
          userOptgroup.label = 'Your Voice';
          
          userVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            userOptgroup.appendChild(option);
          });
          
          voiceSelector.appendChild(userOptgroup);
        }
        
        // Add AI voices
        if (aiVoices.length > 0) {
          const aiOptgroup = document.createElement('optgroup');
          aiOptgroup.label = 'AI Voices';
          
          aiVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            aiOptgroup.appendChild(option);
          });
          
          voiceSelector.appendChild(aiOptgroup);
        }
        
        // If user has a voice, check the status
        if (userId) {
          checkUserVoiceStatus(userId);
        }
      }
    } catch (err) {
      console.error('Error loading voices:', err);
      showMessage('Could not load available voices.', 'error');
    }
  }
  
  // Audio Visualization
  function setupAudioVisualization(stream) {
    // Set up canvas size
    visualizer.width = visualizer.clientWidth;
    visualizer.height = visualizer.clientHeight;
    
    // Set up audio context
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Create analyser
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Connect audio source to analyser
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    // Draw function for visualization
    function draw() {
      if (!isRecording) {
        return;
      }
      
      animationFrame = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      
      canvasCtx.fillStyle = 'rgb(243, 244, 246)';
      canvasCtx.fillRect(0, 0, visualizer.width, visualizer.height);
      
      const barWidth = (visualizer.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        // Use gradient color based on frequency
        const hue = i / bufferLength * 360;
        canvasCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        
        canvasCtx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    }
    
    draw();
  }
  
  // Clear audio visualization
  function clearVisualization() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);
    }
  }
  
  // Media Recorder Setup
  function setupMediaRecorder(stream) {
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.addEventListener('dataavailable', event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });
    
    mediaRecorder.addEventListener('stop', async () => {
      recordButton.disabled = false;
      stopButton.disabled = true;
      recordStatus.textContent = 'Processing...';
      
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      await uploadVoiceSample(audioBlob);
      
      // Clean up
      audioChunks = [];
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
    });
  }
  
  // Start Recording
  function startRecording() {
    if (!mediaRecorder) {
      return;
    }
    
    isRecording = true;
    recordButton.disabled = true;
    stopButton.disabled = false;
    recordStatus.textContent = 'Recording... Speak clearly for 10-15 seconds.';
    recordStatus.classList.add('recording');
    
    // Start recording
    mediaRecorder.start();
    
    // Automatically stop after 15 seconds
    setTimeout(() => {
      if (isRecording) {
        stopRecording();
      }
    }, 15000);
  }
  
  // Stop Recording
  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      return;
    }
    
    isRecording = false;
    mediaRecorder.stop();
    recordStatus.classList.remove('recording');
    clearVisualization();
  }
  
  // Upload Voice Sample
  async function uploadVoiceSample(audioBlob) {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice_sample.wav');
      
      if (userId) {
        formData.append('userId', userId);
      }
      
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Store the user ID
        userId = data.userId;
        localStorage.setItem('userId', userId);
        recordStatus.textContent = 'Voice sample uploaded successfully!';
        
        if (data.voice_processed) {
          showMessage('Your voice has been processed and is ready for adaptation! You can now synthesize text.', 'success');
        } else {
          if (data.error) {
            const errorMsg = data.error.message || 'Unknown error';
            const solution = data.error.solution || '';
            
            recordStatus.textContent = 'Error: ' + errorMsg;
            
            if (data.error.error_type === 'missing_dependency') {
              showMessage(`Voice processing failed: ${errorMsg}. ${solution}`, 'error');
            } else {
              showMessage('Voice sample uploaded, but could not be processed for adaptation: ' + errorMsg, 'warning');
            }
          } else {
            showMessage('Voice sample uploaded, but could not be processed for adaptation. Using AI voices only.', 'warning');
          }
        }
        
        // Enable the synthesize tab
        synthesizeTab.click();
      } else {
        throw new Error(data.message || 'Error uploading voice sample');
      }
    } catch (err) {
      console.error('Error uploading voice sample:', err);
      recordStatus.textContent = 'Error: ' + err.message;
      showMessage('Failed to process voice: ' + err.message, 'error');
    }
  }
  
  // Synthesize Voice
  async function synthesizeVoice(text) {
    try {
      synthesizeButton.disabled = true;
      synthesizeButton.textContent = 'Processing...';
      
      // Get selected voice if available
      const selectedVoice = voiceSelector ? voiceSelector.value : null;
      
      console.log(`Synthesizing text: "${text}"`);
      if (selectedVoice) {
        console.log(`Using voice: ${selectedVoice}`);
      }
      
      // Check if user wants to apply voice adaptation
      const adaptationToggle = document.getElementById('voiceAdaptationToggle');
      const applyAdaptation = adaptationToggle ? adaptationToggle.checked : useVoiceAdaptation;
      
      console.log(`Applying voice adaptation: ${applyAdaptation}`);
      
      const response = await fetch('/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          text, 
          userId,
          voice: selectedVoice,
          use_user_voice: applyAdaptation
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error synthesizing voice');
      }
      
      console.log('Received response from server');
      
      // Get the JSON response with file URLs
      const data = await response.json();
      console.log('Response data:', data);
      
      if (!data.file_url) {
        throw new Error('No audio file URL received');
      }
      
      // Update UI to show if user voice adaptation was applied or why it failed
      updateAdaptationStatus(data);
      
      // Create download link for backup
      const downloadLink = document.createElement('a');
      downloadLink.href = data.download_url;
      downloadLink.classList.add('download-link');
      downloadLink.innerHTML = '<i class="fas fa-download"></i> Download audio file';
      downloadLink.style.display = 'block';
      downloadLink.style.marginTop = '10px';
      downloadLink.style.textAlign = 'center';
      
      // Remove any existing download links
      const existingLinks = document.querySelectorAll('.download-link');
      existingLinks.forEach(link => link.remove());
      
      // Add the download link below the audio player
      document.getElementById('audioOutput').appendChild(downloadLink);
      
      // Set the audio source to the streaming URL
      synthAudio.src = data.file_url;
      
      // Add event listeners for debugging
      synthAudio.onloadeddata = () => console.log('Audio loaded successfully');
      synthAudio.onerror = (e) => {
        console.error('Audio error:', e);
        showMessage('Error playing audio. Please use the download link below.', 'error');
      };
      
      // Force a reload of the audio element
      synthAudio.load();
      
      // Try to play the audio with a slight delay to ensure it's loaded
      setTimeout(() => {
        const playPromise = synthAudio.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log('Audio playback started successfully'))
            .catch(err => {
              console.error('Audio playback failed:', err);
              showMessage('Audio playback failed. Please use the download link instead.', 'error');
            });
        }
      }, 1000);
      
      showMessage('Speech synthesized successfully!', 'success');
    } catch (err) {
      console.error('Error synthesizing voice:', err);
      showMessage('Failed to synthesize speech: ' + err.message, 'error');
    } finally {
      synthesizeButton.disabled = false;
      synthesizeButton.textContent = 'Speak';
    }
  }
  
  // Function to update the adaptation status UI
  function updateAdaptationStatus(data) {
    const adaptationStatus = document.getElementById('adaptationStatus');
    if (!adaptationStatus) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'adaptationStatus';
      statusDiv.className = 'adaptation-status';
      
      const audioOutput = document.getElementById('audioOutput');
      if (audioOutput && audioOutput.firstChild) {
        audioOutput.insertBefore(statusDiv, audioOutput.firstChild);
      }
    }
    
    if (document.getElementById('adaptationStatus')) {
      const statusElement = document.getElementById('adaptationStatus');
      
      // Check if adaptation was successful
      if (data.user_voice_applied) {
        statusElement.innerHTML = '<span class="status-icon">✓</span> Voice adaptation applied';
        statusElement.className = 'adaptation-status applied';
      } 
      // Check if adaptation failed with a reason
      else if (data.adaptation_failure) {
        const error = data.adaptation_failure;
        let errorMessage = error.message || 'Unknown error';
        let solution = error.solution || '';
        
        // Special handling for dependency issues
        if (error.error_type === 'missing_dependency') {
          statusElement.innerHTML = `
            <span class="status-icon">⚠</span> 
            <div class="adaptation-error">
              <div>${errorMessage}</div>
              <div class="adaptation-solution">
                <strong>Solution:</strong> ${solution}
              </div>
            </div>
          `;
          statusElement.className = 'adaptation-status error dependency-error';
        } else {
          statusElement.innerHTML = `
            <span class="status-icon">ⓘ</span>
            <div>Voice adaptation not applied: ${errorMessage}</div>
            ${solution ? `<div class="adaptation-solution">${solution}</div>` : ''}
          `;
          statusElement.className = 'adaptation-status not-applied';
        }
      } 
      // Default case - no adaptation, no specific error
      else {
        statusElement.innerHTML = '<span class="status-icon">ⓘ</span> Using AI voice only (no adaptation)';
        statusElement.className = 'adaptation-status not-applied';
      }
    }
  }
  
  // Helper to show messages
  function showMessage(text, type = 'success') {
    // Create message element
    const messageEl = document.createElement('div');
    messageEl.classList.add('status-message');
    messageEl.classList.add(`status-${type}`);
    messageEl.textContent = text;
    
    // Insert at the top of the current active section
    const activeSection = learnSection.classList.contains('hidden') 
      ? synthesizeSection 
      : learnSection;
    
    activeSection.insertBefore(messageEl, activeSection.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 5000);
  }
  
  // Handle window resize for canvas
  window.addEventListener('resize', () => {
    if (visualizer) {
      visualizer.width = visualizer.clientWidth;
      visualizer.height = visualizer.clientHeight;
    }
  });
  
  // Check health status on load
  async function checkHealth() {
    try {
      const response = await fetch('/health');
      
      if (!response.ok) {
        showMessage('Warning: System is not fully loaded. Some features may not work.', 'error');
        return;
      }
      
      const data = await response.json();
      
      // Check if FFmpeg is missing and show a warning
      if (!data.ffmpeg_available) {
        showMessage(
          'FFmpeg not found. Voice adaptation requires FFmpeg to be installed. ' +
          'Install with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)',
          'warning'
        );
      }
      
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }
  
  // Check if user already has a voice sample
  if (userId) {
    showMessage('Welcome back! Your voice profile is ready.', 'success');
  }
  
  // Initialize
  checkHealth();
});
