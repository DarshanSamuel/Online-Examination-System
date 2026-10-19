import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { CheckCircle2, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/api';
import { KeystrokeRecorder } from '../../lib/keystrokeRecorder';
import { useExamStore } from '../../store/examStore';
import type { CodingQuestion, LanguageKey, RunResponse } from '../../types/exam';
import { card } from '../ui/styles';
import { cn } from '../../lib/utils';
import { AnswerFooterNav, Prompt, QuestionHeader } from './QuestionTypes';

type Tab = 'tests' | 'custom';

/**
 * Coding question: Monaco editor + "Run" against public tests (server-side sandbox) +
 * keystroke recording for replay. Hidden tests are never sent to the browser; final grading
 * happens on the server after submission.
 */
export function CodeEditor({ question, index }: { question: CodingQuestion; index: number }) {
  const submissionId = useExamStore((s) => s.submissionId)!;
  const saved = useExamStore((s) => s.answers[question.questionId]?.answer);
  const saveAnswer = useExamStore((s) => s.saveAnswer);

  const initial = saved?.type === 'coding' ? saved : null;
  const [language, setLanguage] = useState<LanguageKey>(initial?.language ?? question.languages[0]!.key);
  const starterFor = (lang: LanguageKey) => question.languages.find((l) => l.key === lang)?.starterCode ?? '';

  // Per-language drafts so switching languages doesn't destroy work.
  const drafts = useRef<Partial<Record<LanguageKey, string>>>(initial ? { [initial.language]: initial.code } : {});
  const code = drafts.current[language] ?? starterFor(language);

  const recorder = useRef<KeystrokeRecorder | null>(null);
  useEffect(() => {
    recorder.current = new KeystrokeRecorder(submissionId, question.questionId, language);
    return () => recorder.current?.dispose();
    // Recorder lifetime is per question; language changes go through setLanguage().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, question.questionId]);

  const monacoLang = useMemo(() => question.languages.find((l) => l.key === language)?.monaco ?? 'plaintext', [question.languages, language]);

  const [tab, setTab] = useState<Tab>('tests');
  const [customInput, setCustomInput] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const persist = (lang: LanguageKey, value: string) => {
    drafts.current[lang] = value;
    saveAnswer(question.questionId, { type: 'coding', language: lang, code: value });
  };

  const onMount: OnMount = (editor) => {
    // Baseline for replay: whatever the editor starts with (starter code, or resumed work).
    recorder.current?.record({ k: 'r', v: language, i: editor.getValue() });
    let pasteFlag = false;
    editor.onDidPaste(() => {
      pasteFlag = true; // normally blocked by AntiCheatProvider; recorded as 'p' if it slips through
    });
    editor.onDidChangeModelContent((e) => {
      for (const c of e.changes) {
        recorder.current?.record({ k: pasteFlag ? 'p' : 'e', o: c.rangeOffset, d: c.rangeLength, i: c.text || undefined });
      }
      pasteFlag = false;
    });
    editor.onDidFocusEditorText(() => recorder.current?.record({ k: 'f' }));
    editor.onDidBlurEditorText(() => recorder.current?.record({ k: 'b' }));
  };

  const switchLanguage = (lang: LanguageKey) => {
    if (lang === language) return;
    const next = drafts.current[lang] ?? starterFor(lang);
    recorder.current?.setLanguage(lang);
    recorder.current?.record({ k: 'l', v: lang, i: next });
    setLanguage(lang);
    persist(lang, next);
  };

  const reset = () => {
    const starter = starterFor(language);
    recorder.current?.record({ k: 'r', v: language, i: starter });
    persist(language, starter);
    setEditorKey((k) => k + 1); // remount so the model picks up the starter code
  };
  const [editorKey, setEditorKey] = useState(0);

  const run = async (mode: Tab) => {
    setRunning(true);
    setRunError(null);
    setResult(null);
    setTab(mode);
    try {
      const { data } = await api.post<RunResponse>(`/attempts/${submissionId}/run`, {
        questionId: question.questionId,
        language,
        code: drafts.current[language] ?? code,
        ...(mode === 'custom' ? { customInput } : {}),
      });
      setResult(data);
    } catch (err) {
      setRunError(apiErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 lg:h-[calc(100vh-190px)] lg:min-h-[580px] lg:grid-cols-[minmax(320px,2fr)_3fr]">
      {/* Problem statement */}
      <section className={cn(card, 'min-h-0 overflow-auto p-6')}>
        <QuestionHeader title={question.title} points={question.points} index={index} />
        <Prompt text={question.prompt} />
        <div className="mt-6 space-y-3">
          {question.publicTestCases.map((t, i) => (
            <div key={t.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-sm">
              <p className="mb-2 font-semibold text-slate-700">Example {i + 1}</p>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div>
                  <p className="mb-1 font-sans text-slate-500">Input</p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-white p-2.5 ring-1 ring-slate-200/70">{t.input}</pre>
                </div>
                <div>
                  <p className="mb-1 font-sans text-slate-500">Output</p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-white p-2.5 ring-1 ring-slate-200/70">{t.expectedOutput}</pre>
                </div>
              </div>
              {t.explanation && <p className="mt-2 text-xs text-slate-500">{t.explanation}</p>}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Limits: {question.limits.cpuTimeSec}s CPU · {Math.round(question.limits.memoryKb / 1024)} MB. Hidden tests are used for grading.
          </p>
        </div>
      </section>

      {/* Editor + console */}
      <section className={cn(card, 'flex min-h-[560px] flex-col overflow-hidden')}>
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => switchLanguage(e.target.value as LanguageKey)}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium outline-none transition-colors hover:border-slate-400"
            >
              {question.languages.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
            <button onClick={reset} title="Reset to starter code" className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-all duration-200 hover:bg-slate-200 hover:text-slate-900 active:scale-95">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => run('custom')}
              disabled={running}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-100 active:translate-y-0 active:scale-95 disabled:opacity-50"
            >
              Run custom
            </button>
            <button
              onClick={() => run('tests')}
              disabled={running}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs shadow-emerald-600/20 transition-all duration-200 hover:-translate-y-[1px] hover:from-emerald-600 hover:to-emerald-700 active:translate-y-0 active:scale-95 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run tests
            </button>
          </div>
        </div>

        <div className="min-h-[260px] flex-1">
          <Editor
            key={`${question.questionId}:${language}:${editorKey}`}
            height="100%"
            language={monacoLang}
            defaultValue={code}
            theme="vs-dark"
            onMount={onMount}
            onChange={(v) => persist(language, v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              tabSize: 4,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              contextmenu: false, // its Cut/Copy/Paste items bypass keyboard blocking
              dragAndDrop: false,
              dropIntoEditor: { enabled: false },
              copyWithSyntaxHighlighting: false,
              quickSuggestions: true,
              padding: { top: 12 },
            }}
          />
        </div>

        {/* Console */}
        <div className="h-48 shrink-0 border-t border-slate-800 bg-slate-950 text-slate-200">
          <div className="flex border-b border-slate-800 px-2 pt-1.5 text-xs">
            {(['tests', 'custom'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'cursor-pointer rounded-t-lg px-4 py-1.5 font-semibold uppercase tracking-wider transition-all duration-200',
                  tab === t ? 'border-b-2 border-emerald-400 bg-slate-900/80 text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {t === 'tests' ? 'Test results' : 'Custom input'}
              </button>
            ))}
          </div>
          <div key={tab} className="animate-tab-enter h-[calc(100%-35px)] overflow-auto p-3 font-mono text-xs">
            {tab === 'custom' && (
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="stdin for 'Run custom'…"
                className="mb-3 h-16 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100 outline-none focus:border-emerald-500"
              />
            )}
            {running && <p className="animate-pulse text-slate-400">Running in sandbox…</p>}
            {runError && <p className="text-red-400">{runError}</p>}
            {!running && !runError && !result && <p className="italic text-slate-500">Run your code to see output here.</p>}

            {result?.mode === 'tests' && (
              <div className="animate-tab-enter space-y-2">
                <p className={cn('font-sans text-sm font-semibold', result.passed === result.total ? 'text-emerald-400' : 'text-amber-400')}>
                  {result.passed}/{result.total} public tests passed
                </p>
                {result.results.map((r, i) => (
                  <details key={r.testCaseId} className="rounded-lg border border-slate-800 bg-slate-900 p-2" open={!r.passed}>
                    <summary className="flex cursor-pointer items-center gap-2">
                      {r.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                      Test {i + 1} — {r.status.replace(/_/g, ' ')}
                      {r.timeSec != null && <span className="text-slate-500">· {r.timeSec}s</span>}
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Out label="Expected" text={r.expectedOutput} />
                      <Out label="Your output" text={r.stdout} />
                    </div>
                    {(r.compileOutput || r.stderr) && <Out label="Errors" text={r.compileOutput || r.stderr} danger />}
                  </details>
                ))}
              </div>
            )}

            {result?.mode === 'custom' && (
              <div className="animate-tab-enter space-y-2">
                <p className="font-sans text-sm text-slate-400">Status: {result.result.status}</p>
                <Out label="stdout" text={result.result.stdout} />
                {(result.result.compileOutput || result.result.stderr) && <Out label="Errors" text={result.result.compileOutput || result.result.stderr} danger />}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Previous / Next footer attached to the bottom of the answer/editor panel */}
        <AnswerFooterNav className="mt-0 shrink-0 border-t border-slate-200/80 bg-white px-4 py-3" />
      </section>
    </div>
  );
}

function Out({ label, text, danger }: { label: string; text: string; danger?: boolean }) {
  return (
    <div>
      <p className="mb-1 font-sans text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <pre className={cn('whitespace-pre-wrap rounded-md bg-slate-950 p-2', danger ? 'text-red-300' : 'text-slate-200')}>{text || '(empty)'}</pre>
    </div>
  );
}
