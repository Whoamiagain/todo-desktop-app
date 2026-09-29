import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCoupleRecord, saveCoupleRecord } from '../../lib/localDb';
import { supabase } from '../../lib/supabase';
import type { Couple } from '../../types';

const INVITE_CODE_LENGTH = 6;
const INVITE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIARY_WORKSPACE_LABEL = 'Diary Workspace';

interface CouplePairingProps {
	onLinked?: (couple: Couple) => void;
	startNew?: boolean;
}

function createInviteCode(): string {
	const values = new Uint32Array(INVITE_CODE_LENGTH);
	globalThis.crypto.getRandomValues(values);
	return Array.from(values, (value) => INVITE_CHARACTERS[value % INVITE_CHARACTERS.length]).join('');
}

const CouplePairing: React.FC<CouplePairingProps> = ({ onLinked, startNew = false }) => {
	const { user } = useAuth();
	const [couple, setCouple] = useState<Couple | null>(null);
	const [mode, setMode] = useState<'choice' | 'generate' | 'enter' | 'workspace'>('choice');
	const [inviteCode, setInviteCode] = useState('');
	const [enteredCode, setEnteredCode] = useState<string[]>(Array(INVITE_CODE_LENGTH).fill(''));
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!user) return;
		if (startNew) {
			setIsLoading(false);
			setMode('choice');
			return;
		}
		void getCoupleRecord(user.id)
			.then((existingCouple) => {
				setCouple(existingCouple);
				setMode(existingCouple ? 'workspace' : 'choice');
			})
			.catch(() => setError('Unable to load your couple record.'))
			.finally(() => setIsLoading(false));
	}, [startNew, user]);

	const handleGenerateCode = async () => {
		if (!user) return;
		setError(null);
		setIsSubmitting(true);

		try {
			const now = new Date().toISOString();
			const newCouple: Couple = {
				id: globalThis.crypto.randomUUID(),
				user1_id: user.id,
				user2_id: null,
				invite_code: createInviteCode(),
				created_at: now,
				updated_at: now,
			};
			const { data, error: insertError } = await supabase.from('couples').insert(newCouple).select().single();
			if (insertError || !data) throw insertError ?? new Error('Unable to create invite code.');

			const savedCouple = data as Couple;
			await saveCoupleRecord(savedCouple);
			setCouple(savedCouple);
			setInviteCode(savedCouple.invite_code);
			onLinked?.(savedCouple);
			setMode('generate');
		} catch {
			setError('Unable to generate invite code. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleEnterCode = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!user) return;

		const code = enteredCode.join('').toUpperCase();
		if (code.length !== INVITE_CODE_LENGTH) {
			setError('Invalid invite code. Please check and try again.');
			return;
		}

		setError(null);
		setIsSubmitting(true);
		try {
			const { data, error: lookupError } = await supabase
				.from('couples')
				.select('*')
				.eq('invite_code', code)
				.is('user2_id', null)
				.maybeSingle();
			if (lookupError || !data || data.user1_id === user.id) throw lookupError ?? new Error('Invalid invite code.');

			const { data: updatedData, error: updateError } = await supabase
				.from('couples')
				.update({ user2_id: user.id, updated_at: new Date().toISOString() })
				.eq('id', data.id)
				.is('user2_id', null)
				.select()
				.single();
			if (updateError || !updatedData) throw updateError ?? new Error('Unable to link couple.');

			const linkedCouple = updatedData as Couple;
			await saveCoupleRecord(linkedCouple);
			setCouple(linkedCouple);
			setMode('workspace');
			onLinked?.(linkedCouple);
		} catch {
			setError('Invalid invite code. Please check and try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const updateCodeDigit = (index: number, value: string) => {
		const character = value.slice(-1).toUpperCase();
		setEnteredCode((current) => current.map((digit, digitIndex) => digitIndex === index ? character : digit));
	};

	if (isLoading) return <div className="diary-card mx-auto max-w-lg text-center">Loading couple pairing...</div>;
	if (mode === 'workspace' && couple) {
		return <div className="diary-card mx-auto max-w-lg"><h2 className="text-xl font-semibold">{DIARY_WORKSPACE_LABEL}</h2><p className="mt-2 text-rose-800/70">Your couple is linked and ready for diary entries.</p></div>;
	}

	return (
		<div className={`diary-card mx-auto max-w-lg ${error ? 'animate-shake' : ''}`}>
			<h2 className="text-xl font-semibold">Couple Diary</h2>
			{error && <div role="alert" className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

			{mode === 'choice' && (
				<div className="mt-6 grid gap-3 sm:grid-cols-2">
					<button type="button" className="btn-rounded" onClick={() => void handleGenerateCode()} disabled={isSubmitting}>Generate Invite Code</button>
					<button type="button" className="btn-rounded-secondary" onClick={() => { setError(null); setMode('enter'); }}>Enter Partner&apos;s Code</button>
				</div>
			)}

			{mode === 'generate' && couple && (
				<div className="mt-6 text-center">
					<p className="text-sm text-slate-300">Share this code with your partner</p>
					<p className="mt-3 font-mono text-4xl font-bold tracking-[0.35em] text-blue-200">{inviteCode}</p>
					<button type="button" className="btn-rounded-secondary mx-auto mt-6" onClick={() => setMode('workspace')}>Continue to Diary</button>
				</div>
			)}

			{mode === 'enter' && (
				<form className="mt-6" onSubmit={(event) => void handleEnterCode(event)}>
					<div className="flex justify-center gap-2">
						{enteredCode.map((digit, index) => (
							<input
								key={index}
								aria-label={`Invite code character ${index + 1}`}
								className="h-12 w-10 rounded-lg border border-slate-600 bg-slate-900 text-center font-mono text-xl text-white outline-none focus:border-blue-400"
								maxLength={1}
								onChange={(event) => updateCodeDigit(index, event.target.value)}
								value={digit}
							/>
						))}
					</div>
					<button type="submit" className="btn-rounded mx-auto mt-6" disabled={isSubmitting}>Link Partner</button>
				</form>
			)}
		</div>
	);
};

export default CouplePairing;