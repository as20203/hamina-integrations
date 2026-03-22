const normalizeDeviceMac = (raw: string): string => raw.replace(/[^a-f0-9]/gi, "").toLowerCase();

export { normalizeDeviceMac };
