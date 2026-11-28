import { strict as assert } from 'node:assert';
import test from 'node:test';
import { branchPos, parseCoords, registerBranchCoords } from './features/geo.ts';

test('coordinates are read from Google Maps links and pasted pairs', () => {
  const want = { lat: 25.3829, lng: 49.5866 };
  assert.deepEqual(parseCoords('https://www.google.com/maps/place/X/@25.3829,49.5866,17z/data=!3m1'), want);
  assert.deepEqual(parseCoords('https://www.google.com/maps/place/X/data=!4m6!3d25.3829!4d49.5866'), want);
  assert.deepEqual(parseCoords('https://maps.google.com/?q=25.3829,49.5866'), want);
  assert.deepEqual(parseCoords('25.3829, 49.5866'), want);
  assert.deepEqual(parseCoords('٢٥.٣٨٢٩، ٤٩.٥٨٦٦'), want);
  assert.equal(parseCoords('https://maps.app.goo.gl/abc123'), null);
  assert.equal(parseCoords('48.8566, 2.3522'), null); // outside the Kingdom
});
test('an in-app position beats the shipped table and city centre', () => {
  assert.equal(branchPos('HAS.02', 'الاحساء - X')?.exact, true);
  registerBranchCoords([{ id: 'NEW.1', lat: 24.7, lng: 46.7 }]);
  assert.deepEqual(branchPos('NEW.1', 'الرياض - X'), { lat: 24.7, lng: 46.7, exact: true });
  registerBranchCoords([]);
  assert.equal(branchPos('NEW.1', 'الرياض - X')?.exact, false);
});
