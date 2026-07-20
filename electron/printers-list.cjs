/**
 * Map Chromium printer objects to a simple list for the renderer (HTML / system print).
 */

function describeStatus(status) {
  if (status === undefined || status === null) {
    return { statusLabel: "Unknown", online: true };
  }
  const offlineLike = (Number(status) & 0x80) !== 0;
  if (offlineLike) {
    return { statusLabel: "Offline", online: false };
  }
  return { statusLabel: "Ready", online: true };
}

function listPrinters(printers) {
  return printers.map((p) => {
    const { statusLabel, online } = describeStatus(p.status);
    return {
      name: p.name,
      displayName: p.displayName,
      isDefault: !!p.isDefault,
      status: p.status,
      statusLabel,
      online,
      options: p.options || {},
    };
  });
}

module.exports = { listPrinters };
