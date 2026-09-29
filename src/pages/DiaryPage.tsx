import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CouplePairing from '../components/diary/CouplePairing';
import DiaryEntryForm from '../components/diary/DiaryEntryForm';
import BreakUpModal from '../components/diary/BreakUpModal';
import DiaryHistoryTimeline from '../components/diary/DiaryHistoryTimeline';
import { getCoupleRecord } from '../lib/localDb';
import type { Couple } from '../types';

const DiaryPage: React.FC = () => {
  const { user } = useAuth();
  const [couple, setCouple] = useState<Couple | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoriesMode, setIsMemoriesMode] = useState(false);
  const [isPairingNewPartner, setIsPairingNewPartner] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getCoupleRecord(user.id)
      .then((record) => {
        const localRecord = record as (Couple & { status?: string }) | null;
        setCouple(localRecord);
        setIsMemoriesMode(localRecord?.status === 'unlinked');
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-diary-accent">Couple&apos;s Diary</p>
        <h1 className="mt-2 text-3xl font-bold text-rose-950">A private space for both of you</h1>
        <p className="mx-auto mt-3 max-w-xl text-rose-800/70">Link your couple account to begin sharing encrypted diary entries.</p>
      </div>
      {isLoading ? (
        <div className="diary-card mx-auto max-w-lg text-center">Loading couple diary...</div>
      ) : isMemoriesMode && couple && !isPairingNewPartner ? (
        <div className="space-y-6">
          <div className="diary-card mx-auto max-w-3xl border-diary-accent/40 bg-diary-bg">
            <p className="text-sm font-semibold text-diary-accent">Memories Mode (Unlinked) — Past entries are preserved locally on this device.</p>
            <button type="button" className="mt-4 rounded-full bg-diary-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-diary-accent-hover" onClick={() => setIsPairingNewPartner(true)}>Link with a New Partner</button>
          </div>
          <DiaryHistoryTimeline userId={user.id} />
        </div>
      ) : couple && !isPairingNewPartner ? (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="rounded-full border border-diary-border px-4 py-2 text-sm text-rose-800 transition hover:bg-diary-bg" onClick={() => setIsSettingsOpen(true)}>Diary Settings</button>
          </div>
          <DiaryEntryForm coupleId={couple.id} />
          <BreakUpModal coupleId={couple.id} isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onUnlinked={() => setIsMemoriesMode(true)} />
        </>
      ) : (
        <CouplePairing startNew={isPairingNewPartner} onLinked={(newCouple) => {
          setCouple(newCouple);
          setIsMemoriesMode(false);
          setIsPairingNewPartner(false);
        }} />
      )}
    </section>
  );
};

export default DiaryPage;