import { chooseAIMove } from '/shared/engine.js';

self.onmessage = (event) => {
  const { requestId, state, side, difficulty } = event.data || {};
  try {
    const result = chooseAIMove(state, side, difficulty || 'normal');
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, error: String(error?.message || error) });
  }
};
