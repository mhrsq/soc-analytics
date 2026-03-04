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
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL = 3 * 60 * 1000; // 3 minutes
const SOUND_KEY = "soc-notif-sound";
const SEEN_KEY = "soc-notif-seen-ids";
const LAST_POLL_KEY = "soc-notif-last-poll";

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    // Second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.6);
  } catch { /* ignore audio errors */ }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NewTicketNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== "false"; }
    catch { return true; }
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
        if (soundEnabled) playNotificationSound();
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
  }, [soundEnabled, lastPollTime, saveSeen]);

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
