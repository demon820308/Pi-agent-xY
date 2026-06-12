"use client";

import { useState, useEffect } from "react";

export interface TtsState {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface VoiceParams {
  text: string;
  style?: string;
  voice?: string;
  modelId?: string;
  voiceDesignPrompt?: string;
}

// Global singleton registry to ensure only one audio plays at any given time across all messages
let globalActiveAudio: HTMLAudioElement | null = null;
let globalActiveSetState: ((state: TtsState) => void) | null = null;

// Helper to resolve active settings from localStorage to match the selected model
function getVoiceParams(textContent: string, modelId?: string, messageId?: string): VoiceParams {
  let finalVoice: string | undefined = undefined;
  let finalModelId = modelId;
  let finalVoiceDesignPrompt: string | undefined = undefined;

  try {
    let settings: {
      modelId?: string;
      voiceDesignPrompt?: string;
      voiceCloneAudioData?: string;
      presetVoice?: string;
    } | null = null;
    
    // 1. Try to load from history snapshot
    if (messageId) {
      const histStored = typeof window !== "undefined" ? localStorage.getItem("mimo_history_voice_settings") : null;
      if (histStored) {
        const history = JSON.parse(histStored) as Record<string, typeof settings>;
        settings = history[messageId];
      }
    }
    
    // 2. Fallback to global settings
    if (!settings) {
      const stored = typeof window !== "undefined" ? localStorage.getItem("mimo_voice_settings") : null;
      if (stored) {
        settings = JSON.parse(stored);
      }
    }

    if (settings) {
      const resolvedModelId = settings.modelId || modelId || "";
      const mid = resolvedModelId.toLowerCase();
      finalModelId = settings.modelId || modelId;

      if (mid.includes("voicedesign") || mid.includes("design")) {
        finalVoice = undefined; // For voicedesign, voice parameter must be omitted/undefined
        finalVoiceDesignPrompt = settings.voiceDesignPrompt || "";
      } else if (mid.includes("voiceclone") || mid.includes("clone")) {
        if (settings.voiceCloneAudioData) {
          finalVoice = settings.voiceCloneAudioData;
        } else {
          finalVoice = undefined;
        }
      } else if (mid.includes("tts")) {
        finalVoice = settings.presetVoice || "mimo_default";
      }
    }
  } catch (e) {
    console.error("Failed to read voice settings in getVoiceParams:", e);
  }

  return {
    text: textContent,
    voice: finalVoice,
    modelId: finalModelId,
    voiceDesignPrompt: finalVoiceDesignPrompt
  };
}

// Helper to hash voice if it is a DataURL to prevent giant URLs in Cache Storage
function getNormalizedParams(params: VoiceParams): VoiceParams {
  const normalized = { ...params };
  if (normalized.voice && normalized.voice.startsWith("data:")) {
    const dataUrl = normalized.voice;
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
      hash = (hash << 5) - hash + dataUrl.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    normalized.voice = `data_url_hash_${dataUrl.length}_${hash}`;
  }
  return normalized;
}

// Retrieve from browser's persistent Cache Storage
async function getCachedAudio(params: VoiceParams): Promise<string | null> {
  if (typeof window === "undefined" || !window.caches) return null;
  try {
    const normalized = getNormalizedParams(params);
    const cacheKey = JSON.stringify(normalized);
    const fakeUrl = `https://mimo.local/audio?key=${encodeURIComponent(cacheKey)}`;
    const cache = await caches.open("mimo-tts-cache");
    const cachedResponse = await cache.match(fakeUrl);
    if (cachedResponse) {
      return await cachedResponse.text();
    }
  } catch (e) {
    console.error("Error reading from Cache Storage:", e);
  }
  return null;
}

// Save to browser's persistent Cache Storage
export async function saveCachedAudio(params: VoiceParams, audioUrl: string): Promise<void> {
  if (typeof window === "undefined" || !window.caches) return;
  try {
    const normalized = getNormalizedParams(params);
    const cacheKey = JSON.stringify(normalized);
    const fakeUrl = `https://mimo.local/audio?key=${encodeURIComponent(cacheKey)}`;
    const cache = await caches.open("mimo-tts-cache");
    await cache.put(fakeUrl, new Response(audioUrl));
  } catch (e) {
    console.error("Error writing to Cache Storage:", e);
  }
}

export function useTts(messageId: string, textContent: string, modelId?: string, active = false) {
  const [state, setState] = useState<TtsState>({
    isPlaying: false,
    isLoading: false,
    error: null,
  });

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Sync / cleanup on component unmount
  useEffect(() => {
    return () => {
      if (globalActiveSetState === setState) {
        globalActiveSetState = null;
      }
    };
  }, []);

  // Pre-load from cache and sync on voice settings change
  useEffect(() => {
    if (!active) return;

    const checkCache = async () => {
      const params = getVoiceParams(textContent, modelId, messageId);
      const cached = await getCachedAudio(params);
      setAudioUrl(cached);
    };

    checkCache();

    window.addEventListener("mimo_voice_settings_changed", checkCache);
    window.addEventListener("mimo_history_voice_settings_changed", checkCache);
    return () => {
      window.removeEventListener("mimo_voice_settings_changed", checkCache);
      window.removeEventListener("mimo_history_voice_settings_changed", checkCache);
    };
  }, [textContent, modelId, messageId, active]);

  const stopGlobal = () => {
    if (globalActiveAudio) {
      try {
        globalActiveAudio.pause();
        globalActiveAudio.currentTime = 0;
      } catch (e) {
        console.error("Failed to pause active audio:", e);
      }
      globalActiveAudio = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        console.error("Failed to cancel active SpeechSynthesis:", e);
      }
    }
    if (globalActiveSetState) {
      globalActiveSetState({ isPlaying: false, isLoading: false, error: null });
      globalActiveSetState = null;
    }
  };

