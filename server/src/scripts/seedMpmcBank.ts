/**
 * Seeds a complete 20-question Microprocessor & Microcontroller (MPMC) Question Bank:
 *   - 10 Multiple Choice Questions (MCQs)
 *   - 5 Numerical Questions
 *   - 5 Embedded C Coding Questions (with C starter code + public & hidden test cases)
 * Plus a pre-configured draft exam "EC301: Microprocessors & Microcontrollers".
 *
 * Usage:
 *   npx tsx src/scripts/seedMpmcBank.ts [examinerEmail]
 */
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, answerKeyRef, collections, db } from '../config/firebase.js';
import { env } from '../config/env.js';
import type { AnswerKeyDoc, ExamDoc, QuestionDoc } from '../types/schema.js';

async function resolveExaminerUid(email: string): Promise<string> {
  const userSnap = await collections.users.where('email', '==', email).limit(1).get();
  if (!userSnap.empty) {
    return userSnap.docs[0]!.id;
  }
  try {
    const authUser = await adminAuth.getUserByEmail(email);
    await collections.users.doc(authUser.uid).set(
      {
        email,
        displayName: authUser.displayName ?? email.split('@')[0]!,
        photoURL: authUser.photoURL ?? null,
        role: 'examiner',
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
      },
      { merge: true },
    );
    await adminAuth.setCustomUserClaims(authUser.uid, { role: 'examiner' });
    return authUser.uid;
  } catch {
    // Create placeholder
    const created = await adminAuth.createUser({
      email,
      emailVerified: true,
      displayName: 'Examiner',
    });
    await adminAuth.setCustomUserClaims(created.uid, { role: 'examiner' });
    await collections.users.doc(created.uid).set({
      email,
      displayName: 'Examiner',
      photoURL: null,
      role: 'examiner',
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now(),
    });
    return created.uid;
  }
}

