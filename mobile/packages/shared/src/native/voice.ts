import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  OutputFormatAndroidType,
} from 'react-native-audio-recorder-player';

/** Voice notes stop recording at 5 minutes (server limit). */
export const VOICE_MAX_SEC = 300;

/**
 * Two native instances: one records, one plays. The library keeps one
 * recorder / one player per instance, so a single shared player also
 * guarantees only one voice note plays at a time.
 */
const recorder = new AudioRecorderPlayer();
const player = new AudioRecorderPlayer();
recorder.setSubscriptionDuration(0.25);
player.setSubscriptionDuration(0.25);

async function micAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS asks via NSMicrophoneUsageDescription
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export type VoiceRecorderState = 'idle' | 'recording' | 'denied';

/**
 * Tap-to-start / tap-to-stop voice recorder. Records AAC in an MP4 / M4A
 * container (plays everywhere, accepted by the server). `stop(true)` discards.
 * onDone gets a file:// URI and the length in whole seconds (≥ 1).
 */
export function useVoiceRecorder(onDone: (uri: string, seconds: number) => void) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const ms = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const active = useRef(false);

  const stop = useCallback(async (cancel = false) => {
    if (!active.current) return;
    active.current = false;
    let path = '';
    try {
      path = await recorder.stopRecorder();
    } catch {
      /* already stopped */
    }
    recorder.removeRecordBackListener();
    const secs = Math.round(ms.current / 1000);
    setState('idle');
    setSeconds(0);
    if (!cancel && path && secs >= 1) {
      onDoneRef.current(path.startsWith('file://') ? path : `file://${path}`, Math.min(secs, VOICE_MAX_SEC));
    }
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    if (!(await micAllowed())) {
      setState('denied');
      return;
    }
    await player.stopPlayer().catch(() => {});
    ms.current = 0;
    await recorder.startRecorder(undefined, {
      AudioSourceAndroid: AudioSourceAndroidType.MIC,
      OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioEncodingBitRateAndroid: 64000,
      AudioSamplingRateAndroid: 44100,
      AudioChannelsAndroid: 1,
      AVFormatIDKeyIOS: AVEncodingOption.aac,
      AVNumberOfChannelsKeyIOS: 1,
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.medium,
    });
    active.current = true;
    recorder.addRecordBackListener((e) => {
      ms.current = e.currentPosition;
      const s = Math.floor(e.currentPosition / 1000);
      setSeconds(s);
      if (s >= VOICE_MAX_SEC) stop();
    });
    setState('recording');
  }, [stop]);

  useEffect(() => () => void stop(true), [stop]);

  return { state, seconds, start, stop, reset: () => setState('idle') };
}

// ─── Playback ────────────────────────────────────────────────────────────────

type PlayState = { key: string | null; playing: boolean; positionMs: number; durationMs: number };
let playState: PlayState = { key: null, playing: false, positionMs: 0, durationMs: 0 };
const playListeners = new Set<(s: PlayState) => void>();
const emit = (patch: Partial<PlayState>) => {
  playState = { ...playState, ...patch };
  playListeners.forEach((l) => l(playState));
};

/**
 * Play / pause one voice note. `key` identifies the note (its id); starting
 * another note stops the current one. `headers` carry the bearer token for
 * auth-gated attachments.
 */
export function useVoicePlayer(key: string) {
  const [s, setS] = useState(playState);
  useEffect(() => {
    playListeners.add(setS);
    return () => {
      playListeners.delete(setS);
    };
  }, []);
  const mine = s.key === key;

  const toggle = useCallback(
    async (uri: string, headers?: Record<string, string>) => {
      if (playState.key === key && playState.playing) {
        await player.pausePlayer().catch(() => {});
        emit({ playing: false });
        return;
      }
      if (playState.key === key && !playState.playing && playState.positionMs > 0) {
        await player.resumePlayer().catch(() => {});
        emit({ playing: true });
        return;
      }
      await player.stopPlayer().catch(() => {});
      player.removePlayBackListener();
      emit({ key, playing: true, positionMs: 0, durationMs: 0 });
      player.addPlayBackListener((e) => {
        const done = e.duration > 0 && e.currentPosition >= e.duration - 50;
        emit({ positionMs: done ? 0 : e.currentPosition, durationMs: e.duration, playing: !done });
        if (done) {
          player.stopPlayer().catch(() => {});
          player.removePlayBackListener();
        }
      });
      try {
        await player.startPlayer(uri, headers);
      } catch {
        player.removePlayBackListener();
        emit({ playing: false, key: null });
        throw new Error('play-failed');
      }
    },
    [key],
  );

  return {
    playing: mine && s.playing,
    positionMs: mine ? s.positionMs : 0,
    durationMs: mine ? s.durationMs : 0,
    toggle,
  };
}

/** Stop any playing voice note (e.g. when leaving a thread). */
export function stopVoicePlayback() {
  player.stopPlayer().catch(() => {});
  player.removePlayBackListener();
  emit({ key: null, playing: false, positionMs: 0, durationMs: 0 });
}
