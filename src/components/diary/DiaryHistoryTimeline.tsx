import React, { useEffect, useState } from 'react';
import { decryptText } from '../../lib/encryption';
import { getActiveCouple, getAllLocalDiaryEntries } from '../../lib/localDb';
import type { Couple, DiaryEntry, DecryptedDiaryEntry } from '../../types';

interface DiaryHistoryTimelineProps {
	userId: string;
}

const DiaryHistoryTimeline: React.FC<DiaryHistoryTimelineProps> = ({ userId }) => {
	const [entries, setEntries] = useState<DecryptedDiaryEntry[]>([]);
	const [activeCouple, setActiveCouple] = useState<Couple | null>(null);
	const [selectedDate, setSelectedDate] = useState('');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let mounted = true;
		void Promise.all([getAllLocalDiaryEntries(), getActiveCouple()])
			.then(async ([localEntries, currentCouple]) => {
				const decryptedEntries = await Promise.all(localEntries.map(async (entry: DiaryEntry): Promise<DecryptedDiaryEntry> => ({
					id: entry.id,
					couple_id: entry.couple_id,
					user_id: entry.user_id,
					date: entry.date,
					body: await decryptText(entry.encrypted_body, entry.iv, entry.user_id),
					is_locked: true,
					created_at: entry.created_at,
					updated_at: entry.updated_at,
				})));
				if (!mounted) return;
				setEntries(decryptedEntries);
				setActiveCouple(currentCouple);
				setSelectedDate(decryptedEntries[0]?.date ?? '');
			})
			.finally(() => {
				if (mounted) setIsLoading(false);
			});

		return () => {
			mounted = false;
		};
	}, [userId]);

	const selectedEntry = entries.find((entry) => entry.date === selectedDate);
	const selectedEntries = entries.filter((entry) => entry.date === selectedDate);
	const dates = [...new Set(entries.map((entry) => entry.date))];

	if (isLoading) return <div className="diary-card">Loading memories...</div>;

	return (
		<section className="diary-card">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-diary-accent">Read-only memories</p>
					<h2 className="mt-1 text-xl font-semibold">Diary history</h2>
				</div>
				<label className="flex items-center gap-2 text-sm text-rose-800" htmlFor="memory-date">Date
					<select id="memory-date" className="rounded-lg border border-diary-border bg-diary-bg px-3 py-2 text-rose-950" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} disabled={entries.length === 0}>
						{dates.length === 0 ? <option value="">No entries</option> : dates.map((date) => <option key={date} value={date}>{date}</option>)}
					</select>
				</label>
			</div>
			{selectedEntry ? (
				<div className="mt-6 space-y-4">
					{selectedEntries.map((entry) => (
						<article key={entry.id} className="rounded-xl border border-diary-border bg-diary-bg p-4">
							<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-rose-700">
								<span>{entry.user_id === userId ? 'Your entry' : 'Partner entry'}</span>
								<span className="flex items-center gap-2"><time dateTime={entry.date}>{entry.date}</time><span>🔒 Read-only</span></span>
							</div>
							{entry.couple_id !== activeCouple?.id && <p className="mt-3 text-xs font-medium text-rose-700">Memory from past journal log</p>}
							<p className="mt-4 whitespace-pre-wrap text-rose-950">{entry.body}</p>
						</article>
					))}
				</div>
			) : <p className="mt-6 text-sm text-rose-800/70">No saved diary entries yet.</p>}
		</section>
	);
};

export default DiaryHistoryTimeline;