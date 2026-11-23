'use strict';
// A small, explicit release: never read deployment configuration, uploads or game data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),arg=process.argv.indexOf('--output');
if(arg<0||!process.argv[arg+1])throw Error('Specify --output <new directory>.');
const output=path.resolve(process.argv[arg+1]);
if(fs.existsSync(output))throw Error('Output already exists; choose a new directory.');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
if(git(['status','--porcelain']))throw Error('Commit the reviewed release before packaging.');
git(['merge-base','--is-ancestor','origin/main','HEAD']);
const names=['storage.php','router.php','statistics.js','theme.js','style.css','builder.js','builder-workbench.js','builder.css','app.js','api.php','index.php','service-worker.php'];
const changed=git(['diff','--name-only','origin/main','HEAD','--','Cangiolone.com']).split(/\r?\n/).filter(Boolean).map(f=>f.slice('Cangiolone.com/'.length));
if(changed.length!==names.length||changed.some(f=>!names.includes(f)))throw Error('Application changes differ from the reviewed release. Review the base and file list.');
const commit=git(['rev-parse','HEAD']),baseCommit=git(['rev-parse','origin/main']);
const destination=path.join(output,'files/warhammer');fs.mkdirSync(destination,{recursive:true});
const files=names.map(file=>{
  const bytes=fs.readFileSync(path.join(root,'Cangiolone.com',file));fs.writeFileSync(path.join(destination,file),bytes);
  return {file,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({environment:'warhammer-production',release:'profilo-statistiche-ricerca',commit,baseCommit,created:new Date().toISOString(),files},null,2)+'\n');
fs.copyFileSync(path.join(root,'scripts/upload-profile-stats-ftps.ps1'),path.join(output,'Upload-Profilo-Statistiche.ps1'));
fs.copyFileSync(path.join(root,'docs/rilascio-profilo-statistiche.md'),path.join(output,'LEGGIMI.md'));
fs.copyFileSync(path.join(root,'docs/profilo-statistiche-pr.md'),path.join(output,'DESCRIZIONE-PR.md'));
const launch=`[CmdletBinding()]\nparam([switch]$CheckOnly)\n$ErrorActionPreference='Stop'\n& '${path.join(root,'scripts/publish-profile-stats-pr.ps1').replaceAll("'","''")}' -RepositoryDirectory '${root.replaceAll("'","''")}' -CheckOnly:$CheckOnly\n`;
fs.writeFileSync(path.join(output,'Pubblica-PR.ps1'),launch);
console.log(JSON.stringify({output,commit,baseCommit,files:files.length}));
