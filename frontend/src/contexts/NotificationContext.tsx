import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { api } from "../api/client";
import type { NewTicketNotification } from "../types";

interface NotificationContextValue {
  notifications: NewTicketNotification[];
  unreadCount: number;
  soundEnabled: boolean;
  toggleSound: () => void;
  markAllRead: () => void;
  dismissNotification: (id: number) => void;
  clearAll: () => void;
  lastPollTime: string | null;
  isPolling: boolean;
  pollNow: () => void;
  volume: number;
  setVolume: (v: number) => void;
  customSoundName: string | null;
  setCustomSound: (file: File | null) => void;
  testSound: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL = 3 * 60 * 1000; // 3 minutes
const SOUND_KEY = "soc-notif-sound";
const SEEN_KEY = "soc-notif-seen-ids";
const LAST_POLL_KEY = "soc-notif-last-poll";
const VOLUME_KEY = "soc-notif-volume";
const CUSTOM_SOUND_KEY = "soc-notif-custom-sound";
const CUSTOM_SOUND_NAME_KEY = "soc-notif-custom-sound-name";

/** Play the default siren sound via Web Audio API */
function playDefaultSiren(volume: number) {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    const VOL = volume;
    const TOTAL = 2.4;

    const sirenA = ctx.createOscillator();
    const sirenB = ctx.createOscillator();
    const gainA = ctx.createGain();
    const gainB = ctx.createGain();

    sirenA.connect(gainA);
    sirenB.connect(gainB);
    gainA.connect(ctx.destination);
    gainB.connect(ctx.destination);

    sirenA.type = "sawtooth";
    sirenB.type = "square";

    const cycles = 3;
    const cycleDur = TOTAL / cycles;
    for (let i = 0; i < cycles; i++) {
      const start = t + i * cycleDur;
      sirenA.frequency.setValueAtTime(600, start);
      sirenA.frequency.linearRampToValueAtTime(1200, start + cycleDur * 0.5);
      sirenA.frequency.linearRampToValueAtTime(600, start + cycleDur);
      sirenB.frequency.setValueAtTime(620, start);
      sirenB.frequency.linearRampToValueAtTime(1220, start + cycleDur * 0.5);
      sirenB.frequency.linearRampToValueAtTime(620, start + cycleDur);
    }

    gainA.gain.setValueAtTime(VOL, t);
    gainA.gain.setValueAtTime(VOL, t + TOTAL - 0.1);
    gainA.gain.exponentialRampToValueAtTime(0.001, t + TOTAL);

    gainB.gain.setValueAtTime(VOL * 0.3, t);
    gainB.gain.setValueAtTime(VOL * 0.3, t + TOTAL - 0.1);
    gainB.gain.exponentialRampToValueAtTime(0.001, t + TOTAL);

    sirenA.start(t);
    sirenA.stop(t + TOTAL);
    sirenB.start(t);
    sirenB.stop(t + TOTAL);

    const blasts = 6;
    const blastDur = 0.12;
    for (let i = 0; i < blasts; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = i % 2 === 0 ? 1400 : 1600;
      const bt = t + i * 0.2;
      g.gain.setValueAtTime(0, bt);
      g.gain.linearRampToValueAtTime(VOL * 0.5, bt + 0.02);
      g.gain.setValueAtTime(VOL * 0.5, bt + blastDur - 0.02);
      g.gain.linearRampToValueAtTime(0, bt + blastDur);
      osc.start(bt);
      osc.stop(bt + blastDur);
    }

    setTimeout(() => ctx.close().catch(() => {}), (TOTAL + 0.5) * 1000);
  } catch { /* ignore audio errors */ }
}

