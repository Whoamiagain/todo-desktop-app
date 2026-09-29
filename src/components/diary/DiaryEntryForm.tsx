import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { decryptText, encryptText } from '../../lib/encryption';
import { executeSql, getCoupleRecord, getLocalDiaryEntries, parseArray, saveLocalDiaryEntry, selectSql } from '../../lib/localDb';
import { getDayOfWeekString, getLogicalDate } from '../../lib/dateUtils';
import { queueOfflineChange } from '../../lib/syncEngine';
import type { DiaryEntry } from '../../types';

const DIARY_TASK_TITLE = "Write Daily Couple's Diary";

interface DiaryEntryFormProps {
	coupleId?: string;
	entry?: DiaryEntry;
	onProgressUpdated?: (percentage: number) => void;
	onSaved?: (entry: DiaryEntry) => void;
}

interface DailyTaskRow {
	id: string;
	user_id: string;
	title: string;
	active_days: string;
	is_completed: number;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

function createId(): string {
	return globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

const DiaryEntryForm: React.FC<DiaryEntryFormProps> = ({ coupleId, entry: initialEntry, onProgressUpdated, onSaved }) => {
	const { user } = useAuth();
	const { showUndoToast } = useToast();
	const currentLogicalDate = getLogicalDate(new Date());
	const [resolvedCoupleId, setResolvedCoupleId] = useState(coupleId ?? '');
	const [entryId, setEntryId] = useState<string | null>(null);
	const [entryDate, setEntryDate] = useState(currentLogicalDate);
	const [createdAt, setCreatedAt] = useState<string | null>(null);
	const [body, setBody] = useState('');
	const [progressPercentage, setProgressPercentage] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLocked = entryDate < currentLogicalDate;

	useEffect(() => {
		if (!user) return;
		let mounted = true;

		const loadEntry = async () => {
			try {
				const activeCoupleId = coupleId || initialEntry?.couple_id || (await getCoupleRecord(user.id))?.id;
				if (!activeCoupleId) return;
				const entries = await getLocalDiaryEntries(activeCoupleId);
				const currentEntry = initialEntry ?? entries.find((entry) => entry.date === currentLogicalDate);
				if (!mounted) return;
				setResolvedCoupleId(activeCoupleId);
				if (currentEntry) {
					setEntryId(currentEntry.id);
					setEntryDate(currentEntry.date);
					setCreatedAt(currentEntry.created_at);
					setBody(await decryptText(currentEntry.encrypted_body, currentEntry.iv, user.id));
				}
			} catch {
				if (mounted) setError('Unable to load today\'s diary entry.');
			} finally {
				if (mounted) setIsLoading(false);
			}
		};

		void loadEntry();
		return () => {
			mounted = false;
		};
	}, [coupleId, currentLogicalDate, initialEntry, user]);

	const saveEntry = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!user || !resolvedCoupleId || !body.trim() || isLocked || isSaving) return;

		setError(null);
		setIsSaving(true);
		try {
			const now = new Date().toISOString();
			const encrypted = await encryptText(body.trim(), user.id);
			const entry: DiaryEntry = {
				id: entryId ?? createId(),
				couple_id: resolvedCoupleId,
				user_id: user.id,
				date: currentLogicalDate,
				encrypted_body: encrypted.ciphertext,
				iv: encrypted.iv,
				created_at: createdAt ?? now,
				updated_at: now,
				deleted_at: null,
			};

			await saveLocalDiaryEntry(entry);
			await queueOfflineChange('diary_entries', entry.id, entryId ? 'UPDATE' : 'INSERT', entry as unknown as Record<string, unknown>, now);

			const taskRows = await selectSql<DailyTaskRow>(
				'SELECT * FROM daily_tasks WHERE user_id = ? AND title = ? AND deleted_at IS NULL',
				[user.id, DIARY_TASK_TITLE],
			);
			const diaryTask = taskRows[0];
			if (diaryTask && Number(diaryTask.is_completed) !== 1) {
				await executeSql('UPDATE daily_tasks SET is_completed = ?, updated_at = ? WHERE id = ?', [1, now, diaryTask.id]);
				await queueOfflineChange('daily_tasks', diaryTask.id, 'UPDATE', { ...diaryTask, is_completed: 1, updated_at: now, active_days: parseArray(diaryTask.active_days) }, now);
			}

			const logicalDay = getDayOfWeekString(new Date());
			const allTasks = await selectSql<DailyTaskRow>(
				'SELECT * FROM daily_tasks WHERE user_id = ? AND deleted_at IS NULL',
				[user.id],
			);
			const activeTasks = allTasks.filter((task) => parseArray(task.active_days).includes(logicalDay));
			const finishedCount = activeTasks.filter((task) => task.id === diaryTask?.id ? true : Number(task.is_completed) === 1).length;
			const totalCount = activeTasks.length;
			const percentage = totalCount === 0 ? 100 : (finishedCount / totalCount) * 100;
			const historyRows = await selectSql<{ id: string }>('SELECT id FROM daily_history WHERE user_id = ? AND date = ?', [user.id, currentLogicalDate]);
			if (historyRows[0]) {
				await executeSql('UPDATE daily_history SET finished_count = ?, total_count = ?, percentage = ?, updated_at = ? WHERE id = ?', [finishedCount, totalCount, percentage, now, historyRows[0].id]);
			} else {
				await executeSql('INSERT INTO daily_history (id, user_id, date, finished_count, total_count, percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [createId(), user.id, currentLogicalDate, finishedCount, totalCount, percentage, now, now]);
			}

			setEntryId(entry.id);
			setProgressPercentage(percentage);
			onProgressUpdated?.(percentage);
			onSaved?.(entry);
			showUndoToast('Diary saved & Daily Task completed!', async () => undefined);
			if (percentage >= 100 && totalCount > 0) {
				try {
					const confetti = (await import('canvas-confetti')).default;
					confetti({ particleCount: 150, spread: 60 });
				} catch {
					// Confetti is decorative; saving must still succeed if it cannot load.
				}
			}
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'Unable to save diary entry.');
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) return <div className="diary-card">Loading diary entry...</div>;
	if (error && !body) return <div className="diary-card text-rose-700">{error}</div>;

	return (
		<form className="diary-card" onSubmit={(event) => void saveEntry(event)}>
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-diary-accent">Today&apos;s entry</p>
					<h2 className="mt-1 text-xl font-semibold">{currentLogicalDate}</h2>
				</div>
				{isLocked && <span className="rounded-full border border-diary-border bg-diary-bg px-3 py-1 text-xs text-rose-700">🔒 Entry locked after 2:00 AM reset</span>}
			</div>
			<textarea
				className="mt-5 min-h-48 w-full resize-y rounded-xl border border-diary-border bg-diary-bg p-4 text-rose-950 outline-none placeholder:text-rose-400 focus:border-diary-accent"
				disabled={isLocked || isSaving}
				onChange={(event) => setBody(event.target.value)}
				placeholder="Write about your day together..."
				value={body}
			/>
			{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
			<div className="mt-5 flex items-center justify-between gap-4">
				{progressPercentage !== null && <span className="text-sm text-rose-700">Daily progress: {Math.round(progressPercentage)}%</span>}
				<button type="submit" className="ml-auto rounded-full bg-diary-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-diary-accent-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={isLocked || isSaving || !body.trim() || !resolvedCoupleId}>
					{isSaving ? 'Saving...' : 'Save Entry'}
				</button>
			</div>
		</form>
	);
};

export default DiaryEntryForm;