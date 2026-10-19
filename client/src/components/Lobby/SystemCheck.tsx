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
 * The stream is released on unmount; ProctoringEngine re-acquires it inside the exam.
 */
export function SystemCheck({ requireWebcam, requireMicrophone, requireFullscreen, onReadyChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [browser, setBrowser] = useState<State>('checking');
  const [browserIssues, setBrowserIssues] = useState<string[]>([]);
  const [camera, setCamera] = useState<State>(requireWebcam ? 'checking' : 'passed');
  const [mic, setMic] = useState<State>(requireMicrophone ? 'checking' : 'passed');
  const [micPeak, setMicPeak] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const issues: string[] = [];
    if (!window.isSecureContext) issues.push('Page must be served over HTTPS');
    if (!navigator.mediaDevices?.getUserMedia) issues.push('Camera API not supported');
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
  }, [requireFullscreen]);

  useEffect(() => {
    if (!requireWebcam && !requireMicrophone) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: requireWebcam, audio: requireMicrophone });
      } catch {
        if (requireWebcam) setCamera('failed');
        if (requireMicrophone) setMic('failed');
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());

      if (requireWebcam) {
        const ok = stream.getVideoTracks().some((t) => t.readyState === 'live');
        setCamera(ok ? 'passed' : 'failed');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }

      if (requireMicrophone && stream.getAudioTracks().length) {
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          const pct = Math.min(100, (peak / 128) * 250);
          setLevel(pct);
          setMicPeak((p) => Math.max(p, pct));
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [requireWebcam, requireMicrophone]);

  // The mic passes once we've actually heard something — proves it isn't muted.
  useEffect(() => {
    if (requireMicrophone && mic === 'checking' && micPeak > 15) setMic('passed');
  }, [micPeak, mic, requireMicrophone]);

  const ready = browser === 'passed' && camera === 'passed' && mic === 'passed';
  useEffect(() => onReadyChange(ready), [ready, onReadyChange]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
        {requireWebcam ? (
          <video ref={videoRef} muted playsInline className="aspect-video w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-slate-400">Webcam not required</div>
        )}
      </div>

      <ul className="space-y-3">
        <Item icon={Globe} label="Browser compatibility" state={browser} detail={browserIssues.join(' · ') || undefined} />
        {requireWebcam && <Item icon={Camera} label="Webcam" state={camera} detail={camera === 'failed' ? 'Allow camera access in the address bar and reload' : undefined} />}
        {requireMicrophone && (
          <Item
            icon={Mic}
            label="Microphone"
            state={mic}
            detail={mic === 'failed' ? 'Allow microphone access and reload' : mic === 'checking' ? 'Say something to test your mic' : undefined}
          >
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${level}%` }} />
            </div>
          </Item>
        )}
        {requireFullscreen && <Item icon={Maximize} label="Fullscreen" state={browser === 'failed' ? 'failed' : 'passed'} detail="The exam opens in fullscreen when you start" />}
      </ul>
    </div>
  );
}

function Item({ icon: Icon, label, state, detail, children }: { icon: typeof Camera; label: string; state: State; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
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
