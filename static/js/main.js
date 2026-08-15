// ---------- PWA service worker registration ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
  });
}

// ---------- DOM refs ----------
const micBtn = document.getElementById('mic-btn');
const statusText = document.getElementById('status-text');
const transcript = document.getElementById('transcript');
const placeholder = document.getElementById('placeholder');
const brand = document.querySelector('.brand');
const hint = document.getElementById('hint');

let hasInteracted = false;

function setStatus(text) {
  statusText.textContent = text;
}

function addLine(text, who) {
  if (!hasInteracted) {
    placeholder.style.display = 'none';
    // Hide heading/tagline behind the interaction instead of overlaying on top of it
    brand.style.opacity = '0';
    brand.style.pointerEvents = 'none';
    hasInteracted = true;
  }
  const p = document.createElement('p');
  p.className = `line ${who}`;
  p.textContent = text;
  transcript.appendChild(p);
  transcript.scrollTop = transcript.scrollHeight;
}

// ---------- Wake chime (Web Audio API, no file needed) ----------
let audioCtx = null;
function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch (e) {
    // Web Audio not available — fail silently, chime is a nice-to-have
  }
}

// ---------- Speech recognition (STT) with "Hey Alexa" wake word ----------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_WORDS = ['hey alexa', 'hey, alexa', 'alexa'];

let recognition = null;
let listening = false;   // background mic is on (wake mode or awake mode)
let awake = false;       // wake word has been heard, capturing a command now
let shouldRun = false;   // user has turned the assistant on

function stripWakeWord(text) {
  const lower = text.toLowerCase();
  for (const w of WAKE_WORDS) {
    const idx = lower.indexOf(w);
    if (idx !== -1) {
      return text.slice(idx + w.length).replace(/^[,.\s]+/, '').trim();
    }
  }
  return null;
}

function handleCommand(text) {
  addLine(text, 'user');
  sendToAlexa(text);
  awake = false;
  setStatus('SAY "HEY ALEXA"');
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('listening');
    setStatus(awake ? 'LISTENING' : 'SAY "HEY ALEXA"');
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    // Browsers auto-stop continuous recognition after a while — restart if still enabled
    if (shouldRun) {
      setTimeout(() => {
        if (shouldRun) {
          try { recognition.start(); } catch (e) {}
        }
      }, 250);
    } else {
      setStatus('STANDBY');
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return; // expected, ignore
    listening = false;
    micBtn.classList.remove('listening');
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (!result.isFinal) return;
    const said = result[0].transcript.trim();
    if (!said) return;

    if (!awake) {
      const command = stripWakeWord(said);
      if (command === null) return; // wake word not heard, ignore ambient speech
      window.speechSynthesis.cancel();
      playChime();
      if (command.length > 0) {
        // e.g. "hey alexa what's the weather" said in one breath
        handleCommand(command);
      } else {
        awake = true;
        setStatus('LISTENING');
      }
    } else {
      handleCommand(said);
    }
  };
} else {
  hint.textContent = 'Voice input not supported in this browser';
}

// Mic button toggles the always-listening wake-word mode on/off
micBtn.addEventListener('click', () => {
  if (!recognition) return;

  if (shouldRun) {
    shouldRun = false;
    awake = false;
    recognition.stop();
    setStatus('STANDBY');
    hint.textContent = 'Tap to enable "Hey Alexa"';
    return;
  }

  shouldRun = true;
  window.speechSynthesis.cancel();
  try {
    recognition.start();
    hint.textContent = 'Listening for "Hey Alexa"';
  } catch (e) {
    // already running
  }
});

// ---------- Talk to backend ----------
async function sendToAlexa(message) {
  setStatus('THINKING');
  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    const reply = data.reply || data.error || 'Something went wrong.';
    addLine(reply, 'bot');
    speak(reply);
  } catch (err) {
    const msg = "I couldn't reach the server just now.";
    addLine(msg, 'bot');
    speak(msg);
  }
}

// ---------- Speech synthesis (TTS) ----------
function speak(text) {
  if (!('speechSynthesis' in window)) {
    setStatus('STANDBY');
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.02;
  utter.pitch = 1.0;

  utter.onstart = () => {
    micBtn.classList.add('speaking');
    setStatus('SPEAKING');
  };
  utter.onend = () => {
    micBtn.classList.remove('speaking');
    setStatus('STANDBY');
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ================= Three.js HUD orb =================
const container = document.getElementById('hud-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 6;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Particle sphere core
const PARTICLE_COUNT = 2200;
const positions = new Float32Array(PARTICLE_COUNT * 3);
const radius = 1.6;

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
  const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
  positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
  positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
  positions[i * 3 + 2] = radius * Math.cos(phi);
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  color: 0x4de8ff,
  size: 0.02,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
});

const particleSphere = new THREE.Points(geometry, material);
scene.add(particleSphere);

// Concentric HUD rings
function makeRing(r, segments, color, opacity) {
  const ringGeo = new THREE.RingGeometry(r, r + 0.01, segments);
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(ringGeo, ringMat);
}

const ring1 = makeRing(2.1, 64, 0x4de8ff, 0.25);
const ring2 = makeRing(2.4, 6, 0x4de8ff, 0.12);
scene.add(ring1, ring2);

let t = 0;
let pulseTarget = 1;
let pulseCurrent = 1;

function animate() {
  requestAnimationFrame(animate);
  t += 0.005;

  particleSphere.rotation.y += 0.0022;
  particleSphere.rotation.x = Math.sin(t * 0.3) * 0.1;

  ring1.rotation.z += 0.0015;
  ring2.rotation.z -= 0.0025;

  // Pulse core based on state (armed/listening/speaking = larger + brighter)
  pulseTarget = shouldRun || awake || window.speechSynthesis?.speaking ? 1.18 : 1.0;
  pulseCurrent += (pulseTarget - pulseCurrent) * 0.08;
  particleSphere.scale.setScalar(pulseCurrent);
  material.opacity = 0.6 + (pulseCurrent - 1) * 1.5;

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});