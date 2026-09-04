declare module '@/api/api.config' {
  export const API_BASE_URL: string;
  export function getApiRoot(): string;
  export function motivationGenerateUrl(): string;
  export function broadcastingAuthUrl(): string;
  export function getAppOrigin(): string;
  export function resolveMediaUrl(url: string): string;
  export function isReverbConfigured(): boolean;
}