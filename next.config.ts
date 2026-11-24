import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from 'next';

initOpenNextCloudflareForDev();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', 'pdfkit'],
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
};
export default config;
