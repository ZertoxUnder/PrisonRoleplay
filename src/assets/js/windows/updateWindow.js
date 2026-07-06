"use strict";
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const os = require("os");
let dev = process.env.DEV_TOOL === 'open';
let updateWindow = undefined;

function getWindow() {
    return updateWindow;
}

function destroyWindow() {
    if (!updateWindow) return;
    updateWindow.close();
    updateWindow = undefined;
}

function createWindow() {
    destroyWindow();
    updateWindow = new BrowserWindow({
        title: "Mise à jour",
        width: 400,
        height: 500,
        resizable: false,
        icon: path.join(app.getAppPath(), 'src', 'assets', 'images', 'icon.ico'),
        frame: false,
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            devTools: false,
        },
    });
    Menu.setApplicationMenu(null);
    updateWindow.setMenuBarVisibility(false);
    updateWindow.loadFile(path.join(`${app.getAppPath()}/src/index.html`));
    updateWindow.once('ready-to-show', () => {
        if (updateWindow) {
            if (dev) updateWindow.webContents.openDevTools({ mode: 'detach' })
            updateWindow.show();
        }
    });
}

module.exports = {
    getWindow,
    createWindow,
    destroyWindow,
};