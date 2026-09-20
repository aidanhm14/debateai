import {randomBytes, timingSafeEqual} from 'node:crypto';
import {checkContent} from './content-guard.mjs';
import {publicIdentity} from './public-identity.mjs';
import identity from '../../../js/public-identity.js';

function fail(message,status=409){throw Object.assign(new Error(message),{status});}
function matches(a,b){
  return /^[a-f0-9]{64}$/.test(a||'') && /^[a-f0-9]{64}$/.test(b||'')
    && timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function projection(room,d,uid,invite){
  const side=d.proUid===uid?'pro':'con';
  const q=new URLSearchParams({room,source:'private',motion:d.motion||'',format:d.format==='open'?'open':'quick',
    pro:d.proName||'For',con:d.conName||'Against',mySide:side});
  const ownUrl='/live-round?'+q;
  let inviteUrl;
  if(invite && d.posterUid===uid){
    q.set('mySide',invite.side);
    inviteUrl='/live-round?'+q+'#invite='+invite.token;
  }
  return {room,ownUrl,...(inviteUrl?{inviteUrl}:{}),proUid:d.proUid||'',conUid:d.conUid||'',mySide:side};
}

// The secret stays in a server-only collection. A shared invitation admits
// exactly one account to the vacant seat, without opening spectator access.
export async function privateInvite(db,uid,body,now=Date.now()){
  if(!body || typeof body!=='object' || Array.isArray(body))fail('Invalid request.',400);
  const room=String(body.room||'');
  if(!/^Private-[a-zA-Z0-9-]{8,64}$/.test(room))fail('Invalid private room.',400);
  if(!['open','join'].includes(body.action))fail('Invalid invitation action.',400);
  const ref=db.collection('live_rounds').doc(room);
  const inviteRef=db.collection('private_round_invites').doc(room);
  return db.runTransaction(async tx=>{
    const [snap,inv,profile]=await Promise.all([tx.get(ref),tx.get(inviteRef),tx.get(db.collection('user_profiles').doc(uid))]);
    let round=snap.exists?snap.data():null;
    let invitation=inv.exists?inv.data():null;
    const name=publicIdentity(uid,profile.exists?profile.data():{}).name;
    if(body.action==='join'){
      if(!round || !invitation || !matches(String(body.invite||''),invitation.token))fail('This invite is not valid. Ask the host for their invite link.',403);
      const field=invitation.side+'Uid';
      if(round[field]===uid || (invitation.claimedBy===uid && [round.proUid,round.conUid].includes(uid)))return projection(room,round,uid);
      if(invitation.expiresAt<now || round[field] || [round.proUid,round.conUid,round.posterUid].includes(uid))fail('This invitation is no longer available.');
      if(round.ballot || ['ballot','done','cancelled'].includes(round.status))fail('This round has ended.');
      const bands=await Promise.all([uid,round.posterUid].map(id=>tx.get(db.collection('age_bands').doc(id))));
      const ages=bands.map(s=>(s.exists?s.data():{}).band||'unknown');
      if(ages.includes('minor') && !ages.every(a=>a==='minor'))fail('These accounts cannot join the same room.',403);
      const patch={[field]:uid,[invitation.side+'Name']:name};
      tx.update(ref,patch);
      tx.update(inviteRef,{claimedBy:uid,claimedAt:now});
      return projection(room,{...round,...patch},uid);
    }
    if(round && round.posterUid!==uid){
      if([round.proUid,round.conUid].includes(uid))return projection(room,round,uid);
      fail('Ask the host for their invite link before joining this private round.',403);
    }
    const side=round?.proUid===uid?'pro':round?.conUid===uid?'con':body.mySide==='con'?'con':'pro';
    if(!round){
      const motion=String(body.motion||'').trim();
      const guard=checkContent({text:motion,kind:'motion',minLength:5,maxLength:4096});
      if(!guard.ok)fail(guard.reason,400);
      const hostName=identity.cleanName(body.hostName)||name;
      const guestName=identity.cleanName(body.guestName)||(side==='pro'?'Against':'For');
      round={motion,format:body.format==='open'?'open':'quick',background:String(body.background||'').slice(0,6000),
        proName:'For',conName:'Against',posterUid:uid,posterName:name,[side+'Uid']:uid,[side+'Name']:hostName,
        [(side==='pro'?'con':'pro')+'Name']:guestName,
        status:'setup',speechIdx:0,isPrivate:true,createdAt:new Date(now)};
      tx.set(ref,round);
    }else if(!round.proUid && !round.conUid){
      const patch={[side+'Uid']:uid,[side+'Name']:name};
      tx.update(ref,patch);round={...round,...patch};
    }
    if(![round.proUid,round.conUid].includes(uid))fail('This account does not have a seat in this round.',403);
    const other=side==='pro'?'con':'pro';
    if(!invitation || (invitation.expiresAt<now && !round[other+'Uid'])){
      invitation={ownerUid:uid,side:other,token:randomBytes(32).toString('hex'),expiresAt:now+7*86400000};
      tx.set(inviteRef,invitation);
    }
    return projection(room,round,uid,invitation);
  });
}
