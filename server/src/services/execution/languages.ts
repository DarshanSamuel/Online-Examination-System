import type { LanguageKey } from '../../types/schema.js';

export interface LanguageConfig {
  label: string;
  monaco: string;
  /** Judge0 CE language id — verify against GET /languages on your instance. */
  judge0Id: number;
  piston: { language: string; version: string; fileName: string };
}

export const LANGUAGES: Record<LanguageKey, LanguageConfig> = {
  python: {
    label: 'Python 3',
    monaco: 'python',
    judge0Id: 71,
    piston: { language: 'python', version: '3.10.0', fileName: 'main.py' },
  },
  javascript: {
    label: 'JavaScript (Node.js)',
    monaco: 'javascript',
    judge0Id: 63,
    piston: { language: 'javascript', version: '18.15.0', fileName: 'main.js' },
  },
  cpp: {
    label: 'C++ (GCC)',
    monaco: 'cpp',
    judge0Id: 54,
    piston: { language: 'c++', version: '10.2.0', fileName: 'main.cpp' },
  },
  java: {
    label: 'Java',
    monaco: 'java',
    judge0Id: 62,
    // Judge0 expects `public class Main`; Piston uses the file name below.
    piston: { language: 'java', version: '15.0.2', fileName: 'Main.java' },
  },
  c: {
    label: 'C (GCC)',
    monaco: 'c',
    judge0Id: 50,
    piston: { language: 'c', version: '10.2.0', fileName: 'main.c' },
  },
};
