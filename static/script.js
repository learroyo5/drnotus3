const NGROK_URL = "https://3370c3018102.ngrok-free.app";

let mediaRecorder;
let audioChunks = [];
let currentStream;
let recordingInterval;
let recordingSeconds = 0;
let processingInterval;
let processingSeconds = 0;

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const uploadBtn = document.getElementById("uploadBtn");
const audioFile = document.getElementById("audioFile");
const templateSelect = document.getElementById("template");
const transcriptionArea = document.getElementById("transcription");
const summaryArea = document.getElementById("summary");
const filenameInput = document.getElementById("filename");
const loadingIndicator = document.getElementById("loading");
const recordingIndicator = document.getElementById("recordingIndicator");

function mostrarCargando(mostrar) {
  if (mostrar) {
    loadingIndicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; font-weight: bold;">
        <img src="/static/loading-pencil.gif" alt="Procesando" width="32" height="32" />
        Procesando... por favor espera.
      </div>`;
    loadingIndicator.style.display = "block";
  } else {
    loadingIndicator.style.display = "none";
    loadingIndicator.innerHTML = "";
  }
}

function mostrarError(mensaje) {
  const errorDiv = document.getElementById('errorMsg');
  errorDiv.textContent = mensaje;
  errorDiv.style.display = 'block';
}

function limpiarError() {
  const errorDiv = document.getElementById('errorMsg');
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
}

function actualizarRecordingTime() {
  const min = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
  const sec = String(recordingSeconds % 60).padStart(2, '0');
  document.getElementById("recordingTime").textContent = `${min}:${sec}`;
}

function actualizarProcessingTime() {
  const min = String(Math.floor(processingSeconds / 60)).padStart(2, '0');
  const sec = String(processingSeconds % 60).padStart(2, '0');
  document.getElementById("processingTime").textContent = `${min}:${sec}`;
}

startBtn.addEventListener("click", async () => {
  currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(currentStream);
  audioChunks = [];
  mediaRecorder.ondataavailable = event => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };
  mediaRecorder.start();
  recordingSeconds = 0;
  actualizarRecordingTime();
  clearInterval(recordingInterval);
  recordingInterval = setInterval(() => {
    recordingSeconds++;
    actualizarRecordingTime();
  }, 1000);
  recordingIndicator.style.display = "block";
});

pauseBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    clearInterval(recordingInterval); // Detiene el contador
    pauseBtn.innerHTML = `<svg class="icon" fill="#f1c40f" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg> Reanudar`;
    document.getElementById("recordingIndicatorText").innerHTML = `
      <div style="width: 12px; height: 12px; background-color: #f1c40f; border-radius: 50%; animation: blink 1s infinite;"></div>
      Grabación en pausa...
    `;
  } else if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    recordingInterval = setInterval(() => {
      recordingSeconds++;
      actualizarRecordingTime();
    }, 1000);
    pauseBtn.innerHTML = `<svg class="icon" fill="#f1c40f" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg> Pausar`;
    document.getElementById("recordingIndicatorText").innerHTML = `
      <div style="width: 12px; height: 12px; background-color: #c0392b; border-radius: 50%; animation: blink 1s infinite;"></div>
      Grabando en curso...
    `;
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    recordingIndicator.style.display = "none";
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(recordingInterval);
    pauseBtn.innerHTML = `<svg class="icon" fill="#f1c40f" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg> Pausar`;
    document.getElementById("recordingIndicatorText").innerHTML = `
      <div style="width: 12px; height: 12px; background-color: #c0392b; border-radius: 50%;"></div>
      Grabando en curso...
    `;
  }
});

resetBtn.addEventListener("click", () => {
  transcriptionArea.value = "";
  summaryArea.value = "";
  audioChunks = [];
  filenameInput.value = "";
  audioFile.value = "";
  recordingIndicator.style.display = "none";
  clearInterval(recordingInterval);
  recordingSeconds = 0;
  actualizarRecordingTime();
  document.getElementById("recordingIndicatorText").innerHTML = `
    <div style="width: 12px; height: 12px; background-color: #c0392b; border-radius: 50%;"></div>
    Grabando en curso...
  `;
});

uploadBtn.addEventListener("click", async () => {
  limpiarError();
  let fileToSend;
  if (audioChunks.length > 0) {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    fileToSend = new File([audioBlob], "grabacion.webm");
  } else if (audioFile.files.length > 0) {
    fileToSend = audioFile.files[0];
  } else {
    mostrarError("Debes grabar o seleccionar un archivo de audio.");
    return;
  }

  const formData = new FormData();
  formData.append("audio", fileToSend);

  mostrarCargando(true);
  processingSeconds = 0;
  actualizarProcessingTime();
  clearInterval(processingInterval);
  processingInterval = setInterval(() => {
    processingSeconds++;
    actualizarProcessingTime();
  }, 1000);

  try {
    const response = await fetch(`${NGROK_URL}/transcribe`, {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    mostrarCargando(false);
    clearInterval(processingInterval);
    if (data.error) {
      mostrarError(data.error);
      return;
    }
    transcriptionArea.value = data.transcription;
  } catch (error) {
    mostrarCargando(false);
    clearInterval(processingInterval);
    mostrarError("Error al conectar con el backend.");
  }
});

document.getElementById("copyTranscript").addEventListener("click", () => {
  navigator.clipboard.writeText(transcriptionArea.value);
});

document.getElementById("copySummary").addEventListener("click", () => {
  const nombre = filenameInput.value || "Resumen";
  navigator.clipboard.writeText(`Nombre: ${nombre}\n\n${summaryArea.value}`);
});

document.getElementById("copyAll").addEventListener("click", () => {
  const nombre = filenameInput.value || "Resumen";
  const textoCompleto = `Nombre: ${nombre}\n\nTranscripción:\n${transcriptionArea.value}\n\nResumen Clínico:\n${summaryArea.value}`;
  navigator.clipboard.writeText(textoCompleto);
});

function cargarArchivos() {
  fetch('/archivos')
    .then(res => res.json())
    .then(data => {
      const lista = document.getElementById('listaArchivos');
      lista.innerHTML = '';
      if (data.archivos.length === 0) {
        lista.innerHTML = '<li>No hay archivos guardados.</li>';
        return;
      }
      data.archivos.forEach(nombre => {
        const li = document.createElement('li');
        li.innerHTML = `
          ${nombre}
          <a href="/descargar/${encodeURIComponent(nombre)}" style="margin-left:10px;" download>
            Descargar
          </a>
        `;
        lista.appendChild(li);
      });
    });
}

templateSelect.addEventListener("change", () => {
  const customPromptContainer = document.getElementById("customPromptContainer");
  const customPrompt = document.getElementById("customPrompt");
  if (templateSelect.value === "personalizado") {
    customPromptContainer.style.display = "block";
    customPrompt.value = "";
    customPrompt.focus();
  } else {
    customPromptContainer.style.display = "block";
    customPrompt.value = PROMPTS[templateSelect.value] || "";
    customPrompt.focus();
  }
});

// Al cargar la página, oculta el contenedor
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("customPromptContainer").style.display = "none";
});
