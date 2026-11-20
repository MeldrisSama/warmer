[CmdletBinding()]
param(
    [string]$HostName,
    [string]$UserName,
    [int]$Port = 21,
    [ValidateSet('/cangiolone.com','/')][string]$RemoteRoot = '/cangiolone.com',
    [ValidateSet('https://cangiolone.com','https://www.cangiolone.com')][string]$PublicOrigin = 'https://www.cangiolone.com',
    [switch]$CheckOnly,
    [switch]$CheckConnection,
    [switch]$CheckHttp
)
$ErrorActionPreference = 'Stop'
$package = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'files'))
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 1 -or $manifest.environment -ne 'warhammer-pwa-test') { throw 'Questo non e un pacchetto PWA TEST.' }
$files = @($manifest.files)
if ($files.Count -lt 40 -or (@($files.file | Select-Object -Unique)).Count -ne $files.Count) { throw 'Elenco file incompleto o duplicato.' }
$allowedStorage = @('mdb-database/warhammer-pwa-test/web.config','mdb-database/warhammer-pwa-test/probe.txt','mdb-database/warhammer-pwa-test/seed.sqlite.gz')
foreach ($file in $files) {
    if ($file.file -notmatch '^[a-zA-Z0-9_./-]+$' -or $file.file.Contains('..') -or $file.file.StartsWith('/')) { throw 'Percorso non valido nel manifest.' }
    if (-not $file.file.StartsWith('warhammer-test/') -and $file.file -notin $allowedStorage) { throw 'File fuori dalle due cartelle di prova.' }
    $local = [IO.Path]::GetFullPath((Join-Path $package $file.file))
    if (-not $local.StartsWith($package + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'File fuori dal pacchetto.' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($local))).Replace('-', '') } finally { $sha.Dispose() }
    if ((New-Object IO.FileInfo($local)).Length -ne $file.size -or $hash -ne $file.sha256) { throw "Checksum non valido: $($file.file)" }
    $expectedInitial = $file.file -in @('warhammer-test/config.php','mdb-database/warhammer-pwa-test/seed.sqlite.gz')
    if ([bool]$file.initialOnly -ne $expectedInitial) { throw 'Politica di conservazione config/database non valida.' }
}
foreach ($required in @('warhammer-test/config.php','warhammer-test/index.php','warhammer-test/service-worker.php','warhammer-test/offline.js','warhammer-test/test-status.php','mdb-database/warhammer-pwa-test/web.config','mdb-database/warhammer-pwa-test/probe.txt','mdb-database/warhammer-pwa-test/seed.sqlite.gz')) {
    if ($required -notin $files.file) { throw "File obbligatorio mancante: $required" }
}
$setupCode = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SETUP-CODE.txt') -Raw).Trim()
if ($setupCode -notmatch '^[a-f0-9]{36}$') { throw 'Codice iniziale locale non valido.' }
Write-Host "Pacchetto TEST verificato: $($files.Count) file, tutti gli SHA-256 corretti."
Write-Host "Cartelle remote consentite: $($RemoteRoot.TrimEnd('/'))/warhammer-test e $($RemoteRoot.TrimEnd('/'))/mdb-database/warhammer-pwa-test."
if ($CheckOnly) { return }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Read-TestHttp([string]$Path, [string]$Method = 'GET') {
    try { return Invoke-WebRequest -UseBasicParsing -Uri ($PublicOrigin + $Path) -Method $Method -Headers @{'X-PWA-Setup'=$setupCode} -TimeoutSec 45 -MaximumRedirection 0 }
    catch { throw "Controllo HTTPS non riuscito su ${Path}. Verificare indirizzo/certificato e usare lo stesso pacchetto della prima installazione. $($_.Exception.Message)" }
}
function Read-TestStatus {
    return (Read-TestHttp '/warhammer-test/test-status.php').Content | ConvertFrom-Json
}
function Assert-TestStatus($Status, [bool]$RequireDatabase) {
    if (-not $Status.php_supported) { throw 'Serve PHP 8.1 o successivo per la cartella di prova.' }
    if (-not $Status.sqlite_available) { throw 'Il PHP del server non ha PDO_SQLITE. Abilitare pdo_sqlite dal pannello PHP o chiedere al gestore hosting. Non viene usato MySQL come ripiego.' }
    if (-not $Status.gzip_available) { throw 'Serve zlib/gzopen per installare il seed compresso del database.' }
    if (-not $Status.directory_writable) { throw 'PHP non puo scrivere nella cartella mdb-database/warhammer-pwa-test. Nel File Manager Aruba assegnare scrittura a questa sola cartella e ai suoi file, quindi ripetere il comando.' }
    if ($RequireDatabase -and (-not $Status.database_present -or -not $Status.database_readable -or -not $Status.database_writable -or -not $Status.catalog_ready)) { throw 'Database di prova assente/non leggibile o catalogo mancante. Non sostituire un database esistente: controllare permessi e pacchetto.' }
}
function Assert-StorageProtected {
    $uri = $PublicOrigin + '/mdb-database/warhammer-pwa-test/probe.txt'
    $status = 0
    try { $status = [int](Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 30 -MaximumRedirection 0).StatusCode }
    catch {
        if ($null -eq $_.Exception.Response) { throw "Controllo HTTPS non riuscito su ${uri}: $($_.Exception.GetBaseException().Message). Se usi il dominio senza www, ripeti con -PublicOrigin 'https://www.cangiolone.com'. Nessun database verra caricato." }
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -notin @(403,404)) { throw "La cartella database non risulta protetta (HTTP $status). Fermarsi e verificare web.config prima di caricare il database." }
    Write-Host 'Protezione storage verificata via HTTPS: accesso pubblico negato.'
}
if ($CheckHttp) {
    Assert-StorageProtected
    $status = Read-TestStatus
    Assert-TestStatus $status $true
    Write-Host "HTTPS, PHP, SQLite, permessi e catalogo: OK. Account iniziale creato: $($status.account_ready)."
    return
}
$curl = (Get-Command curl.exe -ErrorAction Stop).Source
if (-not $HostName) { $HostName = Read-Host 'Host FTP indicato dal pannello Aruba (senza ftp://)' }
if ([Uri]::CheckHostName($HostName) -eq [UriHostNameType]::Unknown) { throw 'Host FTP non valido.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Porta non valida.' }
if (-not $UserName) { $UserName = Read-Host 'Utente FTP' }
if ([string]::IsNullOrWhiteSpace($UserName)) { throw 'Utente FTP mancante.' }
$tlsHost = $HostName
# Same provider identity as the existing, previously verified Aruba uploader.
if ($HostName -in @('cangiolone.com','ftp.cangiolone.com')) { $tlsHost = 'aruba.it' }
$scheme = 'ftp'; if ($Port -eq 990) { $scheme = 'ftps' }
Write-Host "FTPS ${HostName}:${Port}; identita TLS verificata: $tlsHost."
if ($CheckConnection) { Write-Host 'Solo connessione e lettura directory: nessuna scrittura.' }
$password = Read-Host 'Password FTP' -AsSecureString
$credential = New-Object System.Net.NetworkCredential($UserName, $password)
function Invoke-TestFtp([string]$RelativePath, [string]$LocalFile) {
    $uri = New-Object UriBuilder($scheme, $tlsHost, $Port)
    $uri.Path = $RemoteRoot.TrimEnd('/') + '/' + $RelativePath
    $arguments = @('--disable','--config','-','--silent','--show-error','--ssl-reqd','--proto','=ftp,ftps','--connect-timeout','20','--max-time','180','--noproxy','*')
    if ($tlsHost -ne $HostName) { $arguments += @('--connect-to', "${tlsHost}:${Port}:${HostName}:${Port}") }
    if ($LocalFile) { $arguments += @('--dump-header','-','--ftp-create-dirs','--upload-file',$LocalFile) } else { $arguments += '--list-only' }
    $arguments += @('--url',$uri.Uri.AbsoluteUri)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $curl
    $start.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }) -join ' '
    $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process; $process.StartInfo = $start
    $null = $process.Start()
    $outputTask = $process.StandardOutput.ReadToEndAsync(); $errorTask = $process.StandardError.ReadToEndAsync()
    try {
        $auth = ($UserName + ':' + $credential.Password).Replace('\','\\').Replace('"','\"').Replace("`r",'\r').Replace("`n",'\n')
        $process.StandardInput.WriteLine('user = "' + $auth + '"'); $process.StandardInput.Close(); $auth = $null
        $process.WaitForExit()
        $output = $outputTask.GetAwaiter().GetResult(); $detail = $errorTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "FTPS fallito su $RelativePath (curl $($process.ExitCode)): $detail $((@($output -split "`n" | Where-Object { $_ -match "^[45][0-9][0-9] " })) -join "; ")" }
        return $output
    } finally { $auth = $null; $process.Dispose() }
}
function Names([string]$Listing) { return @($Listing -split "`n" | ForEach-Object { ($_ -replace "`r",'').TrimEnd('/') } | Where-Object { $_ -ne '' }) }
$uploaded = New-Object 'System.Collections.Generic.HashSet[string]'
function Upload([string]$RelativePath) {
    if ($RelativePath -notin $files.file) { throw 'Upload fuori manifest.' }
    Write-Host "Invio: $RelativePath"
    $null = Invoke-TestFtp $RelativePath (Join-Path $package $RelativePath)
    $null = $uploaded.Add($RelativePath)
    Write-Host "[$($uploaded.Count)/$($files.Count)] $RelativePath"
}
try {
    $rootNames = Names (Invoke-TestFtp '' '')
    Write-Host 'TLS, credenziali e cartella radice verificati.'
    if ($CheckConnection) { return }
    $appNames = @(); $storageNames = @()
    if ('warhammer-test' -in $rootNames) { $appNames = Names (Invoke-TestFtp 'warhammer-test/' '') }
    if ('mdb-database' -in $rootNames) {
        $databaseNames = Names (Invoke-TestFtp 'mdb-database/' '')
        if ('warhammer-pwa-test' -in $databaseNames) { $storageNames = Names (Invoke-TestFtp 'mdb-database/warhammer-pwa-test/' '') }
    }
    # Check protection before sending a database file.
    Upload 'mdb-database/warhammer-pwa-test/web.config'
    Upload 'mdb-database/warhammer-pwa-test/probe.txt'
    Assert-StorageProtected
    Upload 'warhammer-test/web.config'
    Upload 'warhammer-test/https.php'
    if ('config.php' -notin $appNames) { Upload 'warhammer-test/config.php' } else { Write-Host 'Config di prova esistente: conservata.' }
    Upload 'warhammer-test/test-status.php'
    $before = Read-TestStatus
    Assert-TestStatus $before $false
    if (-not $before.database_present) {
        Upload 'mdb-database/warhammer-pwa-test/seed.sqlite.gz'
        Write-Host 'Installazione del seed tramite PHP: verifica SHA-256 e dimensione prima di creare SQLite.'
        $installed = (Read-TestHttp '/warhammer-test/test-status.php' 'POST').Content | ConvertFrom-Json
        Assert-TestStatus $installed $true
    } else {
        Write-Host 'Database di prova esistente: conservato, insieme ad account e liste.'
        Assert-TestStatus $before $true
    }
    foreach ($file in $files) {
        if ($uploaded.Contains($file.file) -or $file.initialOnly -or $file.file -in @('warhammer-test/index.php','warhammer-test/service-worker.php')) { continue }
        Upload $file.file
    }
    Upload 'warhammer-test/index.php'
    Upload 'warhammer-test/service-worker.php'
    Write-Host "Upload completato. Apri ${PublicOrigin}/warhammer-test/"
    Write-Host 'Al primo accesso usa il codice in SETUP-CODE.txt e crea un account di prova.'
    Write-Host 'Nessuna cancellazione. Il sito ufficiale e i suoi file/database non sono stati modificati.'
} finally { $credential = $null; if ($null -ne $password) { $password.Dispose() }; $setupCode = $null }
