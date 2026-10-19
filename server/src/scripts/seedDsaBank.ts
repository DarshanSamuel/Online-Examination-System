/**
 * Seeds a complete 20-question Data Structures & Algorithms (DSA) Question Bank:
 *   - 10 Multiple Choice Questions (MCQs)
 *   - 5 Numerical Questions
 *   - 5 Coding Questions (with starter code in Python, JS, C++, Java + public & hidden test cases)
 * Plus a pre-configured draft exam "CS201: Data Structures & Algorithms".
 *
 * Usage:
 *   npx tsx src/scripts/seedDsaBank.ts [examinerEmail]
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
    // Create the Firebase Auth user placeholder for this Google email so questions can be owned immediately
    const created = await adminAuth.createUser({
      email,
      emailVerified: true,
      displayName: 'Darshan Samuel',
    });
    await adminAuth.setCustomUserClaims(created.uid, { role: 'examiner' });
    await collections.users.doc(created.uid).set({
      email,
      displayName: 'Darshan Samuel',
      photoURL: null,
      role: 'examiner',
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now(),
    });
    return created.uid;
  }
}

async function main() {
  const defaultEmail = env.EXAMINER_EMAILS.split(',')[0]?.trim().toLowerCase() || 'darshansamuelds@gmail.com';
  const examinerEmail = (process.argv[2]?.trim().toLowerCase()) || defaultEmail;
  const examinerUid = await resolveExaminerUid(examinerEmail);
  const now = Timestamp.now();

  const meta = (difficulty: 'easy' | 'medium' | 'hard', tags: string[]) => ({
    bankId: 'dsa_course',
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
      id: 'dsa_mcq_01_dynamic_array',
      doc: {
        ...meta('easy', ['arrays', 'amortized-analysis', 'complexity']),
        type: 'mcq',
        title: '01. Dynamic Array Amortized Append Complexity',
        prompt:
          'When appending n elements sequentially to a dynamic array (such as C++ std::vector or Java ArrayList) that doubles its capacity whenever full, what is the amortized time complexity of a single append operation?',
        points: 2,
        options: [
          { id: 'o1', text: 'O(1)' },
          { id: 'o2', text: 'O(log n)' },
          { id: 'o3', text: 'O(n)' },
          { id: 'o4', text: 'O(n log n)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_02_hash_clustering',
      doc: {
        ...meta('easy', ['hashing', 'hash-tables']),
        type: 'mcq',
        title: '02. Hash Table Primary Clustering',
        prompt:
          'Which open-addressing collision resolution strategy is most susceptible to primary clustering, where long contiguous runs of occupied slots coalesce and degrade lookup performance?',
        points: 2,
        options: [
          { id: 'o1', text: 'Linear probing' },
          { id: 'o2', text: 'Quadratic probing' },
          { id: 'o3', text: 'Double hashing' },
          { id: 'o4', text: 'Separate chaining with balanced trees' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_03_bst_traversal',
      doc: {
        ...meta('easy', ['trees', 'bst', 'traversal']),
        type: 'mcq',
        title: '03. Binary Search Tree Sorted Traversal',
        prompt:
          'Given a valid Binary Search Tree (BST) containing n distinct keys, which tree traversal visits the keys in strictly increasing sorted order?',
        points: 2,
        options: [
          { id: 'o1', text: 'In-order traversal (Left, Root, Right)' },
          { id: 'o2', text: 'Pre-order traversal (Root, Left, Right)' },
          { id: 'o3', text: 'Post-order traversal (Left, Right, Root)' },
          { id: 'o4', text: 'Level-order (Breadth-First) traversal' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_04_avl_vs_red_black',
      doc: {
        ...meta('medium', ['trees', 'avl', 'red-black-tree']),
        type: 'mcq',
        title: '04. AVL Trees vs. Red-Black Trees Trade-off',
        prompt:
          'Which statement accurately compares strictly height-balanced AVL trees and Red-Black trees storing n keys?',
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'AVL trees enforce a stricter height bound (~1.44 log₂ n) yielding faster lookups, whereas Red-Black trees guarantee at most O(1) rotations per insertion or deletion.',
          },
          {
            id: 'o2',
            text: 'Red-Black trees always maintain a strictly smaller height than AVL trees for any sequence of insertions.',
          },
          {
            id: 'o3',
            text: 'AVL trees require O(1) rotations on deletion in the worst case, whereas Red-Black trees require Θ(log n) rotations.',
          },
          {
            id: 'o4',
            text: 'Both AVL and Red-Black trees have an worst-case lookup complexity of Θ(√n).',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_05_floyd_build_heap',
      doc: {
        ...meta('medium', ['heaps', 'priority-queue', 'complexity']),
        type: 'mcq',
        title: '05. Bottom-Up Binary Heap Construction (Heapify)',
        prompt:
          "Using Floyd's bottom-up buildHeap (sift-down) algorithm on an arbitrary unsorted array of n elements, what is the tightest worst-case time complexity to construct a valid binary min-heap?",
        points: 2,
        options: [
          { id: 'o1', text: 'O(n)' },
          { id: 'o2', text: 'O(n log n)' },
          { id: 'o3', text: 'O(log n)' },
          { id: 'o4', text: 'O(n²)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_06_dijkstra_negative_edges',
      doc: {
        ...meta('medium', ['graphs', 'shortest-path', 'dijkstra']),
        type: 'mcq',
        title: "06. Dijkstra's Algorithm with Negative Edge Weights",
        prompt:
          "Why can Dijkstra's single-source shortest path algorithm produce incorrect distances on a directed graph with negative-weight edges, even when no negative-weight cycles exist?",
        points: 2,
        options: [
          {
            id: 'o1',
            text: 'It greedily locks in the shortest distance to the extracted minimum vertex under the assumption that adding future edges can never decrease total path weight.',
          },
          {
            id: 'o2',
            text: 'Binary min-heaps cannot store or compare negative priority keys.',
          },
          {
            id: 'o3',
            text: 'Any negative-weight edge automatically creates a negative-weight cycle in a directed graph.',
          },
          {
            id: 'o4',
            text: 'Adjacency lists cannot represent negative edge weights without re-indexing vertices.',
          },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_07_topological_sort',
      doc: {
        ...meta('easy', ['graphs', 'dag', 'topological-sort']),
        type: 'mcq',
        title: '07. Existence of a Topological Ordering',
        prompt:
          'A directed graph G = (V, E) admits at least one valid topological ordering of its vertices if and only if:',
        points: 2,
        options: [
          { id: 'o1', text: 'G contains no directed cycles (it is a Directed Acyclic Graph).' },
          { id: 'o2', text: 'G is strongly connected.' },
          { id: 'o3', text: 'Every vertex in G has an in-degree of at most 1.' },
          { id: 'o4', text: 'G is bipartite and has an even number of vertices.' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_08_stable_sorting',
      doc: {
        ...meta('medium', ['sorting', 'algorithms']),
        type: 'mcq',
        title: '08. Sorting Stability & Worst-Case O(n log n)',
        prompt:
          'Among the standard comparison-based sorting algorithms below, which one is naturally stable (preserves the relative order of equal keys) AND guarantees O(n log n) time in the worst case?',
        points: 2,
        options: [
          { id: 'o1', text: 'Merge Sort' },
          { id: 'o2', text: 'Quick Sort (in-place Lomuto partition)' },
          { id: 'o3', text: 'Heap Sort' },
          { id: 'o4', text: 'Selection Sort' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_09_union_find',
      doc: {
        ...meta('hard', ['union-find', 'disjoint-set', 'amortized-analysis']),
        type: 'mcq',
        title: '09. Disjoint Set Union (Union-Find) Complexity',
        prompt:
          'In a Disjoint-Set (Union-Find) structure initialized with n singleton sets, combining both union by rank and path compression yields what amortized time complexity per operation?',
        points: 3,
        options: [
          { id: 'o1', text: 'O(α(n)), where α is the inverse Ackermann function' },
          { id: 'o2', text: 'Θ(log n)' },
          { id: 'o3', text: 'Θ(√n)' },
          { id: 'o4', text: 'Θ(n)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },
    {
      id: 'dsa_mcq_10_master_theorem',
      doc: {
        ...meta('hard', ['divide-and-conquer', 'recurrences', 'complexity']),
        type: 'mcq',
        title: '10. Master Theorem Recurrence Analysis',
        prompt:
          'Consider a divide-and-conquer algorithm whose running time satisfies T(n) = 4T(n / 2) + Θ(n²). By the Master Theorem, what is the tight asymptotic bound for T(n)?',
        points: 3,
        options: [
          { id: 'o1', text: 'Θ(n² log n)' },
          { id: 'o2', text: 'Θ(n²)' },
          { id: 'o3', text: 'Θ(n⁴)' },
          { id: 'o4', text: 'Θ(n log n)' },
        ],
      },
      key: { type: 'mcq', correctOptionId: 'o1' },
    },

    /* ═══════════════════════════ 5 NUMERICAL ═══════════════════════════ */
    {
      id: 'dsa_num_01_binary_tree_nodes',
      doc: {
        ...meta('easy', ['trees', 'binary-tree']),
        type: 'numerical',
        title: '11. Maximum Nodes in a Binary Tree of Height 6',
        prompt:
          'A binary tree has height h = 6, where a tree with a single root node has height 0 (so levels are numbered 0, 1, ..., 6). What is the maximum total number of nodes this binary tree can contain?',
        points: 3,
        unit: 'nodes',
      },
      key: { type: 'numerical', value: 127, tolerance: { mode: 'absolute', amount: 0 } },
    },
    {
      id: 'dsa_num_02_mst_excluded_edges',
      doc: {
        ...meta('easy', ['graphs', 'mst', 'kruskal']),
        type: 'numerical',
        title: '12. Excluded Edges in a Minimum Spanning Tree',
        prompt:
          "A connected undirected graph has V = 18 vertices and E = 25 edges with distinct positive weights. After running Kruskal's algorithm to form a Minimum Spanning Tree (MST), how many edges from the original graph are NOT included in the MST?",
        points: 3,
        unit: 'edges',
      },
      key: { type: 'numerical', value: 8, tolerance: { mode: 'absolute', amount: 0 } },
    },
    {
      id: 'dsa_num_03_heap_child_index',
      doc: {
        ...meta('medium', ['heaps', 'arrays']),
        type: 'numerical',
        title: '13. 0-Indexed Binary Heap Right Child Index',
        prompt:
          'A complete binary min-heap is stored in a 0-indexed array A[0..n-1] (where the root is at index 0). For the node stored at index i = 19, what is the array index of its right child?',
        points: 3,
        unit: 'index',
      },
      key: { type: 'numerical', value: 40, tolerance: { mode: 'absolute', amount: 0 } },
    },
    {
      id: 'dsa_num_04_double_hashing_probe',
      doc: {
        ...meta('medium', ['hashing', 'double-hashing']),
        type: 'numerical',
        title: '14. Double Hashing Probe Target Slot',
        prompt:
          'Consider an open-addressed hash table of size M = 11 (slots 0 through 10) using double hashing:\n' +
          '  h₁(k) = k mod 11\n' +
          '  h₂(k) = 1 + (k mod 5)\n' +
          '  Probe sequence: (h₁(k) + j · h₂(k)) mod 11 for j = 0, 1, 2, ...\n\n' +
          'Suppose slots 3 and 8 are already occupied and all other slots are empty. At which slot index will key k = 14 be inserted?',
        points: 4,
        unit: 'slot',
      },
      key: { type: 'numerical', value: 2, tolerance: { mode: 'absolute', amount: 0 } },
    },
    {
      id: 'dsa_num_05_edit_distance',
      doc: {
        ...meta('hard', ['dynamic-programming', 'strings']),
        type: 'numerical',
        title: '15. Levenshtein Edit Distance',
        prompt:
          'What is the minimum Levenshtein edit distance (where each single-character insertion, deletion, or substitution costs 1 operation) required to transform the string "kitten" into "sitting"?',
        points: 4,
        unit: 'operations',
      },
      key: { type: 'numerical', value: 3, tolerance: { mode: 'absolute', amount: 0 } },
    },

    /* ═══════════════════════════ 5 CODING ═══════════════════════════ */
    {
      id: 'dsa_code_01_kadane_max_subarray',
      doc: {
        ...meta('easy', ['arrays', 'dynamic-programming', 'kadane']),
        type: 'coding',
        title: "16. Maximum Contiguous Subarray Sum (Kadane's Algorithm)",
        prompt:
          'Given an array of n integers (which may include negative numbers), find the maximum possible sum of a non-empty contiguous subarray.\n\n' +
          'Input Format:\n' +
          '• First line: an integer n (1 ≤ n ≤ 100,000)\n' +
          '• Second line: n space-separated integers a₁, a₂, ..., aₙ (-10⁹ ≤ aᵢ ≤ 10⁹)\n\n' +
          'Output Format:\n' +
          '• Print a single integer: the maximum contiguous subarray sum.',
        points: 8,
        starterCode: {
          python:
            'import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    if not data:\n        return\n    n = int(data[0])\n    arr = [int(x) for x in data[1:n+1]]\n    # Write your O(n) Kadane algorithm here\n    \nif __name__ == "__main__":\n    solve()\n',
          javascript:
            "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\nif (data.length >= 2) {\n  const n = Number(data[0]);\n  const arr = data.slice(1, n + 1).map(Number);\n  // Write your solution here\n}\n",
          cpp:
            '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<long long> a(n);\n    for (int i = 0; i < n; ++i) cin >> a[i];\n    // Write your solution here\n    return 0;\n}\n',
          java:
            'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        long[] a = new long[n];\n        for (int i = 0; i < n; i++) a[i] = sc.nextLong();\n        // Write your solution here\n    }\n}\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '9\n-2 1 -3 4 -1 2 1 -5 4\n',
            expectedOutput: '6\n',
            weight: 1,
            explanation: 'Subarray [4, -1, 2, 1] has the largest sum = 6.',
          },
          {
            id: 'p2',
            input: '5\n5 4 -1 7 8\n',
            expectedOutput: '23\n',
            weight: 1,
            explanation: 'The entire array sums to 23.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 131_072 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '4\n-8 -3 -6 -2\n', expectedOutput: '-2\n', weight: 2 },
          { id: 'h2', input: '1\n-42\n', expectedOutput: '-42\n', weight: 2 },
          { id: 'h3', input: '6\n1000000000 1000000000 -500000000 1000000000 1000000000 -10\n', expectedOutput: '3500000000\n', weight: 2 },
        ],
      },
    },
    {
      id: 'dsa_code_02_balanced_brackets',
      doc: {
        ...meta('easy', ['stacks', 'strings']),
        type: 'coding',
        title: '17. Balanced Bracket Sequence Validator (Stack)',
        prompt:
          'Given a string s consisting only of the bracket characters \'(\', \')\', \'{\', \'}\', \'[\', and \']\', determine whether the sequence is validly balanced and properly nested.\n\n' +
          'Input Format:\n' +
          '• A single line containing the non-empty bracket string s (1 ≤ |s| ≤ 100,000).\n\n' +
          'Output Format:\n' +
          '• Print YES if the brackets are balanced, or NO otherwise.',
        points: 8,
        starterCode: {
          python:
            'import sys\n\ndef solve():\n    s = sys.stdin.read().strip()\n    # Print YES or NO\n\nif __name__ == "__main__":\n    solve()\n',
          javascript:
            "const fs = require('fs');\nconst s = fs.readFileSync(0, 'utf8').trim();\n// Print YES or NO\n",
          cpp:
            '#include <iostream>\n#include <string>\n#include <stack>\nusing namespace std;\n\nint main() {\n    string s;\n    if (!(cin >> s)) return 0;\n    // Print YES or NO\n    return 0;\n}\n',
          java:
            'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNext()) return;\n        String s = sc.next();\n        // Print YES or NO\n    }\n}\n',
        },
        publicTestCases: [
          { id: 'p1', input: '{[()()]}\n', expectedOutput: 'YES\n', weight: 1, explanation: 'All brackets are properly nested and closed.' },
          { id: 'p2', input: '([)]\n', expectedOutput: 'NO\n', weight: 1, explanation: 'Inner [ is not closed before ).' },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 131_072 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '(((\n', expectedOutput: 'NO\n', weight: 2 },
          { id: 'h2', input: ')))(((\n', expectedOutput: 'NO\n', weight: 2 },
          { id: 'h3', input: '()[]{}{[()()]}([])\n', expectedOutput: 'YES\n', weight: 2 },
        ],
      },
    },
    {
      id: 'dsa_code_03_binary_search_range',
      doc: {
        ...meta('medium', ['binary-search', 'arrays']),
        type: 'coding',
        title: '18. First and Last Position of Element in Sorted Array',
        prompt:
          'Given a 0-indexed array of n integers sorted in non-decreasing order and a target value, find the first (leftmost) and last (rightmost) index of target in O(log n) time.\n\n' +
          'Input Format:\n' +
          '• First line: two space-separated integers n and target (1 ≤ n ≤ 100,000)\n' +
          '• Second line: n space-separated non-decreasing integers\n\n' +
          'Output Format:\n' +
          '• Print two space-separated integers: firstIndex lastIndex (or "-1 -1" if target does not appear).',
        points: 10,
        starterCode: {
          python:
            'import sys\nfrom bisect import bisect_left, bisect_right\n\ndef solve():\n    data = list(map(int, sys.stdin.read().split()))\n    if not data:\n        return\n    n, target = data[0], data[1]\n    arr = data[2:2+n]\n    # Print first and last index of target\n\nif __name__ == "__main__":\n    solve()\n',
          javascript:
            "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconst [n, target] = [data[0], data[1]];\nconst arr = data.slice(2, 2 + n);\n// Print first and last index of target\n",
          cpp:
            '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    long long target;\n    if (!(cin >> n >> target)) return 0;\n    vector<long long> a(n);\n    for (int i = 0; i < n; ++i) cin >> a[i];\n    // Print first and last index\n    return 0;\n}\n',
          java:
            'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        long target = sc.nextLong();\n        long[] a = new long[n];\n        for (int i = 0; i < n; i++) a[i] = sc.nextLong();\n        // Print first and last index\n    }\n}\n',
        },
        publicTestCases: [
          { id: 'p1', input: '6 8\n5 7 7 8 8 10\n', expectedOutput: '3 4\n', weight: 1, explanation: '8 appears at indices 3 and 4.' },
          { id: 'p2', input: '6 6\n5 7 7 8 8 10\n', expectedOutput: '-1 -1\n', weight: 1, explanation: '6 is not present.' },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 131_072 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '5 4\n4 4 4 4 4\n', expectedOutput: '0 4\n', weight: 2 },
          { id: 'h2', input: '1 9\n9\n', expectedOutput: '0 0\n', weight: 2 },
          { id: 'h3', input: '7 12\n1 3 5 7 9 11 12\n', expectedOutput: '6 6\n', weight: 2 },
        ],
      },
    },
    {
      id: 'dsa_code_04_bfs_shortest_path',
      doc: {
        ...meta('medium', ['graphs', 'bfs', 'shortest-path']),
        type: 'coding',
        title: '19. Shortest Path in an Unweighted Graph (BFS)',
        prompt:
          'Given an undirected, unweighted graph with n vertices (numbered 1 to n) and m edges, compute the minimum number of edges on a path from vertex src to vertex dst.\n\n' +
          'Input Format:\n' +
          '• First line: four space-separated integers n m src dst\n' +
          '• Next m lines: two space-separated integers u v indicating an undirected edge between u and v\n\n' +
          'Output Format:\n' +
          '• Print the minimum number of edges from src to dst, or -1 if dst is unreachable.',
        points: 12,
        starterCode: {
          python:
            'import sys\nfrom collections import deque\n\ndef solve():\n    data = list(map(int, sys.stdin.read().split()))\n    if not data:\n        return\n    n, m, src, dst = data[0], data[1], data[2], data[3]\n    adj = [[] for _ in range(n + 1)]\n    idx = 4\n    for _ in range(m):\n        u, v = data[idx], data[idx + 1]\n        idx += 2\n        adj[u].append(v)\n        adj[v].append(u)\n    # Run BFS from src to dst\n\nif __name__ == "__main__":\n    solve()\n',
          javascript:
            "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconst [n, m, src, dst] = [data[0], data[1], data[2], data[3]];\nconst adj = Array.from({ length: n + 1 }, () => []);\nfor (let i = 0; i < m; i++) {\n  const u = data[4 + 2 * i], v = data[4 + 2 * i + 1];\n  adj[u].push(v);\n  adj[v].push(u);\n}\n// Run BFS from src to dst\n",
          cpp:
            '#include <iostream>\n#include <vector>\n#include <queue>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n, m, src, dst;\n    if (!(cin >> n >> m >> src >> dst)) return 0;\n    vector<vector<int>> adj(n + 1);\n    for (int i = 0; i < m; ++i) {\n        int u, v;\n        cin >> u >> v;\n        adj[u].push_back(v);\n        adj[v].push_back(u);\n    }\n    // Run BFS from src to dst\n    return 0;\n}\n',
          java:
            'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt(), m = sc.nextInt(), src = sc.nextInt(), dst = sc.nextInt();\n        List<List<Integer>> adj = new ArrayList<>();\n        for (int i = 0; i <= n; i++) adj.add(new ArrayList<>());\n        for (int i = 0; i < m; i++) {\n            int u = sc.nextInt(), v = sc.nextInt();\n            adj.get(u).add(v);\n            adj.get(v).add(u);\n        }\n        // Run BFS from src to dst\n    }\n}\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '6 6 1 6\n1 2\n1 3\n2 4\n3 5\n4 6\n5 6\n',
            expectedOutput: '3\n',
            weight: 1,
            explanation: 'Shortest path 1 -> 2 -> 4 -> 6 has 3 edges.',
          },
          {
            id: 'p2',
            input: '4 2 1 4\n1 2\n2 3\n',
            expectedOutput: '-1\n',
            weight: 1,
            explanation: 'Vertex 4 is disconnected from 1.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 131_072 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '5 0 3 3\n', expectedOutput: '0\n', weight: 2 },
          { id: 'h2', input: '5 5 1 5\n1 2\n2 3\n3 4\n4 5\n1 5\n', expectedOutput: '1\n', weight: 2 },
          { id: 'h3', input: '7 7 1 7\n1 2\n2 3\n3 4\n4 7\n1 5\n5 6\n6 4\n', expectedOutput: '4\n', weight: 2 },
        ],
      },
    },
    {
      id: 'dsa_code_05_01_knapsack',
      doc: {
        ...meta('hard', ['dynamic-programming', 'knapsack']),
        type: 'coding',
        title: '20. 0/1 Knapsack Maximum Value (Dynamic Programming)',
        prompt:
          'You are given n items and a knapsack of weight capacity W. Each item i has weight wᵢ and value vᵢ and can be selected at most once. Compute the maximum total value of items whose combined weight does not exceed W.\n\n' +
          'Input Format:\n' +
          '• First line: two space-separated integers n and W (1 ≤ n ≤ 200, 1 ≤ W ≤ 5,000)\n' +
          '• Next n lines: two space-separated integers wᵢ and vᵢ (1 ≤ wᵢ ≤ W, 1 ≤ vᵢ ≤ 10⁶)\n\n' +
          'Output Format:\n' +
          '• Print a single integer: the maximum total value achievable.',
        points: 12,
        starterCode: {
          python:
            'import sys\n\ndef solve():\n    data = list(map(int, sys.stdin.read().split()))\n    if not data:\n        return\n    n, W = data[0], data[1]\n    items = []\n    for i in range(n):\n        items.append((data[2 + 2 * i], data[2 + 2 * i + 1]))\n    # Compute 0/1 Knapsack maximum value\n\nif __name__ == "__main__":\n    solve()\n',
          javascript:
            "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconst [n, W] = [data[0], data[1]];\nconst items = [];\nfor (let i = 0; i < n; i++) items.push([data[2 + 2 * i], data[2 + 2 * i + 1]]);\n// Compute 0/1 Knapsack maximum value\n",
          cpp:
            '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n, W;\n    if (!(cin >> n >> W)) return 0;\n    vector<long long> dp(W + 1, 0);\n    for (int i = 0; i < n; ++i) {\n        int w;\n        long long v;\n        cin >> w >> v;\n        // Update dp table\n    }\n    return 0;\n}\n',
          java:
            'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt(), W = sc.nextInt();\n        long[] dp = new long[W + 1];\n        for (int i = 0; i < n; i++) {\n            int w = sc.nextInt();\n            long v = sc.nextLong();\n            // Update dp table\n        }\n    }\n}\n',
        },
        publicTestCases: [
          {
            id: 'p1',
            input: '3 50\n10 60\n20 100\n30 120\n',
            expectedOutput: '220\n',
            weight: 1,
            explanation: 'Take items with weights 20 and 30 for value 100 + 120 = 220.',
          },
          {
            id: 'p2',
            input: '4 7\n1 1\n3 4\n4 5\n5 7\n',
            expectedOutput: '9\n',
            weight: 1,
            explanation: 'Take items (3, 4) and (4, 5) for total weight 7 and value 9.',
          },
        ],
        limits: { cpuTimeSec: 2, memoryKb: 131_072 },
        comparison: 'trimmed',
      },
      key: {
        type: 'coding',
        hiddenTestCases: [
          { id: 'h1', input: '1 10\n10 500\n', expectedOutput: '500\n', weight: 2 },
          { id: 'h2', input: '3 10\n6 30\n5 20\n5 20\n', expectedOutput: '40\n', weight: 2 },
          { id: 'h3', input: '5 15\n12 4\n1 2\n4 10\n1 1\n2 2\n', expectedOutput: '15\n', weight: 2 },
        ],
      },
    },
  ];

  const mcqIds = questions.filter((q) => q.doc.type === 'mcq').map((q) => q.id);
  const numIds = questions.filter((q) => q.doc.type === 'numerical').map((q) => q.id);
  const codeIds = questions.filter((q) => q.doc.type === 'coding').map((q) => q.id);

  const examRef = collections.exams.doc('dsa_course_exam');
  const exam: ExamDoc = {
    title: 'CS201: Data Structures & Algorithms — Comprehensive Exam',
    description: 'Covers Asymptotic Analysis, Trees, Heaps, Hashing, Graphs, Sorting, and Dynamic Programming.',
    instructions:
      '• Section 1 (Conceptual MCQs): Choose the single best option.\n' +
      '• Section 2 (Quantitative & Complexity): Enter exact numerical answers.\n' +
      '• Section 3 (Algorithmic Coding): Write optimal solutions in Python, JavaScript, C++, or Java and verify against public test cases before submitting.',
    createdBy: examinerUid,
    status: 'draft',
    durationMinutes: 90,
    window: {
      opensAt: now,
      closesAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 3600_000),
    },
    sections: [
      {
        id: 'sec_mcq',
        title: 'Section A — Conceptual MCQs',
        poolQuestionIds: mcqIds,
        drawCount: 10,
        shuffleQuestions: true,
        pointsPerQuestion: null,
      },
      {
        id: 'sec_num',
        title: 'Section B — Numerical & Complexity Analysis',
        poolQuestionIds: numIds,
        drawCount: 5,
        shuffleQuestions: true,
        pointsPerQuestion: null,
      },
      {
        id: 'sec_code',
        title: 'Section C — Algorithmic Coding Problems',
        poolQuestionIds: codeIds,
        drawCount: 5,
        shuffleQuestions: false,
        pointsPerQuestion: null,
      },
    ],
    settings: {
      shuffleOptions: true,
      allowedLanguages: ['python', 'javascript', 'cpp', 'java'],
      maxWarnings: 3,
      requireFullscreen: true,
      requireWebcam: true,
      requireMicrophone: true,
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
    `Successfully seeded 20 DSA questions (10 MCQ, 5 Numerical, 5 Coding = ${exam.totalPoints} pts) + exam "${exam.title}" for ${examinerEmail} (uid: ${examinerUid}).`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
