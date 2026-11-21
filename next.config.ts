import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, serverExternalPackages: ['exceljs','pdfkit'], experimental: { serverActions: { bodySizeLimit: '12mb' } } };
export default config;
