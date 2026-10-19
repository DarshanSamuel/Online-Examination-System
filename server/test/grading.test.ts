import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { outputsMatch, parseStrictNumber } from '../src/services/grading/compare.js';
import { gradeMcq, gradeNumerical } from '../src/services/grading/objective.js';

describe('outputsMatch', () => {
  it('trimmed ignores trailing whitespace and CRLF', () => {
    assert.equal(outputsMatch('0 1  \r\n\r\n', '0 1', 'trimmed'), true);
    assert.equal(outputsMatch('0  1', '0 1', 'trimmed'), false);
  });
  it('exact is strict except for newline style', () => {
    assert.equal(outputsMatch('a\r\nb', 'a\nb', 'exact'), true);
    assert.equal(outputsMatch('a\n', 'a', 'exact'), false);
  });
  it('tokens ignores all whitespace layout', () => {
    assert.equal(outputsMatch('1\n2   3\n', '1 2 3', 'tokens'), true);
  });
  it('float uses relative tolerance', () => {
    assert.equal(outputsMatch('3.14159265', '3.141592', 'float', 1e-6), true);
    assert.equal(outputsMatch('3.15', '3.14', 'float', 1e-6), false);
    assert.equal(outputsMatch('YES 1.0000001', 'YES 1', 'float', 1e-6), true);
  });
});

describe('parseStrictNumber', () => {
  it('accepts plain decimals / scientific notation', () => {
    assert.equal(parseStrictNumber(' 9.81 '), 9.81);
    assert.equal(parseStrictNumber('-1e3'), -1000);
  });
  it('rejects ambiguous input', () => {
    for (const bad of ['', '0x10', '1,000', 'Infinity', 'NaN', '1/2']) assert.equal(parseStrictNumber(bad), null, bad);
  });
});

describe('objective grading', () => {
  it('mcq', () => {
    const key = { type: 'mcq' as const, correctOptionId: 'a' };
    assert.equal(gradeMcq({ type: 'mcq', selectedOptionId: 'a' }, key, 2).score, 2);
    assert.equal(gradeMcq({ type: 'mcq', selectedOptionId: 'b' }, key, 2).score, 0);
    assert.equal(gradeMcq({ type: 'mcq', selectedOptionId: null }, key, 2).status, 'unanswered');
  });
  it('numerical absolute and relative tolerance', () => {
    const abs = { type: 'numerical' as const, value: 9.81, tolerance: { mode: 'absolute' as const, amount: 0.05 } };
    assert.equal(gradeNumerical({ type: 'numerical', value: '9.8' }, abs, 3).score, 3);
    assert.equal(gradeNumerical({ type: 'numerical', value: '9.7' }, abs, 3).score, 0);

    const rel = { type: 'numerical' as const, value: 1000, tolerance: { mode: 'relative' as const, amount: 0.01 } };
    assert.equal(gradeNumerical({ type: 'numerical', value: '1009' }, rel, 1).score, 1);
    assert.equal(gradeNumerical({ type: 'numerical', value: '1011' }, rel, 1).score, 0);

    const exact = { type: 'numerical' as const, value: 0.3, tolerance: { mode: 'absolute' as const, amount: 0 } };
    assert.equal(gradeNumerical({ type: 'numerical', value: String(0.1 + 0.2) }, exact, 1).score, 1, 'float epsilon');
  });
});
