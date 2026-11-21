[CmdletBinding()]
param([string]$RepositoryDirectory = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $RepositoryDirectory
try {
    if ((git branch --show-current) -ne 'feature/pwa-offline') { throw 'Aprire il branch feature/pwa-offline.' }
    if (git status --porcelain) { throw 'Committare le modifiche prima della pubblicazione.' }
    git fetch origin
    if ($LASTEXITCODE -ne 0) { throw 'GitHub non raggiungibile: nessuna PR pubblicata.' }
    git merge-base --is-ancestor origin/main HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Main contiene nuovi commit: integrarli, risolvere i conflitti, ripetere i test e rigenerare il pacchetto prima di pubblicare.' }
    git push -u origin feature/pwa-offline
    if ($LASTEXITCODE -ne 0) { throw 'Push GitHub non riuscito.' }
    $credentialLines=@("protocol=https`nhost=github.com`n`n" | git credential fill)
    if ($LASTEXITCODE -ne 0) { throw 'Credenziale GitHub non disponibile.' }
    $tokenLine=$credentialLines | Where-Object { $_.StartsWith('password=') } | Select-Object -First 1
    if (-not $tokenLine) { throw 'Credenziale GitHub mancante.' }
    $previousToken=$env:GH_TOKEN
    try {
        $env:GH_TOKEN=$tokenLine.Substring(9);$credentialLines=$null;$tokenLine=$null
        $existing=gh pr list --repo MeldrisSama/warmer --head feature/pwa-offline --state open --json number --jq '.[0].number'
        if ($LASTEXITCODE -ne 0) { throw 'Lettura PR GitHub non riuscita.' }
        $title='Rilascia Cronache del settore con PWA offline e corregge i salvataggi'
        if ($existing) {
            gh pr edit $existing --repo MeldrisSama/warmer --title $title --body-file docs/pwa-pr-body.md
        } else {
            gh pr create --repo MeldrisSama/warmer --base main --head feature/pwa-offline --title $title --body-file docs/pwa-pr-body.md
        }
        if ($LASTEXITCODE -ne 0) { throw 'Creazione o aggiornamento PR non riuscito.' }
        gh pr view feature/pwa-offline --repo MeldrisSama/warmer --json number,url,state,headRefOid,mergeable,mergeStateStatus
        if ($LASTEXITCODE -ne 0) { throw 'Verifica PR non riuscita.' }
    } finally { $env:GH_TOKEN=$previousToken;$previousToken=$null;$credentialLines=$null;$tokenLine=$null }
} finally { Pop-Location }
