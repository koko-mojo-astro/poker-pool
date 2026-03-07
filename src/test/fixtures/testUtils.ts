import { vi } from 'vitest';

export function createMockDb() {
  return {
    transact: vi.fn().mockResolvedValue(undefined),
  };
}

export function mockMathRandom(sequence: number[]) {
  let index = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = sequence[index] ?? sequence[sequence.length - 1] ?? 0;
    index += 1;
    return value;
  });
}
