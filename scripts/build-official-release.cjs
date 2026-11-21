'use strict';
// Package the committed official application. Never read deployment config or game data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),i=process.argv.indexOf('--output');
if(i<0||!process.argv[i+1])throw Error('Specify --output <new directory>.');
const output=path.resolve(process.argv[i+1]),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
if(fs.existsSync(output))throw Error('Output already exists; choose a new directory.');
if(git(['status','--porcelain']))throw Error('Commit the reviewed release before packaging.');
git(['merge-base','--is-ancestor','origin/main','HEAD']);
const commit=git(['rev-parse','HEAD']),baseCommit=git(['rev-parse','origin/main']);
const app=path.join(root,'Cangiolone.com'),destination=path.join(output,'files/warhammer');
const names=fs.readdirSync(app,{withFileTypes:true}).filter(f=>f.isFile()&&/\.(php|js|css|json|webmanifest)$/.test(f.name)&&!['config.php','composer.json'].includes(f.name)).map(f=>f.name);
names.push('web.config');
for(const dir of ['factions','pwa'])for(const file of fs.readdirSync(path.join(app,'assets',dir)))if(/\.(svg|png|json|md|txt)$/.test(file))names.push('assets/'+dir+'/'+file);
function phase(file){
  if(file==='service-worker.php')return 100;if(file==='index.php')return 90;if(file==='api.php')return 80;
  if(file.startsWith('assets/'))return 0;if(file==='builder-rule-parameters.json')return 5;
  if(['builder-source-fixes.php','builder-automation.php','builder-loadout-rules.php','builder-v2.php','builder-sync.php','league-roster.php'].includes(file))return 10;
  if(file.endsWith('.php'))return 20;return 40;
}
names.sort((a,b)=>phase(a)-phase(b)||a.localeCompare(b));
fs.mkdirSync(destination,{recursive:true});
const files=names.map(file=>{
  if(/config\.php|uploads\/|private\/|test-status|seed|\.sqlite/i.test(file))throw Error('Private or test file in package: '+file);
  const to=path.join(destination,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(app,file),to);
  const bytes=fs.readFileSync(to);return {file,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
const manifest=JSON.parse(fs.readFileSync(path.join(destination,'manifest.webmanifest'),'utf8'));
if(manifest.name!=='Cronache del settore'||manifest.short_name!=='Cronache del settore')throw Error('Unexpected official name.');
if(!fs.readFileSync(path.join(destination,'api.php'),'utf8').includes("session_name('sector_session')"))throw Error('Official session changed.');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({environment:'warhammer-production',commit,baseCommit,created:new Date().toISOString(),files},null,2)+'\n');
fs.copyFileSync(path.join(root,'scripts/upload-official-ftps.ps1'),path.join(output,'Upload-Cronache.ps1'));
fs.copyFileSync(path.join(root,'docs/rilascio-ufficiale.md'),path.join(output,'LEGGIMI.md'));
console.log(JSON.stringify({output,commit,baseCommit,files:files.length,bytes:files.reduce((sum,f)=>sum+f.size,0)}));
