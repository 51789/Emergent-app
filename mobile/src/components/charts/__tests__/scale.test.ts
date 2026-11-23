import { labelStep, niceMax } from '../scale';

describe('niceMax', () => {
  it('rounds the axis maximum up to a readable value', () => {
    expect(niceMax(7)).toBe(7);
    expect(niceMax(23)).toBe(30);
    expect(niceMax(140)).toBe(200);
    expect(niceMax(1000)).toBe(1000);
  });

  it('never returns less than 1 (all-zero series)', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
  });
});

describe('labelStep', () => {
  it('thins labels so at most maxLabels are drawn', () => {
    expect(labelStep(5, 7)).toBe(1);
    expect(labelStep(30, 6)).toBe(5);
    expect(labelStep(31, 6)).toBe(6);
  });
});
