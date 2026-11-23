[CmdletBinding()]
param([string]$RepositoryDirectory, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if(-not $RepositoryDirectory){$RepositoryDirectory=Split-Path -Parent $PSScriptRoot}
Push-Location -LiteralPath $RepositoryDirectory
try {
    if ((git branch --show-current) -ne 'feature/profilo-statistiche-ricerca') { throw 'Aprire il branch feature/profilo-statistiche-ricerca.' }
    if (git status --porcelain) { throw 'Committare le modifiche prima della pubblicazione.' }
    if (-not (Test-Path -LiteralPath 'docs/profilo-statistiche-pr.md')) { throw 'Descrizione PR assente.' }
    if ($CheckOnly) { Write-Host 'Branch e checkout pulito verificati. Nessuna connessione o modifica remota.'; return }
    git fetch origin
    if ($LASTEXITCODE -ne 0) { throw 'GitHub non raggiungibile: nessuna PR pubblicata.' }
    git merge-base --is-ancestor origin/main HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Main contiene nuovi commit: integrarli, risolvere i conflitti, ripetere i test e rigenerare il pacchetto prima di pubblicare.' }
    git push -u origin feature/profilo-statistiche-ricerca
    if ($LASTEXITCODE -ne 0) { throw 'Push GitHub non riuscito.' }
    # Write the credential protocol directly: Windows PowerShell pipelines may add a BOM.
    $credentialProcess=New-Object System.Diagnostics.Process
    $credentialProcess.StartInfo.FileName='git'
    $credentialProcess.StartInfo.Arguments='credential fill'
    $credentialProcess.StartInfo.UseShellExecute=$false
    $credentialProcess.StartInfo.CreateNoWindow=$true
    $credentialProcess.StartInfo.RedirectStandardInput=$true
    $credentialProcess.StartInfo.RedirectStandardOutput=$true
    $credentialProcess.StartInfo.RedirectStandardError=$true
    try {
        $null=$credentialProcess.Start()
        $credentialBytes=[System.Text.Encoding]::UTF8.GetBytes("protocol=https`nhost=github.com`n`n")
        $credentialProcess.StandardInput.BaseStream.Write($credentialBytes,0,$credentialBytes.Length)
        $credentialProcess.StandardInput.BaseStream.Flush()
        $credentialProcess.StandardInput.Close()
        $credentialLines=@($credentialProcess.StandardOutput.ReadToEnd() -split "`r?`n")
        $credentialError=$credentialProcess.StandardError.ReadToEnd()
        $credentialProcess.WaitForExit()
        if ($credentialProcess.ExitCode -ne 0) { throw 'Credenziale GitHub non disponibile.' }
    } finally { $credentialProcess.Dispose();$credentialError=$null }
    $tokenLine=$credentialLines | Where-Object { $_.StartsWith('password=') } | Select-Object -First 1
    if (-not $tokenLine) { throw 'Credenziale GitHub mancante.' }
    $previousToken=$env:GH_TOKEN
    try {
        $env:GH_TOKEN=$tokenLine.Substring(9);$credentialLines=$null;$tokenLine=$null
        $existing=gh pr list --repo MeldrisSama/warmer --head feature/profilo-statistiche-ricerca --state open --json number --jq '.[0].number'
        if ($LASTEXITCODE -ne 0) { throw 'Lettura PR GitHub non riuscita.' }
        $title='Aggiunge statistiche personali, foto profilo e ricerca rapida'
        if ($existing) {
            gh pr edit $existing --repo MeldrisSama/warmer --title $title --body-file docs/profilo-statistiche-pr.md
        } else {
            gh pr create --repo MeldrisSama/warmer --base main --head feature/profilo-statistiche-ricerca --title $title --body-file docs/profilo-statistiche-pr.md
        }
        if ($LASTEXITCODE -ne 0) { throw 'Creazione o aggiornamento PR non riuscito.' }
        $prJson=gh pr view feature/profilo-statistiche-ricerca --repo MeldrisSama/warmer --json number,url,state,headRefOid,mergeable,mergeStateStatus
        if ($LASTEXITCODE -ne 0) { throw 'Verifica PR non riuscita.' }
        $pr=$prJson | ConvertFrom-Json
        if ($pr.state -ne 'OPEN' -or $pr.headRefOid -ne (git rev-parse HEAD)) { throw 'La nuova PR non corrisponde al commit locale: non chiudo le precedenti.' }
        Write-Host "Nuova PR verificata: $($pr.url)"
        $oldPrs=@{28='feature/immagine-profilo';29='feature/lista-dal-roster';30='feature/ricerca-rapida';31='feature/schede-stampabili'}
        foreach ($number in @($oldPrs.Keys | Sort-Object)) {
            $oldJson=gh pr view $number --repo MeldrisSama/warmer --json state,headRefName,url
            if ($LASTEXITCODE -ne 0) { throw "Lettura PR $number fallita." }
            $old=$oldJson | ConvertFrom-Json
            if ($old.headRefName -ne $oldPrs[$number]) { throw "PR $number diversa da quella prevista: nessuna chiusura." }
            if ($old.state -eq 'OPEN') {
                gh pr close $number --repo MeldrisSama/warmer
                if ($LASTEXITCODE -ne 0) { throw "Chiusura PR $number fallita." }
                $status=gh pr view $number --repo MeldrisSama/warmer --json state --jq '.state'
                if ($LASTEXITCODE -ne 0 -or $status -ne 'CLOSED') { throw "Chiusura PR $number non verificata." }
            }
            Write-Host "PR $number gestita: $($old.url). Branch conservato."
        }
        Write-Host $prJson
    } finally { $env:GH_TOKEN=$previousToken;$previousToken=$null;$credentialLines=$null;$tokenLine=$null }
} finally { Pop-Location }
