import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma';
const cookieName = 'tekniksi_session';
function secret(){ const value=process.env.SESSION_SECRET; if(!value || value.length<32) throw new Error('SESSION_SECRET minimal 32 karakter.'); return value; }
export async function setSession(userId:string){ const expires=Date.now()+8*60*60*1000; const payload=Buffer.from(JSON.stringify({userId,expires})).toString('base64url'); const sig=createHmac('sha256',secret()).update(payload).digest('base64url'); (await cookies()).set(cookieName,`${payload}.${sig}`,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',expires:new Date(expires)}); }
export async function currentUser(){ try { const raw=(await cookies()).get(cookieName)?.value; if(!raw)return null; const [payload,sig]=raw.split('.'); const expected=createHmac('sha256',secret()).update(payload).digest(); const actual=Buffer.from(sig,'base64url'); if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null; const data=JSON.parse(Buffer.from(payload,'base64url').toString()); if(data.expires<Date.now())return null; return await prisma.user.findUnique({where:{id:data.userId},select:{id:true,username:true,role:true,createdAt:true}}); }catch{return null;} }
export async function requireUser(admin=false){ const user=await currentUser(); if(!user) throw new Error('UNAUTHORIZED'); if(admin&&user.role!=='admin')throw new Error('FORBIDDEN'); return user; }
export async function clearSession(){(await cookies()).delete(cookieName);}
export const newId=(prefix:string)=>`${prefix}-${randomBytes(16).toString('hex')}`;
