export interface SimplePrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
  statusLabel: string;
  online: boolean;
  options: Record<string, unknown>;
}

function describeStatus(status: number | undefined | null): { statusLabel: string; online: boolean } {
  if (status === undefined || status === null) {
    return { statusLabel: 'Unknown', online: true };
  }
  const offlineLike = (Number(status) & 0x80) !== 0;
  if (offlineLike) {
    return { statusLabel: 'Offline', online: false };
  }
  return { statusLabel: 'Ready', online: true };
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

export function listPrinters(printers: ElectronPrinterInfo[]): SimplePrinterInfo[] {
  const result: SimplePrinterInfo[] = [];
  for (const p of printers) {
    const { statusLabel, online } = describeStatus(p.status);
    result.push({
      name: p.name,
      displayName: p.displayName,
      isDefault: !!p.isDefault,
      status: p.status,
      statusLabel,
      online,
      options: p.options as Record<string, unknown>,
    });
  }
  return result;
}