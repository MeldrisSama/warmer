<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

require __DIR__.'/mail-model.php';
require __DIR__.'/storage.php';

function renderSectorEmail(array $message): array {
    $esc=fn(string $value)=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $title=$esc($message['subject']);
    $body=nl2br($esc($message['body']),false);
    $label=$esc($message['label']);
    $url=$esc($message['url']);
    $text=$message['subject']."\n\n".$message['body'];
    $report='';
    foreach(['results'=>['Risultati',['Giocatore','Esito','Avversario']],'standings'=>['Classifica aggiornata',['Giocatore','Punti','Diff.']]] as $key=>[$heading,$columns]) {
        $rows=$message['report'][$key]??[];
        if(!$rows) continue;
        $report.='<h2 style="font:normal 20px Georgia,serif;color:#25523a;margin:24px 0 8px">'.$heading.'</h2><table width="100%" style="border-collapse:collapse;text-align:left"><thead><tr>';
        foreach($columns as $column) $report.='<th scope="col" style="padding:8px;background:#e0eee4;color:#25523a">'.$column.'</th>';
        $report.='</tr></thead><tbody>';
        $text.="\n\n".$heading;
        foreach($rows as $row) {
            $report.='<tr>';
            foreach($row as $cell) $report.='<td style="padding:8px;border-bottom:1px solid #d3d9d1;overflow-wrap:anywhere">'.$esc((string)$cell).'</td>';
            $report.='</tr>';
            $text.="\n".implode(' · ',$row);
        }
        $report.='</tbody></table>';
    }
    $html=<<<HTML
<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>$title</title></head>
<body style="margin:0;background:#e4efe6;color:#17231d;font:16px/1.6 Arial,sans-serif">
<table role="presentation" width="100%" style="background:#e4efe6"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" style="max-width:580px;background:#ffffff;border:1px solid #acc4b1;text-align:left">
<tr><td style="background:#215b40;border-bottom:3px solid #c2a66b;padding:18px 24px;color:#f4dfaf;font:20px Georgia,serif">Cronache del settore</td></tr>
<tr><td style="padding:24px">
<h1 style="font:normal 27px/1.2 Georgia,serif;color:#25523a;margin:0 0 16px;overflow-wrap:anywhere">$title</h1>
<p style="margin:0;overflow-wrap:anywhere">$body</p>
$report
<p style="margin:24px 0 0"><a href="$url" style="display:inline-block;background:#c2a66b;color:#111714;font-weight:bold;text-decoration:none;padding:11px 16px;border-radius:3px">$label</a></p>
</td></tr></table></td></tr></table>
</body></html>
HTML;
    return [$html,$text."\n\n".$message['label']."\n".$message['url']];
}

function deliverSectorEmail(array $config, array $job): void {
    $message=json_decode($job['payload'],true,16,JSON_THROW_ON_ERROR);
    [$html,$text]=renderSectorEmail($message);
    if(($config['transport']??'smtp')==='capture') {
        if(PHP_SAPI!=='cli') throw new RuntimeException('Capture runs in CLI only');
        $line=json_encode(['to'=>$job['recipient'],'subject'=>$message['subject'],'html'=>$html,'text'=>$text],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
        if(file_put_contents($config['capture_path'],$line,FILE_APPEND|LOCK_EX)!==strlen($line)) throw new RuntimeException('Capture failed');
        return;
    }
    require_once __DIR__.'/vendor/autoload.php';
    $mailer=new PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host=$config['smtp_host']??'smtps.aruba.it';
    $mailer->Port=(int)($config['smtp_port']??465);
    $mailer->SMTPSecure=PHPMailer::ENCRYPTION_SMTPS;
    $mailer->SMTPAuth=true;
    $mailer->Username=$config['username'];
    $mailer->Password=$config['password'];
    $mailer->Timeout=8;
    $mailer->CharSet=PHPMailer::CHARSET_UTF8;
    $mailer->setFrom($config['username'],$config['from_name']??'Cronache del settore');
    if(!empty($config['reply_to'])) $mailer->addReplyTo($config['reply_to']);
    $mailer->addAddress($job['recipient']);
    $mailer->Subject=$message['subject'];
    $mailer->isHTML(true);
    $mailer->Body=$html;
    $mailer->AltBody=$text;
    $mailer->send();
}

function authorizeMailWorker(array $mail): void {
    if(PHP_SAPI==='cli') return;
    require __DIR__.'/https.php';
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    $user=$_SERVER['PHP_AUTH_USER']??'';
    $password=$_SERVER['PHP_AUTH_PW']??'';
    $header=$_SERVER['HTTP_AUTHORIZATION']??'';
    if($user==='' && strncasecmp($header,'Basic ',6)===0) {
        $decoded=base64_decode(substr($header,6),true);
        if($decoded!==false) [$user,$password]=array_pad(explode(':',$decoded,2),2,'');
    }
    $secret=$mail['worker_secret']??'';
    if(!is_string($secret) || strlen($secret)<32 || $user!=='warmer-mail' || !hash_equals($secret,$password)) {
        header('WWW-Authenticate: Basic realm="Warmer Mail"');
        http_response_code(401);
        exit;
    }
}

try {
    $mail=sectorMailConfig();
    if($mail===null) {
        if(PHP_SAPI!=='cli') http_response_code(404);
        exit;
    }
    authorizeMailWorker($mail);
    if(PHP_SAPI!=='cli' && $_SERVER['REQUEST_METHOD']==='HEAD') exit;
    if(PHP_SAPI!=='cli' && !in_array($_SERVER['REQUEST_METHOD'],['GET','POST'],true)) {
        http_response_code(405);
        exit;
    }
    $config=require __DIR__.'/config.php';
    $storage=new SectorStorage($config['database']);
    $storage->releaseApplicationLock();
    $sent=0;
    $failed=0;
    $deadline=microtime(true)+18;
    for($i=0;$i<8 && microtime(true)<$deadline;$i++) {
        $job=$storage->claimMail();
        if(!$job) break;
        try {
            deliverSectorEmail($mail,$job);
        } catch(Throwable $error) {
            error_log('Warmer mail delivery failed for job '.$job['id']);
            $storage->finishMail($job,false);
            $failed++;
            continue;
        }
        $storage->finishMail($job,true);
        $sent++;
    }
    echo "Inviate: $sent. Da riprovare: $failed.\n";
    if($failed) {
        if(PHP_SAPI!=='cli') http_response_code(503);
        exit(1);
    }
} catch(Throwable $error) {
    error_log('Warmer mail worker failed');
    if(PHP_SAPI!=='cli') http_response_code(503);
    exit(1);
}
