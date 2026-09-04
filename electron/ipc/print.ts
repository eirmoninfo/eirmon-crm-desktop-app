import { BrowserWindow, ipcMain, webContents, type BrowserWindowConstructorOptions } from 'electron';
import { listPrinters as listPrintersUtil } from '../utils/printers.js';
import { getMainWindow } from '../window.js';
import { isTrustedSender, sanitizePrintHtml } from '../utils/ipcTrust.js';

interface PrintPayload {
  html: string;
  silent?: boolean;
  deviceName?: string;
  transport?: string;
}

interface ElectronPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
  options: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

function printHtmlWithSystemDialog(payload: PrintPayload): Promise<void> {
  const html = sanitizePrintHtml(payload?.html);
  const silent = payload?.silent === true;
  const deviceName = typeof payload?.deviceName === 'string' ? payload.deviceName.slice(0, 200) : '';

  return new Promise((resolve, reject) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    } as BrowserWindowConstructorOptions);

    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    const cleanup = (): void => {
      if (!printWin.isDestroyed()) printWin.close();
    };

    printWin.webContents.once('did-fail-load', (_e, code, desc) => {
      cleanup();
      reject(new Error(`Could not load print view: ${desc} (${code})`));
    });

    printWin.webContents.once('did-finish-load', () => {
      const opts: Electron.WebContentsPrintOptions = {
        silent,
        printBackground: true,
      };
      if (silent && deviceName) opts.deviceName = deviceName;

      printWin.webContents.print(opts, (success, failureReason) => {
        cleanup();
        if (success) resolve();
        else reject(new Error(failureReason || 'Print was cancelled or failed'));
      });
    });

    printWin.loadURL(url).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

async function getWindowPrinters(): Promise<ElectronPrinterInfo[]> {
  const allWebContents = webContents.getAllWebContents();
  const wc = allWebContents.find((w) => w.getType() === 'window');
  if (!wc) throw new Error('No renderer webContents available');
  return wc.getPrintersAsync() as Promise<ElectronPrinterInfo[]>;
}

async function assertPrinterExists(printerName: string, transport?: string): Promise<void> {
  if (!printerName || typeof printerName !== 'string') {
    throw new Error('No printer selected.');
  }
  if (transport === 'tcp') return;
  const printers = await getWindowPrinters();
  if (!printers.length) {
    throw new Error('No printers connected. Add a printer in System Settings.');
  }
  const exists = printers.some((p) => p.name === printerName);
  if (!exists) {
    throw new Error(`Printer not found: "${printerName}". Refresh the list and try again.`);
  }
}

export function registerPrintIpc(): void {
  ipcMain.handle('printers:list', async (event) => {
    if (!isTrustedSender(event, getMainWindow())) {
      return { ok: false, error: 'Untrusted printers request.' };
    }
    try {
      const printers = await getWindowPrinters();
      return { ok: true, printers: listPrintersUtil(printers) };
    } catch (err) {
      const error = err as Error;
      console.error('printers:list failed', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('receipt:print-html', async (event: Electron.IpcMainInvokeEvent, payload: PrintPayload) => {
    if (!isTrustedSender(event, getMainWindow())) {
      return { ok: false, error: 'Untrusted print request.' };
    }
    try {
      if (payload?.silent && payload?.deviceName) {
        await assertPrinterExists(payload.deviceName, payload?.transport);
      }
      await printHtmlWithSystemDialog(payload);
      console.log('[Print] HTML job finished', { silent: !!payload?.silent });
      return { ok: true, message: 'Print dialog completed or silent job sent.' };
    } catch (err) {
      const error = err as Error;
      console.error('receipt:print-html failed', error);
      return { ok: false, error: error.message };
    }
  });
}