  const play = async (style?: string, voice?: string, incomingModelId?: string) => {
    // 1. Stop any currently playing audio across the entire page
    stopGlobal();

    // 2. Set current component state to loading
    setState({ isPlaying: false, isLoading: true, error: null });
    globalActiveSetState = setState;

    try {
      const activeModelId = incomingModelId || modelId;
      const params = getVoiceParams(textContent, activeModelId, messageId);
      // Force TTS model: always use the TTS model from settings, not the chat model
      try {
        const stored = localStorage.getItem("mimo_voice_settings");
        if (stored) {
          const s = JSON.parse(stored);
          if (s.modelId) params.modelId = s.modelId.toLowerCase();
        }
      } catch { /* ignore */ }
      if (style) params.style = style;
      if (voice) params.voice = voice;

      let cachedAudioUrl = await getCachedAudio(params);

      // 3. Synthesize if not already cached in Cache Storage
      if (!cachedAudioUrl) {
        const response = await fetch("/api/tts/synthesize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(params)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error("[useTts] Synthesis endpoint returned error details:", errData);
          throw new Error(errData.error || `Synthesis failed (HTTP ${response.status})`);
        }

        const data = await response.json() as { audioUrl?: string };
        if (!data.audioUrl) {
          throw new Error("No speech audio returned from synthesis endpoint");
        }

        cachedAudioUrl = data.audioUrl;
        await saveCachedAudio(params, cachedAudioUrl);
      }

      // 4. Create and configure HTML5 Audio object
      const audio = new Audio(cachedAudioUrl);
      globalActiveAudio = audio;
      setAudioUrl(cachedAudioUrl);

      audio.onplay = () => {
        setState({ isPlaying: true, isLoading: false, error: null });
      };

      audio.onended = () => {
        setState({ isPlaying: false, isLoading: false, error: null });
        if (globalActiveAudio === audio) globalActiveAudio = null;
        if (globalActiveSetState === setState) globalActiveSetState = null;
      };

      audio.onerror = () => {
        setState({ isPlaying: false, isLoading: false, error: "音频播放失败" });
        if (globalActiveAudio === audio) globalActiveAudio = null;
        if (globalActiveSetState === setState) globalActiveSetState = null;
      };

      await audio.play();

    } catch (err: unknown) {
      console.error("[useTts] Speech synthesis error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);

      // Fallback: browser native SpeechSynthesis when MiMo TTS fails
      if (typeof window !== "undefined" && window.speechSynthesis && textContent) {
        console.log("[useTts] Falling back to browser SpeechSynthesis");
        const utterance = new SpeechSynthesisUtterance(textContent);
        utterance.lang = /[一-龥]/.test(textContent) ? "zh-CN" : "en-US";
        utterance.rate = 1;
        utterance.onstart = () => {
          setState({ isPlaying: true, isLoading: false, error: null });
        };
        utterance.onend = () => {
          setState({ isPlaying: false, isLoading: false, error: null });
        };
        utterance.onerror = () => {
          setState({ isPlaying: false, isLoading: false, error: "Speech synthesis failed" });
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setState({ isPlaying: false, isLoading: false, error: errMsg || "语音合成出错" });
      }
      if (globalActiveSetState === setState) globalActiveSetState = null;
    }
  };

  const pause = () => {
    let handled = false;
    if (globalActiveAudio && globalActiveSetState === setState) {
      try {
        globalActiveAudio.pause();
        handled = true;
      } catch (e) {
        console.error("Pause error:", e);
      }
    }
    if (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.cancel();
        handled = true;
      } catch (e) {
        console.error("SpeechSynthesis cancel error:", e);
      }
    }
    if (handled || globalActiveSetState === setState) {
      setState({ isPlaying: false, isLoading: false, error: null });
      if (globalActiveAudio && globalActiveSetState === setState) {
        globalActiveAudio = null;
      }
      if (globalActiveSetState === setState) {
        globalActiveSetState = null;
      }
    }
  };

  return {
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    error: state.error,
    play,
    pause,
    audioUrl
  };
}
