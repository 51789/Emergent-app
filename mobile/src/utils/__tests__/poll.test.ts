import { pollUntil } from '../poll';

describe('pollUntil', () => {
  it('returns as soon as the predicate is satisfied', async () => {
    const fn = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const result = await pollUntil(fn, (value) => value === 2, { attempts: 5, intervalMs: 1 });
    expect(result).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the allowed attempts and returns the last value', async () => {
    const fn = jest.fn().mockResolvedValue('pending');
    const result = await pollUntil(fn, () => false, { attempts: 3, intervalMs: 1 });
    expect(result).toBe('pending');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('treats a thrown error as a failed attempt and keeps going', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce('done');
    const result = await pollUntil(fn, (value) => value === 'done', { attempts: 3, intervalMs: 1 });
    expect(result).toBe('done');
  });
});
