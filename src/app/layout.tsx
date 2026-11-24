import type { Metadata } from 'next';import './globals.css';import 'sweetalert2/dist/sweetalert2.min.css';
export const metadata:Metadata={title:'Tekniksi — Sistem Inventaris',description:'Manajemen inventaris teknisi'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