async function main() {
  const examinersSnap = await collections.users.where('role', '==', 'examiner').limit(1).get();
  let defaultEmail = env.EXAMINER_EMAILS.split(',')[0]?.trim().toLowerCase();
  if (!defaultEmail && !examinersSnap.empty) {
    defaultEmail = examinersSnap.docs[0]!.data().email;
  }
  if (!defaultEmail) {
    defaultEmail = 'darshansamuelds@gmail.com';
  }

  const examinerEmail = (process.argv[2]?.trim().toLowerCase()) || defaultEmail;
  const examinerUid = await resolveExaminerUid(examinerEmail);
  const now = Timestamp.now();
  const bankId = 'exam_mpmc_course';

  const meta = (difficulty: 'easy' | 'medium' | 'hard', tags: string[]) => ({
    bankId,
    difficulty,
    tags,
    createdBy: examinerUid,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const questions: { id: string; doc: QuestionDoc; key: AnswerKeyDoc }[] = [
    /* ═══════════════════════════ 10 MCQs ═══════════════════════════ */
    {
      id: 'mpmc_mcq_01_8086_queue',
      doc: {
        ...meta('easy', ['8086', 'architecture', 'pipelining']),
        type: 'mcq',
        title: '01. 8086 Instruction Queue and Pipelining',
        prompt:
          'In the Intel 8086 microprocessor architecture, what is the primary purpose of the 6-byte instruction queue maintained by the Bus Interface Unit (BIU)?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'To implement a two-stage fetch-execute pipeline by prefetching instructions from memory while the Execution Unit (EU) executes the current instruction.',
          },
          {
            id: 'o2',
            text: 'To store ALU calculation flags temporarily before they are written to the flag register.',
          },
          {
            id: 'o3',
            text: 'To buffer memory write cycles during wait-state generation.',
          },
          {
            id: 'o4',
            text: 'To hold vector addresses during hardware maskable interrupt servicing.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_02_8051_ram_sfr',
      doc: {
        ...meta('medium', ['8051', 'memory-organization', 'addressing-modes']),
        type: 'mcq',
        title: '02. 8051 Internal RAM vs Special Function Register (SFR) Addressing',
        prompt:
          'In an 8052 microcontroller (with 256 bytes of internal RAM), the address range 80H to FFH is physically shared between Special Function Registers (SFRs) and the upper 128 bytes of RAM. How does the CPU distinguish between accessing an SFR and accessing the upper 128 bytes of internal data RAM?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'SFRs can only be accessed using direct addressing, whereas upper 128-byte RAM can only be accessed using indirect addressing (@R0 or @R1).',
          },
          {
            id: 'o2',
            text: 'SFRs are accessed when the EA pin is pulled low, while internal RAM is accessed when EA is pulled high.',
          },
          {
            id: 'o3',
            text: 'SFRs require 16-bit DPTR indexed addressing, while upper RAM uses 8-bit absolute addressing.',
          },
          {
            id: 'o4',
            text: 'SFRs can only be read with the MOVC instruction, while upper RAM is accessed using MOVX.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_03_8085_trap',
      doc: {
        ...meta('easy', ['8085', 'interrupts', 'hardware-vectors']),
        type: 'mcq',
        title: '03. 8085 Non-Maskable Interrupt (TRAP) Characteristics',
        prompt:
          'In the Intel 8085 microprocessor, what is the restart vector address and trigger sensitivity of the highest priority interrupt, TRAP (RST 4.5)?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'Restart vector 0024H; triggered by both a rising edge and sustained high level (edge-and-level sensitive).',
          },
          {
            id: 'o2',
            text: 'Restart vector 003CH; triggered strictly by a falling edge.',
          },
          {
            id: 'o3',
            text: 'Restart vector 002CH; triggered strictly by an active-low level.',
          },
          {
            id: 'o4',
            text: 'Restart vector 0034H; triggered strictly by software instruction RST 4.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_04_8086_segmentation',
      doc: {
        ...meta('medium', ['8086', 'memory-segmentation', 'addressing']),
        type: 'mcq',
        title: '04. 8086 Real Mode Memory Segmentation Boundary',
        prompt:
          'In 8086 Real Mode, segment registers are shifted left by 4 bits before adding the 16-bit offset to produce a 20-bit physical address. Because of this, what is the minimum alignment distance (in bytes) between the starting boundary of two consecutive memory segments?',
        points: 2,
        options: [
          { id: 'o1', text: '16 bytes (1 paragraph)' },
          { id: 'o2', text: '64 kilobytes' },
          { id: 'o3', text: '256 bytes' },
          { id: 'o4', text: '1 megabyte' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_05_8051_timer_mode2',
      doc: {
        ...meta('easy', ['8051', 'timers', 'baud-rate']),
        type: 'mcq',
        title: '05. 8051 Timer Auto-Reload Mode',
        prompt:
          'Which operating mode of 8051 Timer 0/1 operates as an 8-bit auto-reload timer where the value stored in register THx is automatically copied into register TLx upon timer overflow?',
        points: 2,
        options: [
          { id: 'o1', text: 'Mode 2 (8-bit auto-reload mode)' },
          { id: 'o2', text: 'Mode 0 (13-bit timer mode)' },
          { id: 'o3', text: 'Mode 1 (16-bit timer mode)' },
          { id: 'o4', text: 'Mode 3 (Split timer mode)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_06_memory_mapped_io',
      doc: {
        ...meta('medium', ['interfacing', 'memory-mapped-io', 'bus-cycles']),
        type: 'mcq',
        title: '06. Memory-Mapped I/O vs Isolated I/O',
        prompt:
          'What is a primary operational distinction between Memory-Mapped I/O and I/O-Mapped (Isolated) I/O in microprocessor interfacing?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'Memory-Mapped I/O allows any memory reference instruction (MOV, ADD, CMP) to operate directly on I/O ports, but consumes part of the memory address space.',
          },
          {
            id: 'o2',
            text: 'Memory-Mapped I/O requires dedicated instructions such as IN and OUT, whereas Isolated I/O uses MOV instructions.',
          },
          {
            id: 'o3',
            text: 'Memory-Mapped I/O uses a separate 8-bit address space independent of the memory address space.',
          },
          {
            id: 'o4',
            text: 'Memory-Mapped I/O generates dedicated /IOR and /IOW bus control strobes instead of /MEMR and /MEMW.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_07_8086_max_mode',
      doc: {
        ...meta('medium', ['8086', 'bus-controller', 'maximum-mode']),
        type: 'mcq',
        title: '07. 8086 Maximum Mode Bus Controller Support',
        prompt:
          'When the Intel 8086 MN/MX pin is tied to GND (Maximum Mode for multiprocessor configurations), which external support chip is required to decode status lines S0, S1, S2 and generate memory/IO control bus strobes?',
        points: 2,
        options: [
          { id: 'o1', text: 'Intel 8288 Bus Controller' },
          { id: 'o2', text: 'Intel 8284 Clock Generator' },
          { id: 'o3', text: 'Intel 8282 Octal Latch' },
          { id: 'o4', text: 'Intel 8286 Octal Transceiver' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_08_8051_uart_flags',
      doc: {
        ...meta('easy', ['8051', 'serial-uart', 'interrupts']),
        type: 'mcq',
        title: '08. 8051 UART Transmission and TI Flag Behavior',
        prompt:
          'In the 8051 microcontroller serial communication interface (SCON register), when is the Transmit Interrupt (TI) flag set, and how must it be cleared?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'Set by hardware when the stop bit has finished transmitting; must be cleared by software (CLR TI).',
          },
          {
            id: 'o2',
            text: 'Set by software to initiate serial transmission; cleared automatically by hardware when SBUF is empty.',
          },
          {
            id: 'o3',
            text: 'Set by hardware when the start bit is transmitted; cleared automatically upon branching to the ISR.',
          },
          {
            id: 'o4',
            text: 'Set by hardware whenever SBUF receives a byte from the RXD pin; cleared by reading SBUF.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_09_8085_ana_flags',
      doc: {
        ...meta('hard', ['8085', 'flags', 'alu-instructions']),
        type: 'mcq',
        title: '09. 8085 Flag Register Behavior on Logical AND (ANA)',
        prompt:
          'In the Intel 8085 microprocessor, after executing an "ANA B" (Logical AND Accumulator with Register B) instruction, what are the definite states of the Carry Flag (CY) and Auxiliary Carry Flag (AC)?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'Carry Flag (CY) is always reset (0), and Auxiliary Carry Flag (AC) is always set (1).',
          },
          {
            id: 'o2',
            text: 'Both Carry Flag (CY) and Auxiliary Carry Flag (AC) are always reset (0).',
          },
          {
            id: 'o3',
            text: 'Carry Flag (CY) is always set (1), and Auxiliary Carry Flag (AC) is always reset (0).',
          },
          {
            id: 'o4',
            text: 'Both flags retain whatever state they had prior to the execution of ANA B.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'mpmc_mcq_10_harvard_vs_von_neumann',
      doc: {
        ...meta('easy', ['microcontroller', 'harvard-architecture', 'embedded-systems']),
        type: 'mcq',
        title: '10. Harvard vs Von Neumann Architecture in Microcontrollers',
        prompt:
          'Which architectural characteristic distinguishes a Harvard-architecture microcontroller (such as the 8051 or AVR ATmega) from a traditional Von Neumann microprocessor (such as the 8085)?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'Physically separated memory spaces and buses for Program Memory (Flash/ROM) and Data Memory (SRAM), allowing concurrent instruction and data access.',
          },
          {
            id: 'o2',
            text: 'A unified single address space where instructions and data must compete sequentially for the same bus.',
          },
          {
            id: 'o3',
            text: 'Complete absence of internal timers and integrated peripheral I/O ports.',
          },
          {
            id: 'o4',
            text: 'The requirement that instructions must execute in microcoded variable-length clock cycles.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },

    /* ═══════════════════════════ 5 Numerical ═══════════════════════════ */
    {
      id: 'mpmc_num_01_8086_physical_address',
      doc: {
        ...meta('easy', ['8086', 'physical-address', 'segmentation']),
        type: 'numerical',
        title: '11. 8086 Physical Memory Address Calculation',
        prompt:
          'An Intel 8086 microprocessor is running in Real Mode. The Code Segment register contains the hexadecimal value CS = 0x348A, and the Instruction Pointer contains IP = 0x4214.\n\n' +
          'Calculate the resulting 20-bit physical address generated on the address bus.\n\n' +
          'Formula: Physical Address = (CS << 4) + IP = (CS * 16) + IP\n\n' +
          'Express your answer as a base-10 (decimal) integer.',
        points: 4,
        unit: null,
      },
      key: {
        type: 'numerical',
        value: 232116,
        tolerance: { mode: 'absolute', amount: 0 },
      },
    },
    {
      id: 'mpmc_num_02_8051_timer_cycles',
      doc: {
        ...meta('medium', ['8051', 'timers', 'machine-cycles']),
        type: 'numerical',
        title: '12. 8051 Timer 0 Machine Cycles Until Overflow',
        prompt:
          'An 8051 microcontroller is running with a 12 MHz crystal oscillator (where 1 machine cycle = 12 clock periods = 1.0 µs).\n\n' +
          'Timer 0 is configured in Mode 1 (16-bit timer mode). The timer registers are preloaded with:\n' +
          '• TH0 = 0xDC\n' +
          '• TL0 = 0x00\n' +
          '(Combined 16-bit preload value = 0xDC00 = 56,320 in decimal)\n\n' +
          'How many machine cycles will elapse before Timer 0 overflows from 0xFFFF to 0x0000 and sets the Timer 0 Overflow Flag (TF0)?',
        points: 4,
        unit: 'cycles',
      },
      key: {
        type: 'numerical',
        value: 9216,
        tolerance: { mode: 'absolute', amount: 0 },
      },
    },
    {
      id: 'mpmc_num_03_8051_baud_rate',
      doc: {
        ...meta('medium', ['8051', 'uart', 'baud-rate', 'serial']),
        type: 'numerical',
        title: '13. 8051 UART Baud Rate in Mode 2 Auto-Reload',
        prompt:
          'An 8051 microcontroller operates with a crystal oscillator frequency of f_osc = 11.0592 MHz. Timer 1 is configured in Mode 2 (8-bit auto-reload) to generate the UART baud rate in 8-bit UART Mode 1.\n\n' +
          'Given:\n' +
          '• SMOD bit in PCON register = 0\n' +
          '• TH1 reload register value = 0xFD (decimal 253, meaning overflow every 256 - 253 = 3 machine cycles)\n' +
          '• Baud Rate Formula: BaudRate = (2^SMOD / 32) * (f_osc / (12 * (256 - TH1)))\n\n' +
          'Calculate the resulting serial transmission baud rate in bits per second (bps).',
        points: 4,
        unit: 'bps',
      },
      key: {
        type: 'numerical',
        value: 9600,
        tolerance: { mode: 'absolute', amount: 0 },
      },
    },
    {
      id: 'mpmc_num_04_8085_execution_time',
      doc: {
        ...meta('medium', ['8085', 't-states', 'clock-frequency', 'timing']),
        type: 'numerical',
        title: '14. 8085 Instruction Execution Time in Microseconds',
        prompt:
          'An Intel 8085 microprocessor is clocked at an internal operating frequency of 2.0 MHz (where 1 T-state = 0.5 µs).\n\n' +
          'A memory read instruction "LDA 2050H" requires 4 machine cycles totaling 13 T-states:\n' +
          '• Opcode Fetch: 4 T-states\n' +
          '• Memory Read (Low Address byte): 3 T-states\n' +
          '• Memory Read (High Address byte): 3 T-states\n' +
          '• Memory Read (Data byte from 2050H): 3 T-states\n\n' +
          'What is the total execution time of this single LDA instruction in microseconds (µs)?',
        points: 4,
        unit: 'us',
      },
      key: {
        type: 'numerical',
        value: 6.5,
        tolerance: { mode: 'absolute', amount: 0.05 },
      },
    },
    {
      id: 'mpmc_num_05_memory_address_lines',
      doc: {
        ...meta('easy', ['memory-interfacing', 'address-bus', 'decoding']),
        type: 'numerical',
        title: '15. Address Bus Width for Byte-Addressable 128 KB SRAM',
        prompt:
          'A microcontroller design engineer is interfacing a 128 Kilobyte (128 KB = 128 × 1024 bytes) static RAM (SRAM) memory chip to a processor bus.\n\n' +
          'Assuming the memory chip is byte-addressable (1 byte per addressable memory location), how many address lines (A0 to A_n-1) are required to uniquely address every memory cell in this 128 KB SRAM chip?',
        points: 4,
        unit: 'lines',
      },
      key: {
        type: 'numerical',
        value: 17,
        tolerance: { mode: 'absolute', amount: 0 },
      },
    },

    /* ═══════════════════════════ 5 Coding in C ═══════════════════════════ */
    {
      id: 'mpmc_code_01_gpio_bit_ops',
      doc: {
        ...meta('easy', ['embedded-c', 'gpio', 'bitwise-operations']),
        type: 'coding',
        title: '16. Embedded C: Microcontroller GPIO Pin Bit Manipulation',
        prompt:
          'In embedded microcontroller firmware, GPIO port registers are updated using bitwise masks to manipulate specific pins without disrupting other active pins.\n\n' +
          'Write a C program that reads an initial 8-bit port value (0 to 255), an operation string ("SET", "CLEAR", or "TOGGLE"), and a target pin index k (0 to 7).\n\n' +
          'Operation Definitions:\n' +
          '• SET k: Set bit k to 1 (e.g. port |= (1 << k))\n' +
          '• CLEAR k: Clear bit k to 0 (e.g. port &= ~(1 << k))\n' +
          '• TOGGLE k: Invert bit k (e.g. port ^= (1 << k))\n\n' +
          'Input Format:\n' +
          'A single line containing: <initial_port_value> <operation> <pin_index>\n' +
          'Example: 15 SET 4\n\n' +
          'Output Format:\n' +
          'Print the resulting 8-bit port register value formatted in hexadecimal as "0xXX" (uppercase 2 digits, e.g. 0x1F).',
        points: 10,
        starterCode: {
          c:
            '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    int port, pin;\n    char op[16];\n    if (scanf("%d %15s %d", &port, op, &pin) != 3) return 0;\n    \n    // TODO: Perform bitwise operation on port based on op and pin\n    \n    printf("0x%02X\\n", port & 0xFF);\n    return 0;\n}\n',
          cpp:
            '#include <iostream>\n#include <string>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    int port, pin;\n    string op;\n    if (!(cin >> port >> op >> pin)) return 0;\n    // Perform operation\n    cout << "0x" << uppercase << setfill(\'0\') << setw(2) << hex << (port & 0xFF) << "\\n";\n    return 0;\n}\n',
          python:
            'import sys\n\ndef main():\n    parts = sys.stdin.read().split()\n    if len(parts) < 3:\n        return\n    port, op, pin = int(parts[0]), parts[1], int(parts[2])\n    # Perform operation\n    print(f"0x{port & 0xFF:02X}")\n\nif __name__ == "__main__":\n    main()\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '15 SET 4\n',
            expectedOutput: '0x1F\n',
            weight: 1,
            explanation: '15 is 0x0F (00001111). Setting bit 4 gives 00011111 = 0x1F.',
          },
          {
            id: 'p2',
            input: '255 CLEAR 3\n',
            expectedOutput: '0xF7\n',
            weight: 1,
            explanation: '255 is 0xFF. Clearing bit 3 (weight 8) leaves 247 = 0xF7.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 65_536 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '0 TOGGLE 0\n', expectedOutput: '0x01\n', weight: 2 },
          { id: 'h2', input: '170 TOGGLE 7\n', expectedOutput: '0x2A\n', weight: 2 },
          { id: 'h3', input: '64 CLEAR 6\n', expectedOutput: '0x00\n', weight: 2 },
          { id: 'h4', input: '128 SET 0\n', expectedOutput: '0x81\n', weight: 2 },
        ],
      },
    },
    {
      id: 'mpmc_code_02_uart_parity',
      doc: {
        ...meta('easy', ['embedded-c', 'uart', 'parity-bit', 'serial']),
        type: 'coding',
        title: '17. Embedded C: UART 8-Bit Frame Parity Bit Generator',
        prompt:
          'Microcontroller UART hardware transmitters can be configured to generate an Even or Odd parity bit to detect transmission errors over RS-232/RS-485 serial buses.\n\n' +
          'Write a C program that takes an 8-bit data byte (0 to 255) and a parity configuration character ("E" for Even Parity, "O" for Odd Parity).\n\n' +
          'Parity Rules:\n' +
          '• Even Parity ("E"): The parity bit is 1 if the number of 1-bits in the data byte is odd (so that data + parity has an even number of 1s). Otherwise 0.\n' +
          '• Odd Parity ("O"): The parity bit is 1 if the number of 1-bits in the data byte is even (so that data + parity has an odd number of 1s). Otherwise 0.\n\n' +
          'Input Format:\n' +
          'A single line containing an integer data byte D (0 <= D <= 255) and a character mode ("E" or "O").\n' +
          'Example: 65 E\n\n' +
          'Output Format:\n' +
          'Print the generated parity bit (0 or 1).',
        points: 10,
        starterCode: {
          c:
            '#include <stdio.h>\n\nint main(void) {\n    int d;\n    char mode;\n    if (scanf("%d %c", &d, &mode) != 2) return 0;\n    \n    // TODO: Count 1-bits in d and compute parity bit for \'E\' or \'O\'\n    \n    return 0;\n}\n',
          cpp:
            '#include <iostream>\nusing namespace std;\n\nint main() {\n    int d;\n    char mode;\n    if (!(cin >> d >> mode)) return 0;\n    // Compute parity bit\n    return 0;\n}\n',
          python:
            'import sys\n\ndef main():\n    parts = sys.stdin.read().split()\n    if len(parts) < 2:\n        return\n    d, mode = int(parts[0]), parts[1]\n    # Compute parity\n\nif __name__ == "__main__":\n    main()\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '65 E\n',
            expectedOutput: '0\n',
            weight: 1,
            explanation: '65 = 0b01000001 has two 1s (already even), so Even Parity bit is 0.',
          },
          {
            id: 'p2',
            input: '65 O\n',
            expectedOutput: '1\n',
            weight: 1,
            explanation: '65 has two 1s (even), so Odd Parity requires a parity bit of 1.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 65_536 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '0 E\n', expectedOutput: '0\n', weight: 2 },
          { id: 'h2', input: '0 O\n', expectedOutput: '1\n', weight: 2 },
          { id: 'h3', input: '255 E\n', expectedOutput: '0\n', weight: 2 },
          { id: 'h4', input: '7 E\n', expectedOutput: '1\n', weight: 2 },
        ],
      },
    },
    {
      id: 'mpmc_code_03_seven_segment_decoder',
      doc: {
        ...meta('medium', ['embedded-c', 'seven-segment', 'interfacing', 'lookup-table']),
        type: 'coding',
        title: '18. Embedded C: Seven-Segment Display Decoder Table',
        prompt:
          'In microcontroller port interfacing, a 7-segment display displays decimal digits (0 to 9) using segment lines a, b, c, d, e, f, g mapped to port bits 0 through 6.\n\n' +
          'For a common-cathode display, writing 1 illuminates that segment. Bit 7 is the decimal point (dp) and is set to 0.\n\n' +
          'Standard Common-Cathode Segment Table:\n' +
          '• Digit 0 -> segments a,b,c,d,e,f = 0x3F\n' +
          '• Digit 1 -> segments b,c = 0x06\n' +
          '• Digit 2 -> segments a,b,d,e,g = 0x5B\n' +
          '• Digit 3 -> segments a,b,c,d,g = 0x4F\n' +
          '• Digit 4 -> segments b,c,f,g = 0x66\n' +
          '• Digit 5 -> segments a,c,d,f,g = 0x6D\n' +
          '• Digit 6 -> segments a,c,d,e,f,g = 0x7D\n' +
          '• Digit 7 -> segments a,b,c = 0x07\n' +
          '• Digit 8 -> segments a,b,c,d,e,f,g = 0x7F\n' +
          '• Digit 9 -> segments a,b,c,d,f,g = 0x6F\n\n' +
          'Write a C program that reads an integer digit N (0 <= N <= 9) and outputs its common-cathode hex code in the format "0xXX" (uppercase 2 digits).',
        points: 10,
        starterCode: {
          c:
            '#include <stdio.h>\n\nint main(void) {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    \n    // TODO: Look up segment byte for digit n and print formatted as "0xXX"\n    \n    return 0;\n}\n',
          cpp:
            '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    // Lookup and output hex code\n    return 0;\n}\n',
          python:
            'import sys\n\ndef main():\n    val = sys.stdin.read().strip()\n    if not val:\n        return\n    n = int(val)\n    # Lookup table\n\nif __name__ == "__main__":\n    main()\n',
        },
        publicTestCases: [
          { id: 'p1', input: '0\n', expectedOutput: '0x3F\n', weight: 1, explanation: 'Digit 0 lights up segments a,b,c,d,e,f = 0x3F.' },
          { id: 'p2', input: '8\n', expectedOutput: '0x7F\n', weight: 1, explanation: 'Digit 8 lights up all 7 segments = 0x7F.' },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 65_536 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '1\n', expectedOutput: '0x06\n', weight: 2 },
          { id: 'h2', input: '4\n', expectedOutput: '0x66\n', weight: 2 },
          { id: 'h3', input: '7\n', expectedOutput: '0x07\n', weight: 2 },
          { id: 'h4', input: '9\n', expectedOutput: '0x6F\n', weight: 2 },
        ],
      },
    },
    {
      id: 'mpmc_code_04_circular_buffer',
      doc: {
        ...meta('hard', ['embedded-c', 'circular-buffer', 'fifo', 'uart-isr']),
        type: 'coding',
        title: '19. Embedded C: Circular FIFO Buffer for UART RX ISR',
        prompt:
          'In microcontroller firmware, serial data arriving via a UART interrupt service routine (ISR) is enqueued into a fixed-capacity circular ring buffer (FIFO) so that the background loop can dequeue bytes asynchronously.\n\n' +
          'Write a C program implementing a circular buffer of capacity K (1 <= K <= 64).\n\n' +
          'Commands to Support:\n' +
          '• PUSH <val>: Write byte <val> (0 to 255) to the tail of the buffer. If buffer is full (count == K), print "OVERFLOW" and do not write.\n' +
          '• POP: Read and remove the oldest byte from the head and print its value. If buffer is empty (count == 0), print "EMPTY".\n' +
          '• COUNT: Print the current number of elements stored in the buffer.\n\n' +
          'Input Format:\n' +
          '• First line: capacity K and number of commands M\n' +
          '• Next M lines: each contains an operation (PUSH <val>, POP, or COUNT)\n\n' +
          'Output Format:\n' +
          'Print the result of each POP, COUNT, or error event on a separate line.',
        points: 12,
        starterCode: {
          c:
            '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    int K, M;\n    if (scanf("%d %d", &K, &M) != 2) return 0;\n    \n    int buf[128];\n    int head = 0, tail = 0, count = 0;\n    \n    for (int i = 0; i < M; i++) {\n        char cmd[16];\n        if (scanf("%15s", cmd) != 1) break;\n        // TODO: Implement PUSH, POP, COUNT\n    }\n    return 0;\n}\n',
          cpp:
            '#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint main() {\n    int K, M;\n    if (!(cin >> K >> M)) return 0;\n    // Process commands\n    return 0;\n}\n',
          python:
            'import sys\n\ndef main():\n    lines = sys.stdin.read().splitlines()\n    if not lines:\n        return\n    parts = lines[0].split()\n    K, M = int(parts[0]), int(parts[1])\n    # Process commands\n\nif __name__ == "__main__":\n    main()\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '3 6\nPUSH 10\nPUSH 20\nCOUNT\nPOP\nPOP\nPOP\n',
            expectedOutput: '2\n10\n20\nEMPTY\n',
            weight: 2,
            explanation: 'Pushes 10 and 20; count is 2; pops 10 then 20; third pop finds buffer empty.',
          },
          {
            id: 'p2',
            input: '2 4\nPUSH 5\nPUSH 6\nPUSH 7\nCOUNT\n',
            expectedOutput: 'OVERFLOW\n2\n',
            weight: 2,
            explanation: 'Buffer capacity is 2; third push triggers OVERFLOW.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 65_536 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          {
            id: 'h1',
            input: '4 7\nPOP\nCOUNT\nPUSH 100\nPUSH 200\nPOP\nPUSH 50\nPOP\n',
            expectedOutput: 'EMPTY\n0\n100\n200\n',
            weight: 2,
          },
          {
            id: 'h2',
            input: '1 4\nPUSH 42\nPUSH 99\nPOP\nPOP\n',
            expectedOutput: 'OVERFLOW\n42\nEMPTY\n',
            weight: 2,
          },
        ],
      },
    },
    {
      id: 'mpmc_code_05_crc8_checksum',
      doc: {
        ...meta('hard', ['embedded-c', 'crc-8', 'checksum', 'sensor-protocols']),
        type: 'coding',
        title: '20. Embedded C: CRC-8 Checksum Generator for Sensor Bus',
        prompt:
          'Microcontrollers communicating with external I2C/SPI sensors (e.g. Dallas 1-Wire, Sensirion SHT) use an 8-bit Cyclic Redundancy Check (CRC-8) to verify payload integrity.\n\n' +
          'CRC-8 Specification:\n' +
          '• Polynomial: 0x07 (represented by x^8 + x^2 + x + 1)\n' +
          '• Initial CRC value: 0x00\n' +
          '• Bit processing: MSB first (bit 7 down to bit 0)\n' +
          '• Algorithm:\n' +
          '  For each byte in payload:\n' +
          '    crc = crc ^ byte\n' +
          '    Repeat 8 times:\n' +
          '      If (crc & 0x80) != 0: crc = (crc << 1) ^ 0x07\n' +
          '      Else: crc = (crc << 1)\n' +
          '      Keep crc in 8 bits: crc = crc & 0xFF\n\n' +
          'Input Format:\n' +
          '• First line: An integer N (1 <= N <= 100), the number of bytes\n' +
          '• Second line: N space-separated integers (each 0 to 255)\n\n' +
          'Output Format:\n' +
          'Print the resulting 8-bit CRC formatted as "0xXX" (uppercase 2-digit hex).',
        points: 12,
        starterCode: {
          c:
            '#include <stdio.h>\n\nint main(void) {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    \n    unsigned char crc = 0x00;\n    for (int i = 0; i < n; i++) {\n        int b;\n        scanf("%d", &b);\n        // TODO: XOR byte into crc and process 8 bits with polynomial 0x07\n    }\n    \n    printf("0x%02X\\n", crc);\n    return 0;\n}\n',
          cpp:
            '#include <iostream>\n#include <vector>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    // Compute CRC-8\n    return 0;\n}\n',
          python:
            'import sys\n\ndef main():\n    data = list(map(int, sys.stdin.read().split()))\n    if not data:\n        return\n    n = data[0]\n    bytes_list = data[1:1+n]\n    # Compute CRC-8\n\nif __name__ == "__main__":\n    main()\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '1\n1\n',
            expectedOutput: '0x07\n',
            weight: 2,
            explanation: '1 byte of 0x01 with polynomial 0x07 produces CRC 0x07.',
          },
          {
            id: 'p2',
            input: '3\n1 2 3\n',
            expectedOutput: '0x48\n',
            weight: 2,
            explanation: 'Bytes [0x01, 0x02, 0x03] produce CRC-8 of 0x48.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 65_536 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '2\n190 239\n', expectedOutput: '0x1A\n', weight: 2 },
          { id: 'h2', input: '3\n10 20 30\n', expectedOutput: '0xDE\n', weight: 2 },
          { id: 'h3', input: '1\n255\n', expectedOutput: '0xF3\n', weight: 2 },
        ],
      },
    },
  ];

  /* ═══════════════════════════ Draft Exam ═══════════════════════════ */
  const examRef = collections.exams.doc('exam_mpmc_course');
  const mcqIds = questions.filter((q) => q.doc.type === 'mcq').map((q) => q.id);
  const numIds = questions.filter((q) => q.doc.type === 'numerical').map((q) => q.id);
  const codeIds = questions.filter((q) => q.doc.type === 'coding').map((q) => q.id);

  const exam: ExamDoc = {
    title: 'EC301: Microprocessors & Microcontrollers',
    description:
      'Comprehensive assessment on Intel 8085, 8086 architectures, 8051 microcontroller hardware, memory interfacing, peripheral timers, and embedded C firmware.',
    instructions:
      '# EC301: Microprocessors & Microcontrollers Examination\n\n' +
      '### Instructions for Candidates\n' +
      '1. **Section A (MCQ)**: 10 conceptual multiple choice questions. (2 points each)\n' +
      '2. **Section B (Numerical)**: 5 numerical and address/timing calculation problems. (4 points each)\n' +
      '3. **Section C (Coding in C)**: 5 embedded firmware programming tasks evaluated against public and hidden test vectors. (10–12 points each)\n' +
      '4. Total duration is **90 minutes**.\n' +
      '5. Do not switch tabs or exit fullscreen mode. Keystroke telemetry and proctoring are active.',
    createdBy: examinerUid,
    status: 'draft',
    durationMinutes: 90,
    window: {
      opensAt: now,
      closesAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 3600_000),
    },
    sections: [
      {
        id: 'sec_mpmc_mcq',
        title: 'Section A — Architecture & Hardware MCQs',
        poolQuestionIds: mcqIds,
        drawCount: 10,
        shuffleQuestions: true,
        pointsPerQuestion: null,
      },
      {
        id: 'sec_mpmc_num',
        title: 'Section B — Interfacing & Timing Calculations',
        poolQuestionIds: numIds,
        drawCount: 5,
        shuffleQuestions: true,
        pointsPerQuestion: null,
      },
      {
        id: 'sec_mpmc_code',
        title: 'Section C — Embedded C Programming',
        poolQuestionIds: codeIds,
        drawCount: 5,
        shuffleQuestions: false,
        pointsPerQuestion: null,
      },
    ],
    settings: {
      shuffleOptions: true,
      allowedLanguages: ['c', 'cpp', 'python'],
      maxWarnings: 3,
      requireFullscreen: true,
      requireWebcam: false,
      requireMicrophone: false,
      snapshotIntervalSec: 60,
      audioThresholdDb: -20,
      gracePeriodSec: 30,
      showResultsToCandidate: true,
    },
    totalPoints: questions.reduce((sum, q) => sum + q.doc.points, 0),
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  for (const q of questions) {
    batch.set(collections.questions.doc(q.id), q.doc);
    batch.set(answerKeyRef(q.id), q.key);
  }
  batch.set(examRef, exam);
  await batch.commit();

  console.log(
    `Successfully seeded 20 MPMC questions (10 MCQ, 5 Numerical, 5 Coding = ${exam.totalPoints} pts) + exam "${exam.title}" for ${examinerEmail} (uid: ${examinerUid}).`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
