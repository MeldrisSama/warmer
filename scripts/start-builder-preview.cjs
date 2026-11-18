'use strict';
// Refresh an existing isolated preview, preserving its database, users and lists.
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const directory=path.resolve(process.argv[2]||path.join(root,'../warmer-builder-play-preview-4'));
const port=Number(process.argv[3]||8799);
const php=process.env.PHP_BINARY||'php';

async function run(){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Porta locale non valida.');
  const database=path.join(directory,'preview.sqlite'),config=path.join(directory,'config.php');
  if(!fs.existsSync(database)||!fs.existsSync(config))throw Error('Anteprima esistente non trovata. Nessun database è stato creato.');
  if(fs.realpathSync(directory).toLowerCase()===fs.realpathSync(path.join(root,'Cangiolone.com')).toLowerCase())throw Error('La sorgente applicativa non può essere usata come anteprima.');
  const checked=spawnSync(php,['-r',"$c=require $argv[1]; echo json_encode(['driver'=>$c['database']['driver']??null,'path'=>realpath($c['database']['path']??'')]);",config],{encoding:'utf8',windowsHide:true});
  if(checked.status!==0)throw Error('Verifica configurazione fallita: controllare PHP_BINARY.');
  let isolated;try{isolated=JSON.parse(checked.stdout);}catch{throw Error('Configurazione anteprima non riconosciuta.');}
  if(isolated.driver!=='sqlite'||typeof isolated.path!=='string'||isolated.path.toLowerCase()!==fs.realpathSync(database).toLowerCase())throw Error('Il database non è preview.sqlite della cartella indicata. Nessun file aggiornato.');
  await new Promise((resolve,reject)=>{
    const probe=net.createServer();probe.once('error',()=>reject(Error(`La porta ${port} è occupata. Scegliere un’altra porta; nessun processo è stato arrestato.`)));
    probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
  });
  const files=[...new Set([...execFileSync('git',['ls-files','-z','--','Cangiolone.com'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean),'Cangiolone.com/builder-automation.php','Cangiolone.com/builder-engine.js'])].filter(file=>fs.existsSync(path.join(root,file)));
  let copied=0;
  for(const file of files){
    const relative=file.slice('Cangiolone.com/'.length);
    if(relative.includes('/')||relative==='config.php')continue;
    fs.copyFileSync(path.join(root,file),path.join(directory,relative));copied++;
  }
  console.log(`Aggiornati ${copied} file applicativi. Database, utenti e liste conservati.`);
  const icons=path.join(root,'Cangiolone.com/assets/factions');
  if(fs.existsSync(icons)){const target=path.join(directory,'assets/factions');fs.mkdirSync(target,{recursive:true});for(const name of fs.readdirSync(icons))if(/^[a-z_]+\.svg$/.test(name)||['LICENSE.txt','UPSTREAM-README.md','manifest.json'].includes(name))fs.copyFileSync(path.join(icons,name),path.join(target,name));}
  const server=spawn(php,['-d','memory_limit=256M','-d','post_max_size=32M','-S',`127.0.0.1:${port}`,'-t',directory,path.join(directory,'router.php')],{stdio:'inherit',windowsHide:true});
  server.on('error',()=>{console.error('Avvio PHP non riuscito.');process.exitCode=1;});
  server.on('exit',code=>{if(code)process.exitCode=code;});
  process.on('SIGINT',()=>server.kill());
  process.on('SIGTERM',()=>server.kill());
  console.log(`Anteprima: http://127.0.0.1:${port}/#builder`);
  console.log('Accesso locale esistente: preview / BuilderPreview!2026');
  console.log('Lasciare aperto questo terminale. Ctrl+C per arrestare la prova.');
}
run().catch(err=>{console.error(err.message);process.exitCode=1;});
