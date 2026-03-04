import { vi } from 'vitest';

class FakeAudioContext {
  createGain() {
    return {
      connect: vi.fn(),
      gain: { value: 1 }
    };
  }
}

Object.defineProperty(globalThis, 'AudioContext', {
  value: FakeAudioContext,
  writable: true
});