/** Play a custom MP3/WAV stored as data URL */
function playCustomSound(dataUrl: string, volume: number) {
  try {
    const audio = new Audio(dataUrl);
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

/** Play notification sound — custom if available, else default siren */
function playNotificationSound(volume: number, customSoundUrl: string | null) {
  if (customSoundUrl) {
    playCustomSound(customSoundUrl, volume);
  } else {
    playDefaultSiren(volume);
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NewTicketNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== "false"; }
    catch { return true; }
  });
  const [volume, setVolumeState] = useState(() => {
    try {
      const v = localStorage.getItem(VOLUME_KEY);
      return v !== null ? parseFloat(v) : 0.45;
    } catch { return 0.45; }
  });
  const [customSoundUrl, setCustomSoundUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(CUSTOM_SOUND_KEY); }
    catch { return null; }
  });
  const [customSoundName, setCustomSoundName] = useState<string | null>(() => {
    try { return localStorage.getItem(CUSTOM_SOUND_NAME_KEY); }
    catch { return null; }
  });
  const [lastPollTime, setLastPollTime] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_POLL_KEY); }
    catch { return null; }
  });
  const [isPolling, setIsPolling] = useState(false);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  // Load seen IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEEN_KEY);
      if (stored) seenIdsRef.current = new Set(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveSeen = useCallback(() => {
    try {
      const arr = Array.from(seenIdsRef.current).slice(-500);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch { /* ignore */ }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem(SOUND_KEY, String(next));
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    try { localStorage.setItem(VOLUME_KEY, String(clamped)); } catch { /* ignore */ }
  }, []);

  const setCustomSound = useCallback((file: File | null) => {
    if (!file) {
      // Remove custom sound
      setCustomSoundUrl(null);
      setCustomSoundName(null);
      try {
        localStorage.removeItem(CUSTOM_SOUND_KEY);
        localStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
      } catch { /* ignore */ }
      return;
    }
    // Read file as data URL and store
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      try {
        localStorage.setItem(CUSTOM_SOUND_KEY, dataUrl);
        localStorage.setItem(CUSTOM_SOUND_NAME_KEY, file.name);
      } catch (e) {
        // localStorage full — file too large
        console.warn("Could not store custom sound:", e);
        return;
      }
      setCustomSoundUrl(dataUrl);
      setCustomSoundName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const testSound = useCallback(() => {
    playNotificationSound(volume, customSoundUrl);
  }, [volume, customSoundUrl]);

  const markAllRead = useCallback(() => {
    notifications.forEach(n => seenIdsRef.current.add(n.id));
    saveSeen();
    setUnreadCount(0);
  }, [notifications, saveSeen]);

  const dismissNotification = useCallback((id: number) => {
    seenIdsRef.current.add(id);
    saveSeen();
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [saveSeen]);

  const clearAll = useCallback(() => {
    notifications.forEach(n => seenIdsRef.current.add(n.id));
    saveSeen();
    setNotifications([]);
    setUnreadCount(0);
  }, [notifications, saveSeen]);

  const poll = useCallback(async () => {
    setIsPolling(true);
    try {
      // Use synced_at-based endpoint to find tickets recently synced into DB
      const since = lastPollTime || new Date(Date.now() - POLL_INTERVAL).toISOString();
      const result = await api.getRecentlySynced(since);

      const newTickets: NewTicketNotification[] = [];
      for (const t of result.tickets) {
        if (!seenIdsRef.current.has(t.id)) {
          newTickets.push({
            id: t.id,
            subject: t.subject,
            customer: t.customer,
            priority: t.priority,
            created_time: t.created_time,
          });
        }
      }

      if (newTickets.length > 0 && initializedRef.current) {
        setNotifications(prev => [...newTickets, ...prev].slice(0, 50));
        setUnreadCount(prev => prev + newTickets.length);
        if (soundEnabled) playNotificationSound(volume, customSoundUrl);
      }

      // Mark these as seen for next poll
      for (const t of result.tickets) {
        seenIdsRef.current.add(t.id);
      }
      saveSeen();

      const now = new Date().toISOString();
      setLastPollTime(now);
      try { localStorage.setItem(LAST_POLL_KEY, now); } catch { /* ignore */ }

      // After first poll, mark initialized — subsequent polls will trigger notifications
      if (!initializedRef.current) initializedRef.current = true;
    } catch {
      // silent fail
    } finally {
      setIsPolling(false);
    }
  }, [soundEnabled, volume, customSoundUrl, lastPollTime, saveSeen]);

  // Initial poll on mount — sets baseline without triggering notifications
  useEffect(() => {
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 3 minutes
  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  // Expose pollNow so other components (e.g. sync button) can trigger a check
  const pollNow = useCallback(() => {
    // Small delay to let backend finish processing
    setTimeout(poll, 3000);
  }, [poll]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        soundEnabled,
        toggleSound,
        markAllRead,
        dismissNotification,
        clearAll,
        lastPollTime,
        isPolling,
        pollNow,
        volume,
        setVolume,
        customSoundName,
        setCustomSound,
        testSound,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
