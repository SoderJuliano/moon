// Gravador de Vídeo do Canvas com suporte a Áudio Mixado via MediaRecorder.
// Grava diretamente os frames do Three.js em 60 FPS + trilha sonora em alta definição.

export class TrailerRecorder {
  constructor(canvas, { fps = 60, videoBitsPerSecond = 16_000_000 } = {}) {
    this.canvas = canvas;
    this.fps = fps;
    this.videoBitsPerSecond = videoBitsPerSecond;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.startTime = 0;
    this.duration = 0;
    this.mimeType = this._selectMimeType();
    this.audioCtx = null;
    this.audioDest = null;
    this.audioSource = null;
  }

  _selectMimeType() {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];
    for (const type of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "video/webm";
  }

  start(audioEl = null) {
    if (this.isRecording) return;
    this.recordedChunks = [];

    try {
      const canvasStream = this.canvas.captureStream(this.fps);
      let stream = canvasStream;

      if (audioEl && typeof window !== "undefined") {
        try {
          if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
              this.audioCtx = new AudioContext();
              this.audioDest = this.audioCtx.createMediaStreamDestination();
              this.audioSource = this.audioCtx.createMediaElementSource(audioEl);
              this.audioSource.connect(this.audioDest);
              this.audioSource.connect(this.audioCtx.destination);
            }
          }
          if (this.audioCtx && this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
          }

          if (this.audioDest) {
            const videoTrack = canvasStream.getVideoTracks()[0];
            const audioTrack = this.audioDest.stream.getAudioTracks()[0];
            if (videoTrack && audioTrack) {
              stream = new MediaStream([videoTrack, audioTrack]);
            }
          }
        } catch (audioErr) {
          console.warn("[TrailerRecorder] Mixagem de áudio indisponível, gravando vídeo puro:", audioErr);
        }
      }

      const options = {
        mimeType: this.mimeType,
        videoBitsPerSecond: this.videoBitsPerSecond,
      };

      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.startTime = performance.now();
      console.log(`[TrailerRecorder] Gravação com áudio iniciada (${this.fps} FPS, ${this.mimeType})`);
    } catch (err) {
      console.warn("[TrailerRecorder] Falha ao iniciar MediaRecorder:", err);
      this.isRecording = false;
    }
  }

  stop(filename = "moon-trailer-30s.webm") {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.duration = (performance.now() - this.startTime) / 1000;

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        if (this.recordedChunks.length === 0) {
          console.warn("[TrailerRecorder] Nenhum frame gravado.");
          resolve(null);
          return;
        }

        const blob = new Blob(this.recordedChunks, { type: this.mimeType });
        this.downloadBlob(blob, filename);
        console.log(`[TrailerRecorder] Gravação concluída com áudio (${this.duration.toFixed(1)}s, ${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        this.isRecording = false;
        resolve(null);
      }
    });
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  }
}
