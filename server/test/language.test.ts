import { describe, it, expect } from 'vitest';
import { detectTextLanguage } from '../src/ai/tasks/generateQuiz.js';

describe('Multilingual Text & Language Detection', () => {
  it('correctly detects English text', () => {
    const englishSample = 'Photosynthesis is the process by which green plants convert light into chemical energy.';
    expect(detectTextLanguage(englishSample)).toBe('en');
  });

  it('correctly detects Arabic text', () => {
    const arabicSample = 'البناء الضوئي هو العملية التي تستخدمها النباتات لتحويل طاقة الضوء إلى طاقة كيميائية.';
    expect(detectTextLanguage(arabicSample)).toBe('ar');
  });

  it('handles mixed text by majority characters', () => {
    const mostlyArabic = 'في درس Biology اليوم سنتحدث عن DNA والجينات الوراثية والخلية الحية';
    expect(detectTextLanguage(mostlyArabic)).toBe('ar');

    const mostlyEnglish = 'Chapter 4: Cell division, mitosis and meiosis with some Arabic notes مثل الانقسام';
    expect(detectTextLanguage(mostlyEnglish)).toBe('en');
  });
});
