import type { Pool } from 'pg';
import type { LoadManifest } from './fixtures.ts';
export async function sessionCounts(pool:Pool,manifest:LoadManifest){
  const groups:Record<string,{sessions:number;users:number;secrets:number;recent:number}>={};
  for(const group of ['sessions','warmup','authentication']){
    const ids=manifest.accounts.filter(a=>a.group===group).map(a=>a.id);
    groups[group]=(await pool.query(`SELECT count(*)::int AS sessions,count(DISTINCT s."userId")::int AS users,
      count(DISTINCT encode(s."tokenHash",'hex'))::int AS secrets,
      count(*) FILTER(WHERE s."lastAcceptedAt">clock_timestamp()-interval '15 seconds')::int AS recent
      FROM "Session" s JOIN "User" u ON u.id=s."userId" WHERE s."userId"=ANY($1::uuid[]) AND s."revokedAt" IS NULL
      AND s."absoluteExpiresAt">clock_timestamp() AND s."lastAcceptedAt">clock_timestamp()-interval '30 minutes'
      AND s."authVersion"=u."authVersion" AND u.status='ACTIVE' AND u."emailVerifiedAt" IS NOT NULL AND NOT u."mustSetPassword"`,[ids])).rows[0];
  }return groups;
}
export function fullPlateau(counts:{sessions:number;users:number;secrets:number;recent:number}){
  return counts.sessions===1000&&counts.users===1000&&counts.secrets===1000&&counts.recent===1000;
}
export function stopReason(waitMaxMs:number,memoryCurrent:number,memoryLimit:number){
  if(waitMaxMs>5000)return 'HASH_WAIT_OVER_5S';
  if(Number.isFinite(memoryLimit)&&memoryLimit>0&&memoryLimit-memoryCurrent<128*1024*1024)return 'MEMORY_HEADROOM_UNDER_128M';
  return null;
}
