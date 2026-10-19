export const sessionStages=[{duration:'1m',target:100},{duration:'2m',target:500},{duration:'2m',target:1000},{duration:'10m',target:1000},{duration:'2m',target:0}];
export const authenticationStages=[{duration:'2m',target:10},{duration:'0s',target:25},{duration:'2m',target:25},{duration:'0s',target:50},{duration:'2m',target:50},{duration:'0s',target:100},{duration:'2m',target:100}];
export const commonOptions={noCookiesReset:true,summaryTrendStats:['avg','min','med','p(50)','p(95)','p(99)','max'],
  systemTags:['status','method','name','scenario','expected_response'],
  thresholds:{unexpected_errors:['rate<0.01'],identity_mismatch:['count==0'],revocation_failures:['count==0']}};
export function phaseAt(seconds){return seconds<300?'ramp':seconds<900?'plateau':'descent';}
export function accountFor(accounts,group,id){
  const offset={sessions:0,warmup:1000,authentication:1020}[group];const limit={sessions:1000,warmup:20,authentication:100}[group];
  const account=accounts[offset+id-1];
  if(!Number.isSafeInteger(id)||id<1||id>limit||!account||account.group!==group||account.index!==id-1)throw new Error('VU sin cuenta exclusiva.');return account;
}
