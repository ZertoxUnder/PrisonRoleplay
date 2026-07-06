const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import slider from './utils/slider.js';

async function changePanel(id) {
    let panel = document.querySelector(`.panel.${id}`);
    let active = document.querySelector(`.panel.active`);

    if (!panel) {
        console.error(`Panel with id "${id}" not found`);
        return;
    }

    if (active) active.classList.remove("active");
    panel.classList.add("active");
}

async function appdata() {
    return await ipcRenderer.invoke('appData').then(path => path)
}

async function setStatus(opt) {
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')

    if (!opt) {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Ferme - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
        return
    }

    let { ip, port, nameServer } = opt
    nameServerElement.innerHTML = nameServer
    let status = new Status(ip, port);
    let statusServer = await status.getStatus().then(res => res).catch(err => err);

    if (!statusServer.error) {
        statusServerElement.classList.remove('red')
        document.querySelector('.status-player-count').classList.remove('red')
        statusServerElement.innerHTML = `En ligne - ${statusServer.ms ? statusServer.ms : 0} ms`
        playersOnline.innerHTML = statusServer.playersConnect ? statusServer.playersConnect : '0'
    } else {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Ferme - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
    }
}

export {
    appdata,
    changePanel,
    config,
    database,
    logger,
    popup,
    slider as Slider,
    pkg,
    setStatus
}
