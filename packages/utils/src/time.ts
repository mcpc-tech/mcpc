// Simple time utilities using native Date
export const now = (): Date => new Date();

export const nowString = (): string => new Date().toISOString();

export const timestamp = (): number => Date.now();
