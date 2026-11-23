import { strict as assert } from 'node:assert';
import test from 'node:test';
import { tidyArabic } from './features/text.ts';
test('tidyArabic only normalises spacing and punctuation, never words', () => {
  assert.equal(tidyArabic('  عصا التبخير   غير نظيفة ,ويوجد بقايا حليب  '), 'عصا التبخير غير نظيفة، ويوجد بقايا حليب.');
  assert.equal(tidyArabic('هل تم التنظيف ?'), 'هل تم التنظيف؟');
  assert.equal(tidyArabic('القراءة 4.5 درجة'), 'القراءة 4.5 درجة.');
});
