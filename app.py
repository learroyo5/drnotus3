import os
import tempfile
import whisper
import openai
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import time
import threading
import uuid

app = Flask(__name__)  # <-- ESTA LÍNEA ES NECESARIA

load_dotenv()

UPLOAD_FOLDER = 'uploads'
RESULTS_FOLDER = 'results'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
try:
    model = whisper.load_model(WHISPER_MODEL)
except Exception as e:
    raise RuntimeError(f"No se pudo cargar el modelo Whisper '{WHISPER_MODEL}': {e}")

PROMPTS = {
    "SOAP": "Actúa como médico. Resume en formato SOAP (Subjetivo, Objetivo, Evaluación, Plan) el siguiente texto de transcripción:",
    "Registro clínico electrónico": "Actúa como médico. Resume el siguiente texto con los campos: Motivo de consulta, Síntomas, Exploración física, Diagnóstico, Indicaciones:",
    "Consulta psiquiátrica": "Actúa como psiquiatra. Resume la entrevista en los campos: Antecedentes psiquiátricos previos, Examen mental,  Síntomas actuales, Diagnóstico presuntivo, Conducta a seguir:",
    "Consulta pediátrica": "Actúa como pediatra. Resume el siguiente texto con los campos: Motivo de consulta, Antecedentes, Evaluación del desarrollo, Diagnóstico, Indicaciones:",
    "Consulta ginecológica": "Actúa como ginecólogo. Resume el siguiente texto con los campos: Motivo de consulta, Ciclo menstrual, Síntomas, Examen físico, Diagnóstico, Tratamiento recomendado:"
}

jobs = {}  # <-- Declarar aquí

def limpiar_archivos_antiguos(dias=7):
    ahora = time.time()
    limite = dias * 86400  # segundos en X días
    for carpeta in [UPLOAD_FOLDER, RESULTS_FOLDER]:
        for nombre in os.listdir(carpeta):
            ruta = os.path.join(carpeta, nombre)
            if os.path.isfile(ruta):
                if ahora - os.path.getmtime(ruta) > limite:
                    os.remove(ruta)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_audio():
    job_id = str(uuid.uuid4())
    audio_file = request.files['audio']
    filename = secure_filename(request.form.get('filename', audio_file.filename))
    if not filename:
        filename = "audio"
    audio_save_path = os.path.join(UPLOAD_FOLDER, filename)
    audio_file.save(audio_save_path)

    template = request.form.get('template', 'SOAP')
    custom_prompt = request.form.get('customPrompt', '').strip()

    jobs[job_id] = {"status": "procesando", "transcription": "", "summary": "", "error": ""}

    def procesar():
        try:
            transcription_result = model.transcribe(audio_save_path)
            transcription = transcription_result['text']
            if template == "personalizado":
                prompt = custom_prompt + "\n" + transcription
            else:
                prompt = PROMPTS.get(template, PROMPTS['SOAP']) + "\n" + transcription
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Eres un asistente clínico que resume conversaciones médicas."},
                    {"role": "user", "content": prompt}
                ]
            )
            summary = response['choices'][0]['message']['content']
            jobs[job_id] = {
                "status": "completado",
                "transcription": transcription,
                "summary": summary,
                "error": ""
            }
        except Exception as e:
            jobs[job_id] = {
                "status": "error",
                "transcription": "",
                "summary": "",
                "error": str(e)
            }

    threading.Thread(target=procesar).start()
    return jsonify({"job_id": job_id})

@app.route('/archivos')
def listar_archivos():
    archivos = []
    for nombre in os.listdir(RESULTS_FOLDER):
        if nombre.endswith('_transcripcion.txt') or nombre.endswith('_resumen.txt'):
            archivos.append(nombre)
    return jsonify({"archivos": archivos})

@app.route('/descargar/<nombre_archivo>')
def descargar_archivo(nombre_archivo):
    return send_from_directory(RESULTS_FOLDER, nombre_archivo, as_attachment=True)

@app.route('/estado/<job_id>')
def estado(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "ID de trabajo no encontrado"}), 404
    return jsonify(job)

if __name__ == '__main__':
    app.run(debug=True)
