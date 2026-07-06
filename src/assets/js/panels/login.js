const fetch = require('node-fetch');

import { popup, database, changePanel, config, setStatus } from '../utils.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

        // Stockage temporaire des credentials pendant le flow A2F
        this._pendingEmail = null;
        this._pendingPassword = null;

        this.getAzuriom();
    }

    async getAzuriom() {
        console.log('Initializing Azuriom login...');
        let popupLogin = new popup();

        // Panneau principal
        let loginHome   = document.querySelector('.login-home');
        let azuriomBtn  = document.querySelector('.connect-azuriom');
        let registerLink = document.querySelector('.azuriom-register-link');
        let emailInput  = document.querySelector('.azuriom-email');
        let passwordInput = document.querySelector('.azuriom-password');

        // Panneau A2F
        let login2fa    = document.querySelector('.login-2fa');
        let codeInput   = document.querySelector('.azuriom-2fa-code');
        let validate2fa = document.querySelector('.connect-2fa');
        let cancel2fa   = document.querySelector('.cancel-2fa');

        // Afficher le panneau principal
        loginHome.style.display = 'block';
        login2fa.style.display  = 'none';

        // ── Bouton afficher/masquer mot de passe ───────────────────────
        let togglePasswordBtn = document.querySelector('.toggle-password');
        let eyeIcon = togglePasswordBtn.querySelector('.eye-icon');

        togglePasswordBtn.addEventListener('click', () => {
            const isHidden = passwordInput.type === 'password';
            passwordInput.type = isHidden ? 'text' : 'password';
            eyeIcon.classList.toggle('eye-closed', !isHidden);
            eyeIcon.classList.toggle('eye-open',   isHidden);
        });

        // ── Lien d'inscription ─────────────────────────────────────────
        registerLink.addEventListener("click", (e) => {
            e.preventDefault();
            const azuriomUrl = this.config.azuriom_url || this.config.url;
            if (azuriomUrl) {
                require('electron').shell.openExternal(`${azuriomUrl}/user/register`);
            } else {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'URL du site non configurée',
                    color: '#DC8436',
                    options: true
                });
            }
        });

        // ── Touche Entrée sur email ou mot de passe ────────────────────
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') passwordInput.focus();
        });

        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') azuriomBtn.click();
        });

        // ── Bouton Connexion ───────────────────────────────────────────
        azuriomBtn.addEventListener("click", async () => {
            const email    = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Veuillez remplir tous les champs',
                    color: '#DC8436',
                    options: true
                });
                return;
            }

            popupLogin.openPopup({
                title: 'Connexion',
                content: 'Authentification en cours...',
                color: '#F5F5F5'
            });

            try {
                const result = await this.authenticateAzuriom(email, password);

                // ── Compte banni ───────────────────────────────────────
                if (result.banned) {
                    popupLogin.openPopup({
                        title: '⛓ Compte banni',
                        content: result.reason
                            ? `Votre compte a été banni du serveur.<br><br><b>Raison :</b> ${result.reason}`
                            : `Votre compte a été banni du serveur.<br>Contactez un administrateur pour plus d'informations.`,
                        color: '#DC8436',
                        options: true
                    });
                    return;
                }

                // ── Le serveur demande le code A2F ─────────────────────
                if (result.requires2fa) {
                    popupLogin.closePopup();
                    this._pendingEmail    = email;
                    this._pendingPassword = password;

                    // Transition vers le panneau A2F
                    loginHome.style.display = 'none';
                    login2fa.style.display  = 'block';
                    codeInput.value = '';
                    codeInput.focus();
                    return;
                }

                // ── Erreur classique ───────────────────────────────────
                if (result.error) {
                    popupLogin.openPopup({
                        title: 'Erreur',
                        content: result.message || 'Échec de l\'authentification',
                        color: '#DC8436',
                        options: true
                    });
                    return;
                }

                // ── Connexion réussie ──────────────────────────────────
                await this.saveData(result);
                popupLogin.closePopup();

            } catch (err) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: err.message || 'Erreur de connexion au serveur Azuriom',
                    color: '#DC8436',
                    options: true
                });
            }
        });

        // ── Bouton Valider (A2F) ───────────────────────────────────────
        validate2fa.addEventListener("click", async () => {
            const code = codeInput.value.trim().replace(/\s/g, '');

            if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Le code A2F doit contenir exactement 6 chiffres',
                    color: '#DC8436',
                    options: true
                });
                return;
            }

            popupLogin.openPopup({
                title: 'Vérification A2F',
                content: 'Validation du code en cours...',
                color: '#F5F5F5'
            });

            try {
                const result = await this.authenticateAzuriom(
                    this._pendingEmail,
                    this._pendingPassword,
                    code
                );

                if (result.error) {
                    popupLogin.openPopup({
                        title: 'Code invalide',
                        content: result.message || 'Code A2F incorrect ou expiré',
                        color: '#DC8436',
                        options: true
                    });
                    codeInput.value = '';
                    codeInput.focus();
                    setTimeout(() => {
                        popupLogin.closePopup();
                    }, 3000);
                    return;
                }

                // Connexion réussie — nettoyer les credentials temporaires
                this._pendingEmail    = null;
                this._pendingPassword = null;

                await this.saveData(result);
                popupLogin.closePopup();

            } catch (err) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: err.message || 'Erreur lors de la vérification du code A2F',
                    color: '#DC8436',
                    options: true
                });
            }
        });

        // ── Entrée clavier sur le champ code (touche Entrée) ──────────
        codeInput.addEventListener("keydown", (e) => {
            if (e.key === 'Enter') validate2fa.click();
        });

        // ── Saisie numérique uniquement dans le champ code ─────────────
        codeInput.addEventListener("input", () => {
            codeInput.value = codeInput.value.replace(/[^0-9]/g, '').slice(0, 6);
        });

        // ── Bouton Retour (A2F) ────────────────────────────────────────
        cancel2fa.addEventListener("click", () => {
            this._pendingEmail    = null;
            this._pendingPassword = null;
            codeInput.value = '';
            login2fa.style.display  = 'none';
            loginHome.style.display = 'block';
            passwordInput.value = '';
            passwordInput.focus();
        });
    }

    // ── Authentification Azuriom (avec ou sans code A2F) ──────────────
    async authenticateAzuriom(email, password, code = null) {
        const azuriomUrl = this.config.azuriom_url || this.config.url;

        if (!azuriomUrl) {
            return { error: true, message: 'URL Azuriom non configurée' };
        }

        const body = { email, password };
        if (code) body.code = code;

        try {
            const response = await fetch(`${azuriomUrl}/api/auth/authenticate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            // ── Compte banni ───────────────────────────────────────────
            const msg = (data.message || '').toLowerCase();
            if (
                data.reason  === 'banned'  ||
                data.banned  === true      ||
                data.error   === 'banned'  ||
                msg.includes('banned')     ||
                msg.includes('banni')      ||
                msg.includes('suspendu')   ||
                msg.includes('suspended')
            ) {
                return {
                    banned: true,
                    reason: this.extractBanReason(data)
                };
            }

            // ── Le serveur demande le code A2F ─────────────────────────
            // Seulement si on n'a PAS déjà envoyé un code — sinon c'est
            // forcément une erreur (mauvais code) et non une demande de 2FA
            if (!code && (
                data.status === 'pending' ||
                data.reason  === '2fa'    ||
                data.error   === '2fa_required' ||
                (data.message && data.message.toLowerCase().includes('2fa')) ||
                (data.message && data.message.toLowerCase().includes('two-factor'))
            )) {
                return { requires2fa: true };
            }

            // ── Erreur classique ───────────────────────────────────────
            if (!response.ok || data.status === 'error' || data.error) {
                return {
                    error: true,
                    message: data.message || 'Identifiants incorrects'
                };
            }

            // ── Succès ─────────────────────────────────────────────────
            return {
                name:         data.username || data.name || email,
                uuid:         data.uuid || this.generateOfflineUUID(data.username || email),
                access_token: data.access_token || 'azuriom_token',
                meta: {
                    type: 'Azuriom',
                    demo: false
                },
                error: false
            };

        } catch (error) {
            console.error('Erreur Azuriom:', error);
            return {
                error: true,
                message: 'Impossible de se connecter au serveur Azuriom'
            };
        }
    }

    // ── Extraction de la vraie raison de bannissement ─────────────────
    extractBanReason(data) {
        // Codes internes bruts à ignorer (sans signification pour l'utilisateur)
        const RAW_CODES = ['userbanned', 'banned', 'suspended', 'suspendu', 'user_banned', 'ban', 'true'];

        // On essaie les champs dans l'ordre du plus précis au moins précis
        const candidates = [
            data.ban_reason,
            data.reason_message,
            data.ban_message,
            // data.reason seulement s'il ne vaut pas 'banned' (champ technique)
            data.reason !== 'banned' && data.reason !== 'ban' ? data.reason : null,
            data.message
        ];

        for (const candidate of candidates) {
            if (!candidate) continue;
            const clean = String(candidate).trim();
            if (clean && !RAW_CODES.includes(clean.toLowerCase())) {
                return clean;
            }
        }

        // Aucune raison lisible trouvée → message générique affiché côté UI
        return null;
    }

    // ── UUID offline (format Minecraft) ───────────────────────────────
    generateOfflineUUID(username) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
        return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
    }

    // ── Sauvegarde du compte et redirection ───────────────────────────
    async saveData(connectionData) {
        // Remettre le panel login dans son état initial pour la prochaine visite
        let loginHome     = document.querySelector('.login-home');
        let login2fa      = document.querySelector('.login-2fa');
        let emailInput    = document.querySelector('.azuriom-email');
        let passwordInput = document.querySelector('.azuriom-password');
        let codeInput     = document.querySelector('.azuriom-2fa-code');
        if (loginHome)     loginHome.style.display = 'block';
        if (login2fa)      login2fa.style.display  = 'none';
        if (emailInput)    emailInput.value    = '';
        if (passwordInput) passwordInput.value = '';
        if (codeInput)     codeInput.value     = '';

        let configClient  = await this.db.readData('configClient');
        let account       = await this.db.createData('accounts', connectionData);
        let instanceSelect = configClient.instance_selct;
        let instancesList  = await config.getInstanceList();
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(w => w == account.name);
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false) || instancesList[0];
                        if (newInstanceSelect) {
                            configClient.instance_selct = newInstanceSelect.name;
                            await setStatus(newInstanceSelect.status);
                        }
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        changePanel('home');
    }
}

export default Login;
