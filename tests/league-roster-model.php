<?php
declare(strict_types=1);
require __DIR__.'/../Cangiolone.com/builder-model.php';
require __DIR__.'/../Cangiolone.com/league-roster.php';
function rosterCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function rosterReject(callable $fn,string $message): void {
    try{$fn();}catch(BuilderInputError){return;}throw new RuntimeException($message);
}
$raw=json_decode(file_get_contents(__DIR__.'/workbench-fixture.json'),true,40,JSON_THROW_ON_ERROR);
$raw['featuresVersion']=3;
$unit=$raw['units'][0];$unit['id']='roster_vehicle';$unit['name']='Veicolo sintetico';$unit['factionId']='test';$unit['keywords']='Character, Vehicle';$unit['category']='Character';
$unit['support']=false;$unit['leads']=[];$unit['enhancements']=[];$unit['abilities']=[];$unit['stratagems']=[];$unit['effects']=[];
$unit['composition']=[['description'=>'1 Pilot model']];$unit['models']=[['line'=>'1','name'=>'Pilot','W'=>'10','Sv'=>'3+','keywords'=>'Character']];
$unit['points']=[['models'=>1,'points'=>100]];$unit['loadout']='This model is equipped with: 1 Rifle.';
$unit['weapons']=[['line'=>'1','name'=>'Rifle','type'=>'Ranged','A'=>'1'],['line'=>'2','name'=>'Cannon','type'=>'Ranged','A'=>'1'],['line'=>'3','name'=>'Launcher - Frag','type'=>'Ranged','A'=>'1'],['line'=>'4','name'=>'Launcher - Krak','type'=>'Ranged','A'=>'1'],['line'=>'5','name'=>'Heavy cannon','type'=>'Ranged','A'=>'1']];
$unit['options']=[['description'=>'This model can be equipped with 1 Cannon.'],['description'=>'This model can be equipped with 1 Launcher.'],['description'=>'This model can be equipped with 1 Heavy cannon.']];
$unit['costs']=[['description'=>'per Cannon','cost'=>'15'],['description'=>'per Launcher','cost'=>'15'],['description'=>'per Heavy cannon','cost'=>'25']];
$unit['enhancements']=[['id'=>'gift_a','name'=>'Potenziamento A','cost'=>'25','description'=>'Synthetic enhancement.'],['id'=>'gift_b','name'=>'Potenziamento B','cost'=>'40','description'=>'Synthetic enhancement.']];
$raw['units']=[$unit];$raw['factions'][0]['unitIds']=[$unit['id']];$raw['factions'][0]['name']='Orks';
$catalog=builderNormalizeCatalog($raw);$u=$catalog['units'][0];$recipe=$u['loadoutRecipe'];
$entry=['entryId'=>'copy_a','unitId'=>$unit['id'],'models'=>1,'weaponCounts'=>[],'enhancementIds'=>[],'attachedTo'=>null,'warlord'=>true,'loadoutSelections'=>builderLoadoutCounts($recipe,[],1)['selections']];
$army=['edition'=>'11','name'=>'Roster di prova','catalogId'=>'test','factionId'=>'test','limit'=>2000,'detachmentIds'=>['first'],'disposition'=>'Take and Hold','entries'=>[$entry]];
$options=leagueRosterOptions($u,1);$ids=array_column($options,'id','name');
rosterCheck(count($options)===3,'Alternative weapon modes counted twice');
$cannon=$ids['Cannon'];$launcher=$ids['Launcher'];$heavy=$ids['Heavy cannon'];
$reserve=[$entry['entryId']=>[$cannon=>1,$launcher=>1]];
$roster=leagueRosterBuild($catalog,$army,$reserve,1000);
rosterCheck($roster['points']===115,'Two 15-point options must reserve 15, not 30');
$max=leagueRosterBuild($catalog,$army,[$entry['entryId']=>[$cannon=>1,$heavy=>1]],1000);
rosterCheck($max['points']===125,'Unequal options must reserve only their maximum');
rosterReject(fn()=>leagueRosterBuild($catalog,$army,$reserve,114),'Roster limit ignored');
rosterReject(fn()=>leagueRosterBuild($catalog,$army,[$entry['entryId']=>['unknown'=>1]],1000),'Unknown option accepted');
rosterReject(fn()=>leagueRosterBuild($catalog,$army,[$entry['entryId']=>[$cannon=>2]],1000),'Unavailable quantity accepted');
function rosterEquip(array $army,array $recipe,array $weaponIds): array {
    foreach($recipe['groups'] as $group)foreach($group['choices'] as $choice)if(array_intersect(array_keys($choice['weapons']),$weaponIds)) {
        $army['entries'][0]['loadoutSelections'][$group['id']]=[$group['default']=>0,$choice['id']=>1];
    }
    return $army;
}
$both=rosterEquip($army,$recipe,[$cannon,$launcher]);
$validation=leagueRosterValidateLineup($catalog,$both,$roster,2000);
rosterCheck($validation['points']===130,'Match must pay both equipped weapons normally');
$enhancedSource=$army;$enhancedSource['entries'][0]['enhancementIds']=['gift_a'];
$enhancedRoster=leagueRosterBuild($catalog,$enhancedSource,$reserve,115);
rosterCheck($enhancedRoster['points']===115,'Source army enhancement charged against roster limit');
rosterCheck(!array_key_exists('enhancementIds',$enhancedRoster['entries'][0])&&!array_key_exists('enhancementPoints',$enhancedRoster['entries'][0]),'Roster stores detachment enhancement reservations');
$enhancedMatch=$both;$enhancedMatch['entries'][0]['enhancementIds']=['gift_b'];
rosterCheck(leagueRosterValidateLineup($catalog,$enhancedMatch,$enhancedRoster,2000)['points']===170,'Match enhancement not freely chosen or charged normally');
rosterReject(fn()=>leagueRosterValidateLineup($catalog,$enhancedMatch,$enhancedRoster,150),'Match enhancement bypasses match point limit');
$invalidEnhancement=$both;$invalidEnhancement['entries'][0]['enhancementIds']=['unknown'];
rosterReject(fn()=>leagueRosterValidateLineup($catalog,$invalidEnhancement,$roster,2000),'Unknown match enhancement accepted');
rosterReject(fn()=>leagueRosterValidateLineup($catalog,$both,$roster,120),'Match point limit ignored');
$expensive=rosterEquip($army,$recipe,[$heavy]);
rosterReject(fn()=>leagueRosterValidateLineup($catalog,$expensive,$roster,2000),'Unreserved paid gear accepted');
rosterReject(fn()=>leagueRosterBuild($catalog,$both,[],1000),'Already equipped paid gear silently reserved');
$double=$both;$copy=$double['entries'][0];$copy['entryId']='copy_b';$copy['warlord']=false;$double['entries'][]=$copy;
rosterReject(fn()=>leagueRosterValidateLineup($catalog,$double,$roster,2000),'One reserved copy reused twice');
$manual=$army;$manual['entries'][0]['manualPoints']=1;
rosterReject(fn()=>leagueRosterBuild($catalog,$manual,[],1000),'Manual points accepted');
$pool=$army;$other=$entry;$other['entryId']='copy_b';$other['warlord']=false;$pool['entries'][]=$other;
$poolRoster=leagueRosterBuild($catalog,$pool,['copy_a'=>[$cannon=>1]],1000);
$flexible=$pool;$flexible['entries'][0]['loadoutSelections']=$entry['loadoutSelections'];$flexible['entries'][1]=rosterEquip($army,$recipe,[$cannon])['entries'][0];$flexible['entries'][1]['entryId']='copy_b';$flexible['entries'][1]['warlord']=false;
rosterCheck(leagueRosterValidateLineup($catalog,$flexible,$poolRoster,2000)['points']===215,'Copy assignment depends on list ordering');
// A pool may lack Warlord/detachments even though a match list must declare them.
$pool['detachmentIds']=[];$pool['disposition']='';$pool['entries'][0]['warlord']=false;
rosterCheck(leagueRosterBuild($catalog,$pool,[],1000)['points']===200,'Pool incorrectly requires a playable army');
echo json_encode(['raw'=>$raw,'army'=>$army,'both'=>$both,'reserve'=>$reserve,'roster'=>$roster],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
