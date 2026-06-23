'use client';

import { useState, useCallback, useRef } from 'react';
import type { CriticConfig, CritiqueResult } from '@/lib/design-critic/types';
import { DEFAULT_CRITIC_CONFIG } from '@/lib/design-critic/types';

export type CriticStep = 'idle' | 'capturing' | 'analyzing' | 'critiquing' | 'generating' | 'done' | 'error';

export interface CriticState {
  step: CriticStep;
  progress: number;
  statusText: string;
  result: CritiqueResult | null;
  error: string | null;
}

export function useDesignCritic() {
  const [config, setConfig] = useState<CriticConfig>(DEFAULT_CRITIC_CONFIG);
  const [state, setState] = useState<CriticState>({
    step: 'idle',
    progress: 0,
    statusText: '',
    result: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const updateState = useCallback((patch: Partial<CriticState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const analyze = useCallback(async (input: { imageBase64?: string; url?: string; htmlSource?: string }) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    if (input.url && !input.imageBase64 && !input.htmlSource) {
      updateState({ step: 'capturing', progress: 10, statusText: `Capturing ${input.url}...`, error: null });
      try {
        const res = await fetch('/api/design-critic/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input.url }),
          signal: abortRef.current.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Screenshot failed' }));
          throw new Error(err.error || 'Screenshot failed');
        }
        const data = await res.json();
        input.imageBase64 = data.imageBase64;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        updateState({ step: 'error', error: err instanceof Error ? err.message : 'Screenshot failed' });
        return;
      }
    }

    updateState({ step: 'analyzing', progress: 30, statusText: 'Analyzing design...' });
    try {
      const res = await fetch('/api/design-critic/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: input.imageBase64,
          url: input.url,
          htmlSource: input.htmlSource,
          config,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      updateState({ step: 'critiquing', progress: 70, statusText: 'Generating critique...' });

      const result: CritiqueResult = await res.json();

      updateState({ step: 'generating', progress: 90, statusText: 'Building preview...' });

      await new Promise((r) => setTimeout(r, 300));

      updateState({ step: 'done', progress: 100, statusText: 'Complete', result });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      updateState({ step: 'error', error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  }, [config, updateState]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({
      step: 'idle',
      progress: 0,
      statusText: '',
      result: null,
      error: null,
    });
  }, []);

  const retry = useCallback(() => {
    if (state.result?.screenshot) {
      analyze({ imageBase64: state.result.screenshot });
    }
  }, [state.result, analyze]);

  return {
    state,
    config,
    setConfig,
    analyze,
    reset,
    retry,
  };
}
