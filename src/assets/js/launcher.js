import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';

import { logger, config, changePanel, database, popup, pkg } from './utils.js';

const { ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');

class Launcher {
    async init() {
        this.initLog();
        console.log('Initializing Launcher...');
        this.shortcut();
        this.setBackground();
        this.initFrame();
        this.config = await config.GetConfig().then(res => res).catch(err => err);
        if (await this.config.error) return this.errorConnect();
        this.db = new database();
        await this.initConfigClient();
        this.createPanels(Login, Home, Settings);
        this.startLauncher();
    }

    initLog() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
                ipcRenderer.send('main-window-dev-tools-close');
                ipcRenderer.send('main-window-dev-tools');
            }
        })
        new logger(pkg.name, '#7289da')
    }

    shortcut() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.keyCode == 87) {
                ipcRenderer.send('main-window-close');
            }
        })
    }


    setBackground() {
        const fs = require('fs');
        const nodePath = require('path');
        const bgDir = nodePath.join(__dirname, 'assets', 'images', 'background');
        const files = fs.readdirSync(bgDir).filter(f => !fs.statSync(nodePath.join(bgDir, f)).isDirectory());
        if (files.length) {
            const bg = nodePath.join(bgDir, files[Math.floor(Math.random() * files.length)]);
            document.body.style.backgroundImage = `url('${bg.replace(/\\/g, '/')}')` ;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
        }
    }

    errorConnect() {
        new popup().openPopup({
            title: this.config.error.code,
            content: this.config.error.message,
            color: 'red',
            exit: true,
            options: true
        });
    }

    initFrame() {
        console.log('Initializing Frame...')
        document.querySelector('.other .frame').classList.toggle('hide');

        document.querySelector('.other .frame #minimize').addEventListener('click', () => {
            ipcRenderer.send('main-window-minimize');
        });

        let maximize = document.querySelector('.other .frame #maximize');
        maximize.addEventListener('click', () => {
            ipcRenderer.send('main-window-maximize');
        });

        // L'icône est mise à jour uniquement quand le main process confirme
        // l'état (évite le désynchronisation si setBounds échoue)
        ipcRenderer.on('window-maximized', () => {
            maximize.classList.remove('icon-maximize');
            maximize.classList.add('icon-restore-down');
        });
        ipcRenderer.on('window-unmaximized', () => {
            maximize.classList.remove('icon-restore-down');
            maximize.classList.add('icon-maximize');
        });

        document.querySelector('.other .frame #close').addEventListener('click', () => {
            ipcRenderer.send('main-window-close');
        })
    }

    async initConfigClient() {
        console.log('Initializing Config Client...')
        let configClient = await this.db.readData('configClient')

        if (!configClient) {
            await this.db.createData('configClient', {
                account_selected: null,
                instance_selct: null,
                java_config: {
                    java_path: null,
                    java_memory: {
                        min: 2,
                        max: 4
                    }
                },
                game_config: {
                    screen_size: {
                        width: 854,
                        height: 480
                    }
                },
                launcher_config: {
                    download_multi: 5,
                    closeLauncher: 'close-launcher'
                }
            })
        }
    }

    extractBanReason(data) {
        const RAW_CODES = ['userbanned', 'banned', 'suspended', 'suspendu', 'user_banned', 'ban', 'true'];
        const candidates = [
            data.ban_reason,
            data.reason_message,
            data.ban_message,
            data.reason !== 'banned' && data.reason !== 'ban' ? data.reason : null,
            data.message
        ];
        for (const candidate of candidates) {
            if (!candidate) continue;
            const clean = String(candidate).trim();
            if (clean && !RAW_CODES.includes(clean.toLowerCase())) return clean;
        }
        return null;
    }

    async checkAzuriomBan(account) {
        try {
            const azuriomUrl = this.config.azuriom_url || this.config.url;
            if (!azuriomUrl || !account.access_token) return { banned: false };

            const response = await fetch(`${azuriomUrl}/api/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: account.access_token })
            });

            const data = await response.json().catch(() => ({}));
            const msg  = (data.message || '').toLowerCase();

            if (
                data.reason  === 'banned' ||
                data.banned  === true     ||
                msg.includes('banned')    ||
                msg.includes('banni')     ||
                msg.includes('suspendu')
            ) {
                return { banned: true, reason: this.extractBanReason(data) };
            }

            return { banned: false };
        } catch {
            return { banned: false };
        }
    }

    createPanels(...panels) {
        let panelsElem = document.querySelector('.panels')
        for (let panel of panels) {
            console.log(`Initializing ${panel.name} Panel...`);
            let div = document.createElement('div');
            div.classList.add('panel', panel.id)
            div.innerHTML = fs.readFileSync(`${__dirname}/panels/${panel.id}.html`, 'utf8');
            panelsElem.appendChild(div);
            new panel().init(this.config);
        }
    }

    async startLauncher() {
        let accounts = await this.db.readAllData('accounts')
        let configClient = await this.db.readData('configClient')
        let account_selected = configClient ? configClient.account_selected : null
        let popupRefresh = new popup();

        if (accounts?.length) {
            for (let account of accounts) {
                let account_ID = account.ID

                if (account.error || !account.meta) {
                    await this.db.deleteData('accounts', account_ID)
                    continue
                }

                if (account.meta.type === 'Azuriom') {
                    const banCheck = await this.checkAzuriomBan(account);
                    if (banCheck.banned) {
                        await this.db.deleteData('accounts', account_ID);
                        if (account_ID == account_selected) {
                            configClient.account_selected = null;
                            await this.db.updateData('configClient', configClient);
                        }
                        new popup().openPopup({
                            title: '⛓ Compte banni',
                            content: banCheck.reason
                                ? `Le compte <b>${account.name}</b> a été banni.<br><br><b>Raison :</b> ${banCheck.reason}`
                                : `Le compte <b>${account.name}</b> a été banni du serveur.`,
                            color: '#DC8436',
                            options: true
                        });
                        continue;
                    }
                } else {
                    console.error(`[Account] ${account.name}: Account Type Not Found`);
                    await this.db.deleteData('accounts', account_ID)
                    if (account_ID == account_selected) {
                        configClient.account_selected = null
                        await this.db.updateData('configClient', configClient)
                    }
                    continue;
                }
            }

            accounts = await this.db.readAllData('accounts')
            configClient = await this.db.readData('configClient')
            account_selected = configClient ? configClient.account_selected : null

            if (!account_selected && accounts.length) {
                let uuid = accounts[0].ID
                configClient.account_selected = uuid
                await this.db.updateData('configClient', configClient)
            }

            if (!accounts.length) {
                configClient.account_selected = null
                await this.db.updateData('configClient', configClient);
                popupRefresh.closePopup()
                return changePanel("login");
            }

            popupRefresh.closePopup()
            changePanel("home");
        } else {
            popupRefresh.closePopup()
            changePanel('login');
        }
    }
}

new Launcher().init();
