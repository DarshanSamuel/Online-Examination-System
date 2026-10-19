import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { Mic, VideoOff } from 'lucide-react';
import { auth, storage } from '../../lib/firebase';
import { reportProctorEvent } from '../../lib/proctorQueue';
import { useExamStore } from '../../store/examStore';
import { cn } from '../../lib/utils';

const AUDIO_SUSTAIN_MS = 1500; // ignore short clicks/coughs
const AUDIO_COOLDOWN_MS = 15_000;

/**
 * Webcam + microphone proctoring.
 *  - Periodic JPEG snapshot → Cloud Storage at proctoring/{examId}/{uid}/{ts}.jpg (storage.rules
 *    only allows create-once, <300 KB JPEGs in the candidate's own folder), then the path is
 *    reported as a `snapshot` event; the API re-validates the prefix.
 *  - Mic RMS level in dBFS; sustained levels above the exam's threshold raise `audio_spike`.
 *  - Track loss (camera unplugged / permission revoked) raises `camera_lost`.
 */
export function ProctoringEngine() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const levelRef = useRef<number>(-100);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(-100);

  const phase = useExamStore((s) => s.phase);
  const examId = useExamStore((s) => s.examId);
  const config = useExamStore((s) => s.proctoring);

  useEffect(() => {
    if (phase !== 'active' || !config || !examId) return;
    if (!config.requireWebcam && !config.requireMicrophone) return;

    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let raf = 0;
    let snapshotTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: config.requireWebcam ? { width: 320, height: 240, facingMode: 'user' } : false,
          audio: config.requireMicrophone ? { echoCancellation: false, noiseSuppression: false } : false,
        });
      } catch (err) {
        setError('Camera/microphone unavailable');
        reportProctorEvent({ type: 'camera_lost', clientTs: Date.now(), meta: { reason: (err as Error).name } }, { immediate: true });
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          setError(`${track.kind === 'video' ? 'Camera' : 'Microphone'} disconnected`);
          reportProctorEvent({ type: 'camera_lost', clientTs: Date.now(), meta: { kind: track.kind } }, { immediate: true });
        };
      });

      if (videoRef.current && config.requireWebcam) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if (config.requireMicrophone && stream.getAudioTracks().length) {
        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let loudSince = 0;
        let lastFlag = 0;
        let lastUi = 0;

        const tick = (t: number) => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
          const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8);
          levelRef.current = db;
          if (t - lastUi > 200) {
            setLevel(db);
            lastUi = t;
          }

          if (db > config.audioThresholdDb) {
            loudSince ||= t;
            if (t - loudSince > AUDIO_SUSTAIN_MS && t - lastFlag > AUDIO_COOLDOWN_MS) {
              lastFlag = t;
              reportProctorEvent({ type: 'audio_spike', clientTs: Date.now(), meta: { db: Math.round(db), thresholdDb: config.audioThresholdDb } });
            }
          } else {
            loudSince = 0;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }

      if (config.requireWebcam) {
        const intervalMs = Math.max(15, config.snapshotIntervalSec) * 1000;
        setTimeout(() => void takeSnapshot(), 5_000); // one early snapshot for identity check
        snapshotTimer = setInterval(() => void takeSnapshot(), intervalMs);
      }
    };

    const takeSnapshot = async () => {
      const video = videoRef.current;
      const uid = auth.currentUser?.uid;
      if (!video || !uid || video.readyState < 2) return;

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.6));
      if (!blob) return;

      const ts = Date.now();
      const path = `proctoring/${examId}/${uid}/${ts}.jpg`;
      try {
        await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
        reportProctorEvent({ type: 'snapshot', clientTs: ts, meta: { storagePath: path, audioLevelDb: Math.round(levelRef.current) } });
      } catch {
        /* offline — skip this snapshot; the next interval will try again */
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (snapshotTimer) clearInterval(snapshotTimer);
      stream?.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      void audioCtx?.close();
    };
  }, [phase, examId, config]);

  if (phase !== 'active' || !config?.requireWebcam) return null;

  // Map -60..0 dBFS onto 0..100% for the level meter.
  const pct = Math.min(100, Math.max(0, ((level + 60) / 60) * 100));

  return (
    <div className="fixed bottom-4 right-4 z-50 w-44 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
      <div className="relative aspect-[4/3]">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/90 text-xs text-red-300">
            <VideoOff className="h-5 w-5" /> {error}
          </div>
        )}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Proctored
        </span>
      </div>
      {config.requireMicrophone && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Mic className="h-3 w-3 text-slate-400" />
          <div className="h-1 flex-1 overflow-hidden rounded bg-slate-700">
            <div className={cn('h-full transition-all', level > config.audioThresholdDb ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
