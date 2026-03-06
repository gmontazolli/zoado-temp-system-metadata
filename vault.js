/**
 * DKNOTES - Vault (estilo Bitwarden)
 * Senha mestra, PBKDF2, AES-GCM. Lock em vez de logout.
 */
(function(window) {
    const VAULT_META_KEY = 'dknotes_vault_meta_offline_user';
    const VAULT_DATA_KEY = 'dknotes_vault_data_offline_user';
    const VERIFICATION_HEADER = 'DKNOTES_VAULT_OK';
    const PBKDF2_ITERATIONS = 100000;

    const getMeta = () => {
        try {
            const raw = localStorage.getItem(VAULT_META_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    };
    const saveMeta = (meta) => localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));
    const getVaultData = () => {
        try {
            const raw = localStorage.getItem(VAULT_DATA_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    };
    const saveVaultData = (data) => localStorage.setItem(VAULT_DATA_KEY, JSON.stringify(data));

    const deriveKey = async (password, salt) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    };

    const encryptPayload = async (payload, key) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const plain = enc.encode(JSON.stringify(payload));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            plain
        );
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        // Converter em blocos para evitar "Maximum call stack size exceeded" com payloads grandes
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < combined.length; i += chunkSize) {
            const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    };

    const decryptPayload = async (encryptedB64, key) => {
        const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
    };

    window.DKNOTES_Vault = {
        hasVault: () => !!getVaultData()?.salt,
        isLocked: () => !window._vaultKey,
        getMeta,
        saveMeta,
        getLockTimeoutMs: () => {
            const m = getMeta();
            if (!m || m.lockTimeout === undefined) return 5 * 60 * 1000; // 5 min default
            if (m.lockTimeout === 0) return 0;   // Imediatamente (minimizar)
            if (m.lockTimeout === -1) return -1; // Nunca
            return m.lockTimeout; // ms
        },
        setLockTimeout: (ms) => {
            const meta = getMeta() || {};
            meta.lockTimeout = ms;
            saveMeta(meta);
        },
        createVault: async (password, payload) => {
            const salt = crypto.randomUUID() + crypto.randomUUID();
            const key = await deriveKey(password, salt);
            const toEncrypt = { header: VERIFICATION_HEADER, ...payload };
            const encrypted = await encryptPayload(toEncrypt, key);
            saveVaultData({ salt, encrypted });
            saveMeta({ lockTimeout: 5 * 60 * 1000 }); // 5 min default
            window._vaultKey = key;
            return key;
        },
        unlock: async (password) => {
            const vd = getVaultData();
            if (!vd?.salt || !vd?.encrypted) return { error: 'Nenhum cofre encontrado.' };
            try {
                const key = await deriveKey(password, vd.salt);
                const decrypted = await decryptPayload(vd.encrypted, key);
                if (decrypted.header !== VERIFICATION_HEADER) return { error: 'Senha incorreta.' };
                window._vaultKey = key;
                delete decrypted.header;
                return { payload: decrypted };
            } catch (_) {
                return { error: 'Senha incorreta.' };
            }
        },
        saveEncrypted: async (payload) => {
            if (!window._vaultKey) return;
            const vd = getVaultData();
            if (!vd?.salt) return;
            try {
                const toEncrypt = { header: VERIFICATION_HEADER, ...payload };
                const encrypted = await encryptPayload(toEncrypt, window._vaultKey);
                saveVaultData({ salt: vd.salt, encrypted });
            } catch (_) {}
        },
        lock: async (savePayload) => {
            if (!window._vaultKey) return;
            const vd = getVaultData();
            if (!vd?.salt || !savePayload) {
                window._vaultKey = null;
                return;
            }
            try {
                const toEncrypt = { header: VERIFICATION_HEADER, ...savePayload };
                const encrypted = await encryptPayload(toEncrypt, window._vaultKey);
                saveVaultData({ salt: vd.salt, encrypted });
            } catch (_) {}
            window._vaultKey = null;
        },
        getKey: () => window._vaultKey,
        clearKey: () => { window._vaultKey = null; }
    };
})(window);
