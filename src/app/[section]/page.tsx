import {notFound,redirect} from 'next/navigation';import {isAdmin,requireUser} from '@/lib/auth';import Workspace from '@/components/Workspace';
const allowed=['inventaris','barang-masuk','barang-keluar','barang-tarikan','histori','pengguna','pengaturan'];
export default async function SectionPage({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!allowed.includes(section))notFound();let user;try{user=await requireUser()}catch{redirect('/login')}if(!isAdmin(user.role)&&['barang-masuk','pengguna'].includes(section))notFound();return <Workspace user={user}/>}
