[CmdletBinding()]
param(
    [string]$HostName = 'ftp.cangiolone.com',
    [string]$UserName,
    [int]$Port = 21,
    [string]$RemoteDirectory = '/cangiolone.com/warhammer',
    [switch]$CheckOnly,
    [switch]$CheckConnection
)

$ErrorActionPreference = 'Stop'
$package = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'files/warhammer'))
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$files = @($manifest.files)
if ($manifest.environment -ne 'warhammer-production' -or $manifest.commit -notmatch '^[a-f0-9]{40}$') { throw 'Manifest ufficiale non valido.' }
if ($RemoteDirectory.TrimEnd('/') -notin @('/cangiolone.com/warhammer', '/warhammer')) { throw 'Destinazione non consentita: usare /cangiolone.com/warhammer oppure /warhammer.' }
$requiredFiles = @('storage.php', 'router.php', 'statistics.js', 'theme.js', 'style.css', 'builder.js', 'builder-workbench.js', 'builder.css', 'app.js', 'api.php', 'index.php', 'service-worker.php')
if ($manifest.release -ne 'profilo-statistiche-ricerca') { throw 'Pacchetto non dedicato a profilo, statistiche e ricerca.' }
foreach ($file in $files) { if ($file.file -notin $requiredFiles) { throw "File estraneo al pacchetto: $($file.file)" } }
foreach ($required in $requiredFiles) { if ($required -notin $files.file) { throw "File obbligatorio assente: $required" } }
if (@($files.file | Select-Object -Unique).Count -ne $files.Count -or $files[-1].file -ne 'service-worker.php') { throw 'Manifest duplicato o ordine di pubblicazione non valido.' }
foreach ($file in $files) {
    if ($file.file -notmatch '^[a-zA-Z0-9_./-]+$' -or $file.file.Contains('..') -or $file.file.StartsWith('/')) { throw 'Percorso non valido nel manifest.' }
    if ($file.file -notmatch '^(?:assets/(?:factions/[a-zA-Z0-9_.-]+\.(?:svg|json|md|txt)|pwa/(?:icon-(?:192|512)|logo-192)\.png)|[a-z0-9-]+\.(?:php|js|css|json|webmanifest)|web\.config)$' -or $file.file -in @('config.php','composer.json')) { throw "File estraneo al rilascio: $($file.file)" }
    $local = Join-Path $package $file.file
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($local))).Replace('-', '') } finally { $sha.Dispose() }
    if ($hash -ne $file.sha256) { throw "File locale diverso dal pacchetto verificato: $($file.file)" }
}
Write-Host "Pacchetto verificato: $($files.Count) file, checksum SHA-256 corretti. Commit $($manifest.commit)."
$totalFiles = $files.Count
if ($CheckOnly) { return }

$curl = (Get-Command curl.exe -ErrorAction Stop).Source
if (-not $HostName) { $HostName = Read-Host 'Host FTP del pannello hosting (senza ftp://)' }
if ([Uri]::CheckHostName($HostName) -eq [UriHostNameType]::Unknown) { throw 'Host FTP non valido: indicare solo il nome host o IP.' }
if (-not $UserName) { $UserName = Read-Host 'Utente FTP' }
if ([string]::IsNullOrWhiteSpace($UserName)) { throw 'Utente FTP mancante.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Porta non valida.' }
if (-not $RemoteDirectory.StartsWith('/') -or $RemoteDirectory.Contains('..')) { throw 'Directory FTP non valida.' }
$RemoteDirectory = $RemoteDirectory.TrimEnd('/')
# The verified FTP server for this domain presents Aruba's *.aruba.it certificate.
# curl connects to the requested FTP server while verifying the provider identity.
# Chain, expiry, host and revocation validation remain enabled; no insecure flags.
$tlsHost = $HostName
if ($HostName -in @('cangiolone.com', 'ftp.cangiolone.com')) { $tlsHost = 'aruba.it' }
$scheme = 'ftp'
if ($Port -eq 990) { $scheme = 'ftps' }
Write-Host "Destinazione: FTPS, ${HostName}:${Port}${RemoteDirectory}/"
Write-Host "Nome verificato nel certificato TLS: $tlsHost"
if ($CheckConnection) { Write-Host 'Solo verifica accesso e directory: nessun upload.' }
else { Write-Host "Vengono sovrascritti solo $totalFiles file del manifest. Nessuna cancellazione." }
$password = Read-Host 'Password FTP' -AsSecureString
$credential = New-Object System.Net.NetworkCredential($UserName, $password)

function Invoke-BuilderFtp([string]$RelativePath, [string]$LocalFile) {
    $uri = New-Object UriBuilder($scheme, $tlsHost, $Port)
    $uri.Path = $RemoteDirectory + '/' + $RelativePath
    $curlArguments = @('--disable', '--config', '-', '--silent', '--show-error', '--ssl-reqd', '--proto', '=ftp,ftps', '--connect-timeout', '20', '--max-time', '120', '--noproxy', '*')
    if ($tlsHost -ne $HostName) { $curlArguments += @('--connect-to', "${tlsHost}:${Port}:${HostName}:${Port}") }
    if ($LocalFile) { $curlArguments += @('--ftp-create-dirs', '--upload-file', $LocalFile) }
    else { $curlArguments += '--list-only' }
    $curlArguments += @('--url', $uri.Uri.AbsoluteUri)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $curl
    # No shell is involved. The arguments contain no credentials.
    $start.Arguments = ($curlArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $null = $process.Start()
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    try {
        # Supply the password via stdin only: no file, command line or log.
        $auth = ($UserName + ':' + $credential.Password).Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
        $process.StandardInput.WriteLine('user = "' + $auth + '"')
        $process.StandardInput.Close()
        $auth = $null
        $process.WaitForExit()
        $null = $outputTask.GetAwaiter().GetResult()
        $detail = $errorTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "FTPS fallito (curl $($process.ExitCode)): $detail" }
    } finally {
        $auth = $null
        $process.Dispose()
    }
}

try {
    # Check login and the existing application directory before any remote write.
    Invoke-BuilderFtp '' ''
    Write-Host 'Connessione TLS, credenziali e directory remota verificate.'
    if ($CheckConnection) { return }
    # Manifest order: assets, dependencies, client, API, HTML, service worker last.
    $ordered = $files
    $completed = 0
    foreach ($file in $ordered) {
        Invoke-BuilderFtp $file.file (Join-Path $package $file.file)
        $completed++
        Write-Host "[$completed/$totalFiles] $($file.file)"
    }
    Write-Host 'Upload completato su Cronache del settore. Riaprire online; nessuna importazione del catalogo o nuova registrazione necessaria.'
} finally {
    $credential = $null
    $password.Dispose()
}
