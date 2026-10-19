import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Globe, Loader2, Maximize, Mic, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

type State = 'checking' | 'passed' | 'failed';

interface Props {
  requireWebcam: boolean;
  requireMicrophone: boolean;
  requireFullscreen: boolean;
  onReadyChange: (ready: boolean) => void;
}

/**
 * Pre-exam lobby check: browser capabilities, live camera preview, and a mic level meter.
 * Camera and microphone are only required when the examiner marks them mandatory;
 * otherwise they pass immediately as optional.
 */
export function SystemCheck({ requireWebcam, requireMicrophone, requireFullscreen, onReadyChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [browser, setBrowser] = useState<State>('checking');
  const [browserIssues, setBrowserIssues] = useState<string[]>([]);
  const [camera, setCamera] = useState<State>(requireWebcam ? 'checking' : 'passed');
  const [mic, setMic] = useState<State>(requireMicrophone ? 'checking' : 'passed');
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const issues: string[] = [];
    if (!window.isSecureContext) issues.push('Page must be served over HTTPS');
    if ((requireWebcam || requireMicrophone) && !navigator.mediaDevices?.getUserMedia) {
      issues.push('Media device API not supported in this browser');
    }
    if (requireFullscreen && !document.fullscreenEnabled) issues.push('Fullscreen not supported');
    try {
      localStorage.setItem('__probe', '1');
      localStorage.removeItem('__probe');
    } catch {
      issues.push('Local storage is disabled (needed for offline autosave)');
    }
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) issues.push('Please use a desktop or laptop computer');
    setBrowserIssues(issues);
    setBrowser(issues.length ? 'failed' : 'passed');
  }, [requireFullscreen, requireWebcam, requireMicrophone]);

  useEffect(() => {
    setCamera(requireWebcam ? 'checking' : 'passed');
    setMic(requireMicrophone ? 'checking' : 'passed');

    if (!requireWebcam && !requireMicrophone) return;
    let videoStream: MediaStream | null = null;
    let audioStream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      // Request camera independently if mandatory
      if (requireWebcam) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (cancelled) {
            videoStream.getTracks().forEach((t) => t.stop());
            return;
          }
          const ok = videoStream.getVideoTracks().some((t) => t.readyState === 'live');
          setCamera(ok ? 'passed' : 'failed');
          if (videoRef.current) {
            videoRef.current.srcObject = videoStream;
            void videoRef.current.play().catch(() => {});
          }
        } catch {
          if (!cancelled) setCamera('failed');
        }
      }

      // Request microphone independently if mandatory
      if (requireMicrophone) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (cancelled) {
            audioStream.getTracks().forEach((t) => t.stop());
            return;
          }
          const hasLiveTrack = audioStream.getAudioTracks().some((t) => t.readyState === 'live');
          // Pass immediately once a live audio track is acquired (don't block on room noise threshold)
          setMic(hasLiveTrack ? 'passed' : 'failed');

          if (hasLiveTrack) {
            ctx = new AudioContext();
            await ctx.resume().catch(() => {});
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(audioStream).connect(analyser);
            const buf = new Uint8Array(analyser.fftSize);
            const tick = () => {
              analyser.getByteTimeDomainData(buf);
              let peak = 0;
              for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
              const pct = Math.min(100, (peak / 128) * 300);
              setLevel(pct);
              raf = requestAnimationFrame(tick);
            };
            tick();
          }
        } catch {
          if (!cancelled) setMic('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      videoStream?.getTracks().forEach((t) => t.stop());
      audioStream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [requireWebcam, requireMicrophone]);

  const ready = browser === 'passed' && camera === 'passed' && mic === 'passed';
  useEffect(() => onReadyChange(ready), [ready, onReadyChange]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-900">
        {requireWebcam ? (
          <video ref={videoRef} muted playsInline className="aspect-video w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-400">
            <Camera className="h-7 w-7 text-slate-500" />
            <span>Webcam is optional for this exam</span>
          </div>
        )}
      </div>

      <ul className="space-y-3">
        <Item icon={Globe} label="Browser compatibility" state={browser} detail={browserIssues.join(' · ') || 'Supported desktop browser'} />
        <Item
          icon={Camera}
          label={requireWebcam ? 'Webcam (Mandatory)' : 'Webcam (Optional)'}
          state={camera}
          detail={
            !requireWebcam
              ? 'Not required by examiner for this exam'
              : camera === 'failed'
                ? 'Allow camera access in your browser address bar and reload'
                : 'Camera connected and active'
          }
        />
        <Item
          icon={Mic}
          label={requireMicrophone ? 'Microphone (Mandatory)' : 'Microphone (Optional)'}
          state={mic}
          detail={
            !requireMicrophone
              ? 'Not required by examiner for this exam'
              : mic === 'failed'
                ? 'Allow microphone access in your browser address bar and reload'
                : 'Microphone connected — speak to test input level'
          }
        >
          {requireMicrophone && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.max(6, level)}%` }} />
            </div>
          )}
        </Item>
        <Item
          icon={Maximize}
          label={requireFullscreen ? 'Fullscreen (Mandatory)' : 'Fullscreen (Optional)'}
          state={browser === 'failed' ? 'failed' : 'passed'}
          detail={requireFullscreen ? 'The exam opens in fullscreen when you start' : 'Fullscreen is optional for this exam'}
        />
      </ul>
    </div>
  );
}

function Item({ icon: Icon, label, state, detail, children }: { icon: typeof Camera; label: string; state: State; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-slate-500" />
          <span className="font-medium text-slate-800">{label}</span>
        </div>
        {state === 'checking' && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {state === 'passed' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {state === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
      </div>
      {detail && <p className={cn('mt-1 text-xs', state === 'failed' ? 'text-red-600' : 'text-slate-500')}>{detail}</p>}
      {children}
    </li>
  );
}
