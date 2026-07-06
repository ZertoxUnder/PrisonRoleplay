import { popup, database, changePanel, config, setStatus } from '../utils.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

        this.getOffline();
    }

    async getOffline() {
        console.log('Initializing offline login...');
        let popupLogin = new popup();

        let usernameInput = document.querySelector('.offline-username');
        let connectBtn = document.querySelector('.connect-offline');

        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') connectBtn.click();
        });

        connectBtn.addEventListener("click", async () => {
            const username = usernameInput.value.trim();

            if (!username || !/^\w{3,16}$/.test(username)) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Le pseudonyme doit contenir entre 3 et 16 caractères (lettres, chiffres, underscore)',
                    color: '#DC8436',
                    options: true
                });
                return;
            }

            const crypto = require('crypto');
            const connectionData = {
                access_token: crypto.randomBytes(16).toString('hex'),
                client_token: crypto.randomBytes(16).toString('hex'),
                uuid: this.generateOfflineUUID(username),
                name: username,
                user_properties: '{}',
                meta: {
                    online: false,
                    type: 'Mojang'
                }
            };

            await this.saveData(connectionData);
        });
    }

    // ── UUID offline (format Minecraft) ───────────────────────────────
    generateOfflineUUID(username) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
        return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
    }

    // ── Sauvegarde du compte et redirection ───────────────────────────
    async saveData(connectionData) {
        let usernameInput = document.querySelector('.offline-username');
        if (usernameInput) usernameInput.value = '';

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
