export default function DeviceSelector({ label, devices, value, onChange, disabled = false }) {
  return (
    <label className="glass-field text-sm font-medium">
      <span className="glass-field-label">{label}</span>
      <select className="glass-select w-full" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">System default</option>
        {devices.map((device, index) => (
          <option value={device.deviceId} key={device.deviceId || `${device.kind}-${index}`}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

