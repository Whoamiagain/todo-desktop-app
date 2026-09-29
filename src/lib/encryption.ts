const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const APP_SECRET = import.meta.env.VITE_APP_SECRET as string | undefined;
const textEncoder = new TextEncoder();

function getAppSecret(): string {
	if (!APP_SECRET) {
		throw new Error('VITE_APP_SECRET is required for diary encryption.');
	}
	return APP_SECRET;
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function deriveEncryptionKey(userId: string): Promise<CryptoKey> {
	const secretMaterial = textEncoder.encode(`${userId}:${getAppSecret()}`);
	const salt = textEncoder.encode(`todo-desktop-app:diary:${userId}`);
	const masterKey = await globalThis.crypto.subtle.importKey('raw', secretMaterial, 'PBKDF2', false, ['deriveKey']);

	return globalThis.crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		masterKey,
		{ name: 'AES-GCM', length: KEY_LENGTH },
		false,
		['encrypt', 'decrypt'],
	);
}

export async function encryptText(plainText: string, userId: string): Promise<{ ciphertext: string; iv: string }> {
	const iv = new Uint8Array(IV_LENGTH);
	globalThis.crypto.getRandomValues(iv);
	const key = await deriveEncryptionKey(userId);
	const encrypted = await globalThis.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		textEncoder.encode(plainText),
	);

	return {
		ciphertext: toBase64(new Uint8Array(encrypted)),
		iv: toBase64(iv),
	};
}

export async function decryptText(ciphertext: string, iv: string, userId: string): Promise<string> {
	try {
		const key = await deriveEncryptionKey(userId);
		const decrypted = await globalThis.crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(iv) },
			key,
			fromBase64(ciphertext),
		);
		return new TextDecoder().decode(decrypted);
	} catch {
		return '[Unable to decrypt entry]';
	}
}