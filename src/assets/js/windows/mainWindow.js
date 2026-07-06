const { app, BrowserWindow, Menu, nativeImage } = require("electron");
const path = require("path");
const os = require("os");
const pkg = require("../../../../package.json");
let dev = process.env.DEV_TOOL === 'open';
let mainWindow = undefined;
const iconPath = path.join(app.getAppPath(), 'src', 'assets', 'images', 'icon.ico');
const appIcon = nativeImage.createFromPath(iconPath);

function getWindow() {
    return mainWindow;
}

function destroyWindow() {
    if (!mainWindow) return;
    app.quit();
    mainWindow = undefined;
}

function createWindow() {
    destroyWindow();
    mainWindow = new BrowserWindow({
        title: pkg.preductname,
        width: 1280,
        height: 720,
        minWidth: 980,
        minHeight: 552,
        resizable: false,
        maximizable: false,
        icon: appIcon,
        frame: os.platform() !== 'win32',
        show: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            devTools: true,
        },
    });
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(`${app.getAppPath()}/src/launcher.html`));
    mainWindow.once('ready-to-show', () => {
        if (mainWindow) {
            if (dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
            mainWindow.show()
        }
    });
}

// Sur Windows, une fenêtre frameless perd son icône de taskbar au show() qui
// suit un hide() : le bouton de la taskbar est recréé par explorer.exe de façon
// asynchrone après le show(), donc setIcon() doit être réappliqué après coup
// (avant le show() ne suffit pas, d'où l'échec du premier correctif).
function showWindow() {
    if (!mainWindow) return;
    mainWindow.show();
    if (os.platform() === 'win32') {
        mainWindow.setIcon(appIcon);
        setTimeout(() => {
            if (mainWindow) mainWindow.setIcon(appIcon);
        }, 300);
    }
}

module.exports = {
    getWindow,
    createWindow,
    destroyWindow,
    showWindow,
};