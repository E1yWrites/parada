<#
==============================================================================
 PARADA - offline launcher for local simulation and testing (Windows)
==============================================================================

 Runs the whole PARADA stack on this PC with no internet connection:
   embedded PostgreSQL -> API -> admin dashboard -> mobile app (Expo Go)
   -> optional vision/OCR camera runtime, plus a gate-traffic simulator and
   the automated test suites. It asks for everything it needs as it goes.

 Usage (from the repository root):
   run-offline.cmd               interactive menu (or just double-click it)
   run-offline.cmd start         start the stack
   run-offline.cmd simulate      send simulated gate-camera traffic
   run-offline.cmd test          run the automated test suites
   run-offline.cmd check         offline-readiness report only
   run-offline.cmd prepare       ONE TIME, WHILE ONLINE: install, build,
                                 download OCR weights, generate fixtures
   run-offline.cmd status        what is running, ports, zone occupancy
   run-offline.cmd stop          stop everything this launcher started

 What it never does:
   - print or store secrets (JWT secret, camera key, passwords, DB URL)
   - edit your .env files without asking first
   - reset or wipe the database (seeding is an upsert and is opt-in)
   - commit or push anything

 State (answers you gave, process ids, logs) lives in .offline\ at the
 repository root, which ignores itself in git.

 Compatible with Windows PowerShell 5.1 and PowerShell 7+. ASCII only, on
 purpose: Windows PowerShell 5.1 misreads non-ASCII in BOM-less scripts.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('menu', 'start', 'simulate', 'test', 'check', 'prepare', 'status', 'stop')]
    [string]$Action = 'menu'
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow on 5.1 with the progress bar

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$StateDir = Join-Path $Root '.offline'
$LogDir = Join-Path $StateDir 'logs'
$PidFile = Join-Path $StateDir 'processes.json'
$CfgFile = Join-Path $StateDir 'answers.json'

$ApiPort = 4100
$AdminPort = 3000
$DbPort = 5442
$MetroPort = 8082

$ApiDir = Join-Path $Root 'services\api'
$AdminDir = Join-Path $Root 'apps\admin'
$MobileDir = Join-Path $Root 'apps\mobile'
$VisionDir = Join-Path $Root 'services\vision'
$ApiEnvPath = Join-Path $ApiDir '.env'
$ApiEnvExample = Join-Path $ApiDir '.env.example'
$AdminEnvPath = Join-Path $AdminDir '.env.local'
$VenvPython = Join-Path $VisionDir '.venv\Scripts\python.exe'
$FixtureVideo = Join-Path $VisionDir 'tests\fixtures\videos\clear_plate.mp4'
$EmbeddedDbUrl = 'postgresql://parada:changeme@127.0.0.1:5442/parada?schema=public'

# Plates registered by packages/database/src/seed (driver + admin vehicles).
$SeedPlates = @('ABC-1234', 'XYZ-5678', 'MNO-9999')

$PsExe = (Get-Process -Id $PID).Path
$script:Answers = @{}
$script:SimRows = @()
$script:AdminPw = $null

# ---------------------------------------------------------------------------
# Console helpers
# ---------------------------------------------------------------------------
function Write-Section([string]$Title) {
    Write-Host ''
    Write-Host ('== ' + $Title + ' ' + ('=' * [Math]::Max(3, 70 - $Title.Length))) -ForegroundColor Cyan
}
function Write-Ok([string]$m) { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Write-Warn2([string]$m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Bad([string]$m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Write-Info([string]$m) { Write-Host "         $m" -ForegroundColor DarkGray }

function Show-Banner {
    Write-Host ''
    Write-Host '  ____   _    ____      _    ____    _    ' -ForegroundColor Red
    Write-Host ' |  _ \ / \  |  _ \    / \  |  _ \  / \   ' -ForegroundColor Red
    Write-Host ' | |_) / _ \ | |_) |  / _ \ | | | |/ _ \  ' -ForegroundColor Red
    Write-Host ' |  __/ ___ \|  _ <  / ___ \| |_| / ___ \ ' -ForegroundColor Red
    Write-Host ' |_| /_/   \_\_| \_\/_/   \_\____/_/   \_\' -ForegroundColor Red
    Write-Host '  Offline launcher - local simulation and testing' -ForegroundColor Gray
    Write-Host "  Repository: $Root" -ForegroundColor DarkGray
}

function Read-Choice {
    param([string]$Question, [string[]]$Options, [int]$Default = 1)
    if ($Default -lt 1 -or $Default -gt $Options.Count) { $Default = 1 }
    Write-Host ''
    Write-Host $Question -ForegroundColor White
    for ($i = 0; $i -lt $Options.Count; $i++) {
        $mark = ' '
        if (($i + 1) -eq $Default) { $mark = '>' }
        Write-Host ('  {0} [{1}] {2}' -f $mark, ($i + 1), $Options[$i])
    }
    while ($true) {
        $raw = Read-Host ('  Choose 1-{0} (Enter = {1})' -f $Options.Count, $Default)
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        $n = 0
        if ([int]::TryParse($raw.Trim(), [ref]$n) -and $n -ge 1 -and $n -le $Options.Count) { return $n }
        Write-Host '  Please type one of the numbers above.' -ForegroundColor Yellow
    }
}

function Read-YesNo {
    param([string]$Question, [bool]$Default = $true)
    $hint = 'y/N'
    if ($Default) { $hint = 'Y/n' }
    while ($true) {
        $raw = Read-Host ('{0} [{1}]' -f $Question, $hint)
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        $t = $raw.Trim().ToLower()
        if ($t -eq 'y' -or $t -eq 'yes') { return $true }
        if ($t -eq 'n' -or $t -eq 'no') { return $false }
        Write-Host '  Please answer y or n.' -ForegroundColor Yellow
    }
}

function Read-Text {
    param([string]$Question, [string]$Default = '', [scriptblock]$Validate = $null, [string]$Hint = 'That value is not valid.')
    while ($true) {
        $prompt = $Question
        if ($Default) { $prompt = "$Question (Enter = $Default)" }
        $raw = Read-Host $prompt
        if ([string]::IsNullOrWhiteSpace($raw)) { $raw = $Default }
        $raw = "$raw".Trim()
        if ($null -eq $Validate) { return $raw }
        if (& $Validate $raw) { return $raw }
        Write-Host "  $Hint" -ForegroundColor Yellow
    }
}

function Read-Int {
    param([string]$Question, [int]$Default, [int]$Min = 0, [int]$Max = 100000)
    $v = Read-Text -Question $Question -Default "$Default" -Hint "Type a whole number from $Min to $Max." -Validate {
        param($x)
        $n = 0
        return ([int]::TryParse($x, [ref]$n) -and $n -ge $Min -and $n -le $Max)
    }
    return [int]$v
}

function ConvertFrom-SecureText([Security.SecureString]$Secure) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Read-Password {
    param([string]$Question, [switch]$NoConfirm)
    while ($true) {
        $a = ConvertFrom-SecureText (Read-Host "$Question (hidden)" -AsSecureString)
        if ($a.Length -lt 8 -or $a.Length -gt 128) {
            Write-Host '  The API requires 8 to 128 characters.' -ForegroundColor Yellow
            continue
        }
        if ($NoConfirm) { return $a }
        $b = ConvertFrom-SecureText (Read-Host '  Type it again to confirm' -AsSecureString)
        if ($a -ne $b) {
            Write-Host '  Those did not match - try again.' -ForegroundColor Yellow
            continue
        }
        return $a
    }
}

# ---------------------------------------------------------------------------
# State: saved answers (never secrets) and the processes this launcher started
# ---------------------------------------------------------------------------
function Initialize-State {
    foreach ($d in @($StateDir, $LogDir)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    $gi = Join-Path $StateDir '.gitignore'
    if (-not (Test-Path $gi)) { Set-Content -Path $gi -Value '*' -Encoding ASCII }
}

function Get-Answers {
    $h = @{}
    if (Test-Path $CfgFile) {
        try {
            $o = Get-Content -Path $CfgFile -Raw | ConvertFrom-Json
            foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }
        } catch { }
    }
    return $h
}

function Save-Answers {
    try { ($script:Answers | ConvertTo-Json) | Set-Content -Path $CfgFile -Encoding UTF8 } catch { }
}

function Get-Answer([string]$Key, $Default) {
    if ($script:Answers.ContainsKey($Key) -and $null -ne $script:Answers[$Key] -and "$($script:Answers[$Key])" -ne '') {
        return $script:Answers[$Key]
    }
    return $Default
}

function Get-Tracked {
    if (Test-Path $PidFile) {
        try { return @(Get-Content -Path $PidFile -Raw | ConvertFrom-Json) } catch { }
    }
    return @()
}

function Add-Tracked([string]$Name, [int]$ProcId) {
    $list = @(Get-Tracked | Where-Object { $_.name -ne $Name })
    $list += [pscustomobject]@{ name = $Name; pid = $ProcId; started = (Get-Date).ToString('s') }
    ConvertTo-Json -InputObject @($list) | Set-Content -Path $PidFile -Encoding ASCII
}

function Test-TrackedRunning([string]$Name) {
    $t = Get-Tracked | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if (-not $t) { return $false }
    return [bool](Get-Process -Id $t.pid -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# .env handling (values are read for decisions, never printed)
# ---------------------------------------------------------------------------
function Read-EnvFile([string]$Path) {
    $h = @{}
    if (-not (Test-Path $Path)) { return $h }
    foreach ($line in Get-Content -Path $Path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $v = $Matches[2].Trim()
            if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
                $v = $v.Substring(1, $v.Length - 2)
            }
            $h[$Matches[1]] = $v
        }
    }
    return $h
}

function Set-EnvFileValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = @()
    if (Test-Path $Path) { $lines = @(Get-Content -Path $Path) }
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ('^\s*' + [regex]::Escape($Key) + '\s*=')) {
            $lines[$i] = $Key + '="' + $Value + '"'
            $found = $true
        }
    }
    if (-not $found) { $lines += ($Key + '="' + $Value + '"') }
    # UTF-8 WITHOUT a BOM: a BOM would glue itself to the first key and dotenv would miss it.
    [IO.File]::WriteAllLines($Path, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
}

function New-RandomBytes([int]$Count) {
    $buf = New-Object byte[] $Count
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($buf)
    $rng.Dispose()
    return , $buf
}
function New-Base64Secret([int]$Bytes = 48) { return [Convert]::ToBase64String((New-RandomBytes $Bytes)) }
function New-HexSecret([int]$Bytes = 32) { return (-join ((New-RandomBytes $Bytes) | ForEach-Object { $_.ToString('x2') })) }

function Initialize-ApiEnv {
    if (-not (Test-Path $ApiEnvPath)) {
        Write-Warn2 'services\api\.env does not exist yet - the API cannot start without it.'
        if (-not (Read-YesNo '  Create it from .env.example with freshly generated secrets?' $true)) { return $false }
        Copy-Item -Path $ApiEnvExample -Destination $ApiEnvPath
        Set-EnvFileValue $ApiEnvPath 'JWT_SECRET' (New-Base64Secret 48)
        Set-EnvFileValue $ApiEnvPath 'CAMERA_API_KEY' (New-HexSecret 32)
        Write-Ok 'Created services\api\.env (secrets generated on this PC; not shown)'
    }
    $e = Read-EnvFile $ApiEnvPath
    $db = "$($e['DATABASE_URL'])"
    if (-not $db -or $db -like '*user:password@host:port*') {
        Write-Warn2 'DATABASE_URL in services\api\.env is empty or still the placeholder.'
        if (Read-YesNo '  Point it at the embedded development database (127.0.0.1:5442)?' $true) {
            Set-EnvFileValue $ApiEnvPath 'DATABASE_URL' $EmbeddedDbUrl
            Write-Ok 'DATABASE_URL set to the embedded database'
        } else { return $false }
    }
    $jwt = "$($e['JWT_SECRET'])"
    if (-not $jwt -or $jwt -eq 'replace-with-a-long-random-secret') {
        Write-Warn2 'JWT_SECRET in services\api\.env is empty or still the placeholder.'
        if (Read-YesNo '  Generate a new random JWT_SECRET? (signs everyone out, which is fine for testing)' $true) {
            Set-EnvFileValue $ApiEnvPath 'JWT_SECRET' (New-Base64Secret 48)
            Write-Ok 'JWT_SECRET generated (not shown)'
        } else { return $false }
    }
    if (-not "$($e['CAMERA_API_KEY'])") {
        Write-Warn2 'CAMERA_API_KEY is empty, so anyone on the network can post camera events.'
        if (Read-YesNo '  Generate one? (the launcher hands it to Vision and the simulator automatically)' $true) {
            Set-EnvFileValue $ApiEnvPath 'CAMERA_API_KEY' (New-HexSecret 32)
            Write-Ok 'CAMERA_API_KEY generated (not shown)'
        }
    }
    return $true
}

function Initialize-AdminEnv {
    $e = Read-EnvFile $AdminEnvPath
    if (-not "$($e['API_BASE_URL'])") {
        Set-EnvFileValue $AdminEnvPath 'API_BASE_URL' "http://127.0.0.1:$ApiPort"
        Write-Ok "apps\admin\.env.local: API_BASE_URL set to http://127.0.0.1:$ApiPort"
    }
}

# ---------------------------------------------------------------------------
# Process, port and HTTP helpers
# ---------------------------------------------------------------------------
function Set-OfflineEnvironment {
    $vars = @{
        NEXT_TELEMETRY_DISABLED    = '1'
        TURBO_TELEMETRY_DISABLED   = '1'
        TURBO_NO_UPDATE_NOTIFIER   = '1'
        DO_NOT_TRACK               = '1'
        CHECKPOINT_DISABLE         = '1'   # Prisma update check
        PRISMA_HIDE_UPDATE_MESSAGE = '1'
        EXPO_NO_TELEMETRY          = '1'
        EXPO_OFFLINE               = '1'   # Expo CLI: skip version/manifest network calls
        NO_UPDATE_NOTIFIER         = '1'
        npm_config_update_notifier = 'false'
        npm_config_fund            = 'false'
        npm_config_audit           = 'false'
    }
    foreach ($k in $vars.Keys) { [Environment]::SetEnvironmentVariable($k, $vars[$k], 'Process') }
}

function Get-PortOwner([int]$Port) {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return $null }
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { return $null }
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    $name = 'unknown'
    if ($p) { $name = $p.ProcessName }
    return "$name (PID $($c.OwningProcess))"
}

function Test-Url([string]$Url) {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { try { return [int]$_.Exception.Response.StatusCode } catch { } }
        return 0
    }
}

function Wait-Url([string]$Url, [int]$TimeoutSec, [string]$Label) {
    Write-Host -NoNewline "  waiting for $Label "
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $s = Test-Url $Url
        if ($s -ge 200 -and $s -lt 500) { Write-Host ' up' -ForegroundColor Green; return $true }
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 2
    }
    Write-Host ' timed out' -ForegroundColor Red
    return $false
}

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body = $null, [hashtable]$Headers = @{})
    $params = @{
        Method          = $Method
        Uri             = "http://127.0.0.1:$ApiPort$Path"
        TimeoutSec      = 20
        Headers         = $Headers
        UseBasicParsing = $true
        ErrorAction     = 'Stop'
    }
    if ($null -ne $Body) {
        $params['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
        $params['ContentType'] = 'application/json; charset=utf-8'
    }
    try {
        $r = Invoke-RestMethod @params
        return [pscustomobject]@{ Ok = $true; Status = 200; Data = $r.data; Message = '' }
    } catch {
        $status = 0
        if ($_.Exception.Response) { try { $status = [int]$_.Exception.Response.StatusCode } catch { } }
        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $msg = $_.ErrorDetails.Message
            try {
                $j = $_.ErrorDetails.Message | ConvertFrom-Json
                if ($j.error -and $j.error.message) { $msg = "$($j.error.code): $($j.error.message)" }
            } catch { }
        }
        return [pscustomobject]@{ Ok = $false; Status = $status; Data = $null; Message = $msg }
    }
}

# Runs a command in this window, mirrors it to a log, returns $true on exit code 0.
function Invoke-Step {
    param([string]$Label, [string]$CommandLine, [string]$WorkDir = $Root, [string]$LogName = 'launcher.log', [hashtable]$EnvVars = @{})
    Write-Host "  > $Label" -ForegroundColor Cyan
    Write-Info $CommandLine
    $log = Join-Path $LogDir $LogName
    ("===== {0}  {1}  ({2})" -f (Get-Date -Format 's'), $Label, $CommandLine) | Tee-Object -FilePath $log -Append | Out-Null
    $saved = @{}
    foreach ($k in $EnvVars.Keys) {
        $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
        [Environment]::SetEnvironmentVariable($k, [string]$EnvVars[$k], 'Process')
    }
    Push-Location -LiteralPath $WorkDir
    try {
        & cmd.exe /c "$CommandLine 2>&1" | Tee-Object -FilePath $log -Append | Out-Host
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    if ($code -eq 0) { Write-Ok $Label } else { Write-Bad "$Label (exit code $code) - see .offline\logs\$LogName" }
    return ($code -eq 0)
}

function ConvertTo-PsLiteral([string]$s) { return "'" + ($s -replace "'", "''") + "'" }

# Opens a long-running service in its own titled window. Environment values are
# inherited from this process (never put on the command line, so the camera key
# does not show up in process listings).
function Start-ServiceWindow {
    param([string]$Name, [string]$WorkDir, [string]$Command, [hashtable]$EnvVars = @{}, [switch]$NoLog)
    if (Test-TrackedRunning $Name) {
        Write-Ok "$Name is already running (its window is still open)"
        return
    }
    $slug = ($Name -replace '[^A-Za-z0-9]+', '-').Trim('-').ToLower()
    $log = Join-Path $LogDir "$slug.log"
    $title = "PARADA - $Name"
    if ($NoLog) {
        # Through cmd.exe so "npm run x -- --flag" keeps its "--" (npm.ps1 would swallow it) and Expo keeps a real console.
        $run = "cmd.exe /c `"$Command`""
    } else {
        $run = "cmd.exe /c `"$Command 2>&1`" | Tee-Object -FilePath $(ConvertTo-PsLiteral $log)"
    }
    $inner = @(
        "`$Host.UI.RawUI.WindowTitle = $(ConvertTo-PsLiteral $title)"
        "Set-Location -LiteralPath $(ConvertTo-PsLiteral $WorkDir)"
        "Write-Host $(ConvertTo-PsLiteral "$title   (stop it from the launcher, or close this window)") -ForegroundColor Cyan"
        $run
        "Write-Host ''; Write-Host $(ConvertTo-PsLiteral "$Name stopped. Exit code:") `$LASTEXITCODE -ForegroundColor Yellow"
    ) -join '; '
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))

    $saved = @{}
    foreach ($k in $EnvVars.Keys) {
        $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
        $val = $EnvVars[$k]
        if ($null -ne $val) { $val = [string]$val }
        [Environment]::SetEnvironmentVariable($k, $val, 'Process')
    }
    try {
        $p = Start-Process -FilePath $PsExe -WorkingDirectory $WorkDir -PassThru -ArgumentList @(
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', $encoded)
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    Add-Tracked $Name $p.Id
    if ($NoLog) { Write-Ok "$Name started in its own window" }
    else { Write-Ok "$Name started in its own window (log: .offline\logs\$slug.log)" }
}

function Get-NodeMajor {
    try {
        $v = & node -v 2>$null
        if ("$v" -match '^v(\d+)\.') { return [int]$Matches[1] }
    } catch { }
    return 0
}

function Get-LanAddresses {
    $list = @()
    if (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue) {
        $raw = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
            $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'
        }
        foreach ($a in $raw) {
            $virtual = $a.InterfaceAlias -match 'vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier|Bluetooth'
            $list += [pscustomobject]@{ Ip = $a.IPAddress; Adapter = $a.InterfaceAlias; Virtual = $virtual }
        }
    }
    return @($list | Sort-Object Virtual, Adapter)
}

# ---------------------------------------------------------------------------
# API data helpers
# ---------------------------------------------------------------------------
function Get-Zones {
    $r = Invoke-Api -Method GET -Path '/zones'
    if ($r.Ok -and $r.Data) { return @($r.Data) }
    return @()
}

function Show-Zones([array]$Zones) {
    if (-not $Zones -or $Zones.Count -eq 0) { Write-Info 'No zones returned by the API.'; return }
    $Zones | Select-Object @{ n = 'Zone'; e = { $_.code } }, @{ n = 'Name'; e = { $_.name } },
    @{ n = 'Occupied'; e = { $_.occupiedCount } }, @{ n = 'Capacity'; e = { $_.capacity } },
    @{ n = 'Available'; e = { $_.availableCount } }, @{ n = 'State'; e = { $_.availability } } |
    Format-Table -AutoSize | Out-Host
}

function Select-Zone([array]$Zones, [string]$Question) {
    $opts = @()
    $def = 1
    $savedCode = Get-Answer 'zoneCode' ''
    for ($i = 0; $i -lt $Zones.Count; $i++) {
        $z = $Zones[$i]
        $opts += ('Zone {0} - {1}  ({2}/{3} occupied)' -f $z.code, $z.name, $z.occupiedCount, $z.capacity)
        if ($z.code -eq $savedCode) { $def = $i + 1 }
    }
    $n = Read-Choice $Question $opts $def
    $zone = $Zones[$n - 1]
    $script:Answers['zoneCode'] = $zone.code
    return $zone
}

function Read-CameraId([object]$Zone) {
    $guess = 'cam-' + ("$($Zone.code)").ToLower() + '-main-gate'
    $def = Get-Answer 'cameraId' $guess
    $id = Read-Text -Question "  Gate camera identifier in zone $($Zone.code) (as registered in Admin > Cameras)" -Default $def -Validate { param($x) $x.Length -ge 1 -and $x.Length -le 128 }
    $script:Answers['cameraId'] = $id
    return $id
}

function Send-GateEvent {
    param([object]$Zone, [string]$Camera, [string]$Type, [string]$Plate, [double]$Confidence = 0.97, [string]$EventId = '')
    if (-not $EventId) { $EventId = 'offline-sim-' + [guid]::NewGuid().ToString('N').Substring(0, 16) }
    $headers = @{}
    $key = (Read-EnvFile $ApiEnvPath)['CAMERA_API_KEY']
    if ($key) { $headers['X-API-Key'] = $key }
    $body = [ordered]@{
        cameraIdentifier = $Camera
        sourceEventId    = $EventId
        eventType        = $Type
        detectedPlate    = $Plate
        ocrConfidence    = $Confidence
        detectedAt       = (Get-Date).ToUniversalTime().ToString('o')
    }
    if (-not $Plate) { $body['detectedPlate'] = $null }
    $r = Invoke-Api -Method POST -Path "/zones/$($Zone.id)/events" -Body $body -Headers $headers
    $r | Add-Member -NotePropertyName EventId -NotePropertyValue $EventId -Force
    return $r
}

# Sends one event, prints one line, records one CSV row. Returns 'ACCEPTED', 'REFUSED' or 'ERROR'.
function Send-SimEvent {
    param([object]$Zone, [string]$Camera, [string]$Type, [string]$Plate, [double]$Confidence = 0.97, [string]$EventId = '', [string]$Scenario = '')
    $r = Send-GateEvent -Zone $Zone -Camera $Camera -Type $Type -Plate $Plate -Confidence $Confidence -EventId $EventId
    $after = Get-Zones | Where-Object { $_.id -eq $Zone.id } | Select-Object -First 1
    $occ = '?'
    if ($after) { $occ = "$($after.occupiedCount)/$($after.capacity)" }
    $plateTxt = '(no plate read)'
    if ($Plate) { $plateTxt = $Plate }

    $result = 'ERROR'
    $detail = $r.Message
    $color = 'Red'
    if ($r.Ok) {
        $result = 'ACCEPTED'
        $color = 'Green'
        $detail = ''
        if ($r.Data -and $r.Data.PSObject.Properties['admitted']) {
            if ($r.Data.admitted) { $detail = 'guest admitted' }
            else { $result = 'REFUSED'; $color = 'Yellow'; $detail = "guest denied: $($r.Data.deniedReason)" }
        }
    } elseif ($r.Status -eq 409 -or $r.Status -eq 422) {
        # A business answer from the API (zone full, already inside, wrong direction...).
        $result = 'REFUSED'
        $color = 'Yellow'
    } elseif ($r.Status -eq 401) {
        $detail = 'camera key rejected - restart the API after changing CAMERA_API_KEY in services\api\.env'
    } elseif ($r.Status -eq 404) {
        $detail = "$($r.Message) - check the camera identifier in Admin > Cameras"
    } elseif ($r.Status -eq 0) {
        $detail = "API not reachable: $($r.Message)"
    }
    $line = '  [{0}] {1,-5} {2,-15} conf {3:0.00}  -> {4,-8} occupied {5}  {6}' -f (Get-Date -Format 'HH:mm:ss'), $Type, $plateTxt, $Confidence, $result, $occ, $detail
    Write-Host $line -ForegroundColor $color

    $script:SimRows += [pscustomobject]@{
        time          = (Get-Date).ToString('s')
        scenario      = $Scenario
        zone          = $Zone.code
        camera        = $Camera
        eventType     = $Type
        plate         = $plateTxt
        ocrConfidence = $Confidence
        sourceEventId = $r.EventId
        result        = $result
        httpStatus    = $r.Status
        detail        = $detail
        occupiedAfter = $occ
    }
    return $result
}

function New-RandomPlate {
    $letters = 'ABCDEFGHJKLMNPRSTUVWXYZ'
    $s = ''
    for ($i = 0; $i -lt 3; $i++) { $s += $letters[(Get-Random -Maximum $letters.Length)] }
    return ('{0}-{1}' -f $s, (Get-Random -Minimum 1000 -Maximum 9999))
}

# ---------------------------------------------------------------------------
# Readiness check
# ---------------------------------------------------------------------------
function Test-Readiness {
    $r = @{ Fatal = $false; AdminBuild = $false; Venv = $false; Weights = $false; Fixture = $false; ApiDist = $false }
    Write-Section 'Offline readiness'

    if ($env:OS -ne 'Windows_NT') { Write-Warn2 'This launcher is written for Windows; other systems can use npm run dev directly.' }

    $node = Get-NodeMajor
    if ($node -eq 0) { Write-Bad 'Node.js was not found on PATH'; Write-Info 'Install Node.js 24 LTS (needs internet once), then reopen the terminal.'; $r.Fatal = $true }
    elseif ($node -lt 18) { Write-Bad "Node.js v$node is too old (the project needs 20.19.4+; 24 LTS recommended)"; $r.Fatal = $true }
    elseif ($node -lt 20) { Write-Warn2 "Node.js v$node - API and admin run, but the mobile app (React Native 0.86 / Metro) needs 20.19.4+; install Node 24 LTS" }
    else { Write-Ok "Node.js v$node" }

    if (Test-Path (Join-Path $Root 'node_modules\turbo')) { Write-Ok 'Dependencies installed (node_modules)' }
    else { Write-Bad 'node_modules is missing - run "run-offline.cmd prepare" while online'; $r.Fatal = $true }

    if (Test-Path (Join-Path $Root 'node_modules\@embedded-postgres\windows-x64')) { Write-Ok 'Embedded PostgreSQL binaries present (no Postgres install needed)' }
    elseif ($env:OS -eq 'Windows_NT') { Write-Bad 'Embedded PostgreSQL binaries missing (node_modules\@embedded-postgres\windows-x64) - run prepare while online'; $r.Fatal = $true }

    if (Test-Path (Join-Path $Root 'node_modules\.prisma\client\index.js')) { Write-Ok 'Prisma client generated' }
    else { Write-Warn2 'Prisma client not generated yet - the API build step will try (works offline if the engines are installed)' }

    if (Test-Path $ApiEnvPath) {
        $e = Read-EnvFile $ApiEnvPath
        $problems = @()
        if (-not "$($e['DATABASE_URL'])" -or "$($e['DATABASE_URL'])" -like '*user:password@host:port*') { $problems += 'DATABASE_URL' }
        if (-not "$($e['JWT_SECRET'])" -or $e['JWT_SECRET'] -eq 'replace-with-a-long-random-secret') { $problems += 'JWT_SECRET' }
        if ($problems.Count -eq 0) { Write-Ok 'services\api\.env has DATABASE_URL and JWT_SECRET (values not shown)' }
        else { Write-Warn2 ("services\api\.env needs: " + ($problems -join ', ') + ' - the start step offers to fix it') }
        if ("$($e['CAMERA_API_KEY'])") { Write-Ok 'CAMERA_API_KEY is set (Vision and the simulator will send it)' }
        else { Write-Warn2 'CAMERA_API_KEY is empty - camera endpoint is open (acceptable on an isolated test network only)' }
        if ("$($e['NODE_ENV'])" -eq 'production') { Write-Info 'NODE_ENV=production in .env - offline runs override it to development + console mail (SMTP cannot work offline)' }
    } else { Write-Warn2 'services\api\.env missing - the start step offers to create it with generated secrets' }

    if (Test-Path (Join-Path $ApiDir 'dist\index.js')) { Write-Ok 'API build present (rebuilt automatically on start)'; $r.ApiDist = $true }
    else { Write-Warn2 'API not built yet - the start step builds it (works offline)' }

    if (Test-Path (Join-Path $AdminDir '.next\BUILD_ID')) { Write-Ok 'Admin production build present (fonts embedded, fastest start)'; $r.AdminBuild = $true }
    else { Write-Warn2 'No admin production build - dev server will be used; Google fonts fall back to system fonts offline. "prepare" fixes this.' }

    if (Test-Path (Join-Path $Root 'node_modules\expo')) { Write-Ok 'Expo CLI installed' } else { Write-Warn2 'Expo not found in node_modules - mobile cannot start' }
    Write-Info 'Phones: Expo Go must already be installed (it comes from the Play Store / App Store, so do it while online).'

    if (Test-Path $VenvPython) { Write-Ok 'Vision Python virtualenv present'; $r.Venv = $true }
    else { Write-Warn2 'Vision virtualenv missing (only needed for the camera/OCR runtime) - "prepare" creates it' }

    $modelDir = Join-Path $HOME '.EasyOCR\model'
    if ($env:EASYOCR_MODULE_PATH) { $modelDir = Join-Path $env:EASYOCR_MODULE_PATH 'model' }
    $weights = @('craft_mlt_25k.pth', 'english_g2.pth') | Where-Object { -not (Test-Path (Join-Path $modelDir $_)) }
    if (@($weights).Count -eq 0) { Write-Ok "EasyOCR weights present ($modelDir)"; $r.Weights = $true }
    else { Write-Warn2 ("EasyOCR weights missing (" + (@($weights) -join ', ') + ') - OCR cannot load offline. "prepare" downloads them (~100 MB).') }

    if (Test-Path $FixtureVideo) { Write-Ok 'Synthetic camera clip present (no camera hardware needed)'; $r.Fixture = $true }
    else { Write-Info 'Synthetic camera clip not generated yet - created on demand if you pick it' }

    foreach ($p in @(@{ Port = $ApiPort; Name = 'API' }, @{ Port = $AdminPort; Name = 'Admin' }, @{ Port = $MetroPort; Name = 'Expo/Metro' }, @{ Port = $DbPort; Name = 'Database' })) {
        $owner = Get-PortOwner $p.Port
        if (-not $owner) { Write-Ok ("Port {0} ({1}) is free" -f $p.Port, $p.Name) }
        elseif ($p.Name -eq 'Database' -and $owner -match 'postgres') { Write-Ok "Port $($p.Port) already served by $owner (the embedded database)" }
        elseif (Test-TrackedRunning $p.Name) { Write-Ok ("Port {0} in use by PARADA {1} (already running)" -f $p.Port, $p.Name) }
        else { Write-Warn2 ("Port {0} ({1}) is in use by {2} - stop it first (an old npm run dev?)" -f $p.Port, $p.Name, $owner) }
    }
    return $r
}

# ---------------------------------------------------------------------------
# Prepare (needs internet, run once)
# ---------------------------------------------------------------------------
function Invoke-Prepare {
    Write-Section 'Prepare this PC for offline use (needs internet - run once)'
    Write-Info 'Everything here is skippable. After this, start/simulate/test work with no connection.'

    $hasModules = Test-Path (Join-Path $Root 'node_modules\turbo')
    if (Read-YesNo '  Install / sync npm dependencies (npm install)?' (-not $hasModules)) {
        [void](Invoke-Step 'npm install' 'npm install' -LogName 'prepare.log')
    }
    if (-not (Initialize-ApiEnv)) { Write-Warn2 'Continuing without a usable services\api\.env' }
    Initialize-AdminEnv

    Set-OfflineEnvironment
    [Environment]::SetEnvironmentVariable('EXPO_OFFLINE', $null, 'Process')

    [void](Invoke-Step 'Build API and shared packages' 'npx turbo run build --filter=@parada/api' -LogName 'prepare.log')

    if (Read-YesNo '  Build the admin dashboard for production? (downloads its Google fonts now so it looks right offline)' $true) {
        [void](Invoke-Step 'Admin production build' 'npm run build -w @parada/admin' -LogName 'prepare.log')
    }

    if (Read-YesNo '  Set up the vision/OCR service? (Python 3.11 venv + EasyOCR weights, roughly 1-2 GB with PyTorch)' $true) {
        $py = $null
        foreach ($c in @('python', 'py')) { if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break } }
        if (-not $py) {
            Write-Bad 'Python was not found on PATH. Install Python 3.11 (tick "Add to PATH"), reopen the terminal and run prepare again.'
        } else {
            $ver = & $py --version 2>&1
            Write-Info "Using $py ($ver). The README targets Python 3.11."
            if (Invoke-Step 'Create vision virtualenv + install requirements' 'npm run setup -w @parada/vision' -LogName 'prepare.log') {
                $fetch = Join-Path $StateDir 'fetch_easyocr.py'
                Set-Content -Path $fetch -Encoding ASCII -Value @(
                    'import easyocr'
                    'easyocr.Reader(["en"], gpu=False, verbose=False)'
                    'print("EasyOCR weights are cached for offline use.")'
                )
                [void](Invoke-Step 'Download EasyOCR weights' '.venv\Scripts\python.exe ..\..\.offline\fetch_easyocr.py' -WorkDir $VisionDir -LogName 'prepare.log')
                [void](Invoke-Step 'Generate the synthetic camera clip' '.venv\Scripts\python.exe tests\fixtures\generate_video.py' -WorkDir $VisionDir -LogName 'prepare.log')
            }
        }
    }

    if (Read-YesNo '  Create the test databases now? (needed by npm run test; also done automatically later)' $true) {
        if (Invoke-Step 'Start embedded PostgreSQL' 'npm run db:start' -LogName 'prepare.log') {
            [void](Invoke-Step 'Create + migrate parada_test and parada_test_api' 'npm run db:test:setup -w @parada/database' -LogName 'prepare.log')
        }
    }

    Write-Section 'Do these by hand while you still have internet'
    Write-Info '1. Install Expo Go on every test phone (Play Store / App Store).'
    Write-Info '2. Android emulator testing: install Android Studio and create an emulator (AVD).'
    Write-Info '3. For phone testing with no router: Windows Settings > Network > Mobile hotspot lets'
    Write-Info '   the phone join this PC directly; no internet is required on that network.'
    [void](Test-Readiness)
}

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------
function Confirm-FirewallRule {
    if (-not (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue)) { return }
    $name = 'PARADA offline - LAN access'
    if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
        Write-Ok 'Windows Firewall rule for phones already exists'
        return
    }
    Write-Warn2 "Windows Firewall may block the phone from reaching the API ($ApiPort) and Expo ($MetroPort)."
    if (Read-YesNo "  Add an inbound rule for TCP $ApiPort, $MetroPort and $AdminPort, limited to your local subnet? (asks for admin approval)" $true) {
        $cmd = "New-NetFirewallRule -DisplayName '$name' -Direction Inbound -Protocol TCP -LocalPort $ApiPort,$MetroPort,$AdminPort -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null"
        try {
            Start-Process -FilePath $PsExe -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -ErrorAction Stop
            if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { Write-Ok 'Firewall rule added' }
            else { Write-Warn2 'The rule was not created - add it later or allow node.exe when Windows asks' }
        } catch { Write-Warn2 'Skipped (administrator approval was declined)' }
    }
}

function Invoke-Start {
    $ready = Test-Readiness
    if ($ready.Fatal) {
        Write-Bad 'Fix the FAIL items above first (most are solved by "run-offline.cmd prepare" while online).'
        return $false
    }

    Write-Section 'Configuration'
    if (-not (Initialize-ApiEnv)) { Write-Bad 'The API needs a usable services\api\.env.'; return $false }
    Initialize-AdminEnv
    Write-Info 'Offline profile: the API runs with NODE_ENV=development and MAIL_TRANSPORT=console, so'
    Write-Info 'registration / reset codes are printed in the API window instead of being emailed.'
    Write-Info 'Your .env files are not changed by this.'

    # ---- Questions first, so you can walk away while things start ----
    $what = Read-Choice 'What should run?' @(
        'Core: database + API + admin dashboard',
        'Core + mobile app (Expo Go on a phone or Android emulator)',
        'Core + mobile app + vision camera (OCR on a clip, webcam or RTSP camera)',
        'Core + vision camera (no mobile)'
    ) ([int](Get-Answer 'components' 2))
    $script:Answers['components'] = $what
    $withMobile = ($what -eq 2 -or $what -eq 3)
    $withVision = ($what -eq 3 -or $what -eq 4)

    $adminProd = $false
    if ($ready.AdminBuild) {
        $am = Read-Choice 'Admin dashboard mode' @(
            'Production build (faster, identical to a deployment)',
            'Development server (hot reload while you edit code)'
        ) ([int](Get-Answer 'adminMode' 1))
        $script:Answers['adminMode'] = $am
        $adminProd = ($am -eq 1)
    } else {
        Write-Info 'Admin will use the development server (no production build yet).'
    }

    $apiUrlForMobile = $null
    $packagerHost = $null
    if ($withMobile) {
        $target = Read-Choice 'Where will the mobile app run?' @(
            'A physical phone on the same Wi-Fi / hotspot as this PC (Expo Go)',
            'Android emulator on this PC'
        ) ([int](Get-Answer 'mobileTarget' 1))
        $script:Answers['mobileTarget'] = $target
        if ($target -eq 1) {
            Write-Info 'Fully offline tip: turn on Windows Mobile Hotspot and connect the phone to it.'
            Write-Info 'The PC is then usually 192.168.137.1 on that network.'
            $ips = Get-LanAddresses
            $ip = $null
            if ($ips.Count -gt 0) {
                $opts = @()
                $def = 1
                $savedIp = Get-Answer 'lanIp' ''
                for ($i = 0; $i -lt $ips.Count; $i++) {
                    $tag = ''
                    if ($ips[$i].Virtual) { $tag = '  (virtual adapter - phones usually cannot reach it)' }
                    $opts += ('{0}   [{1}]{2}' -f $ips[$i].Ip, $ips[$i].Adapter, $tag)
                    if ($ips[$i].Ip -eq $savedIp) { $def = $i + 1 }
                }
                $opts += 'Type an address myself'
                $n = Read-Choice 'Which address does the phone reach this PC on? (pick the network the phone is connected to)' $opts $def
                if ($n -le $ips.Count) { $ip = $ips[$n - 1].Ip }
            } else {
                Write-Warn2 'No network adapter with an IPv4 address was found - connect Wi-Fi or start the hotspot first.'
            }
            if (-not $ip) {
                $ip = Read-Text -Question '  LAN IPv4 address of this PC' -Default (Get-Answer 'lanIp' '') -Hint 'Use the form 192.168.x.x' -Validate { param($x) $x -match '^\d{1,3}(\.\d{1,3}){3}$' }
            }
            $script:Answers['lanIp'] = $ip
            $apiUrlForMobile = "http://${ip}:$ApiPort"
            $packagerHost = $ip
            Confirm-FirewallRule
        } else {
            $apiUrlForMobile = "http://10.0.2.2:$ApiPort"
            Write-Info 'Start the emulator from Android Studio first, then press "a" in the Expo window.'
        }
    }

    $vision = $null
    if ($withVision) {
        if (-not $ready.Venv) {
            Write-Warn2 'Vision virtualenv is missing (run prepare while online) - vision will be skipped.'
            $withVision = $false
        } elseif (-not $ready.Weights -and -not (Read-YesNo '  EasyOCR weights are missing, so OCR will fail to load offline. Start vision anyway?' $false)) {
            $withVision = $false
        }
    }
    if ($withVision) {
        $src = Read-Choice 'Camera source for the vision runtime' @(
            'Synthetic test clip (no hardware; made from the project fixture plates)',
            'USB webcam',
            'IP camera over RTSP (on the same LAN)',
            'A video file of your own'
        ) ([int](Get-Answer 'visionSource' 1))
        $script:Answers['visionSource'] = $src
        $vision = @{ CAMERA_SOURCE = 'file' }
        switch ($src) {
            1 {
                if (-not (Test-Path $FixtureVideo)) {
                    [void](Invoke-Step 'Generate the synthetic camera clip' '.venv\Scripts\python.exe tests\fixtures\generate_video.py' -WorkDir $VisionDir -LogName 'vision.log')
                }
                $clip = $FixtureVideo
                if (-not (Test-Path $clip)) { $clip = [IO.Path]::ChangeExtension($FixtureVideo, '.avi') }
                $vision['CAMERA_FILE_PATH'] = $clip
                Write-Info 'The clip is about a second long: the runtime reads it, posts what it sees, prints its stats and stops.'
            }
            2 {
                $vision['CAMERA_SOURCE'] = 'usb'
                $idx = Read-Int -Question '  Webcam device index (0 = first camera)' -Default ([int](Get-Answer 'cameraIndex' 0)) -Min 0 -Max 9
                $script:Answers['cameraIndex'] = $idx
                $vision['CAMERA_DEVICE_INDEX'] = "$idx"
            }
            3 {
                $vision['CAMERA_SOURCE'] = 'rtsp'
                $vision['VIDEO_SOURCE'] = Read-Text -Question '  RTSP URL, e.g. rtsp://user:pass@192.168.1.64:554/stream1 (not saved)' -Hint 'It must start with rtsp:// or rtsps://' -Validate { param($x) $x -match '^rtsps?://' }
            }
            4 {
                $f = Read-Text -Question '  Full path to the video file' -Default (Get-Answer 'videoFile' '') -Hint 'That file does not exist.' -Validate { param($x) $x -and (Test-Path -LiteralPath $x) }
                $script:Answers['videoFile'] = $f
                $vision['CAMERA_FILE_PATH'] = (Resolve-Path -LiteralPath $f).Path
            }
        }
    }

    $smoke = Read-YesNo '  Run a smoke test once everything is up? (health, sign-in, one simulated car in and out)' $true
    Save-Answers

    # ---- Start-up ----
    Set-OfflineEnvironment
    foreach ($p in @(@{ Port = $ApiPort; Name = 'API' }, @{ Port = $AdminPort; Name = 'Admin' })) {
        $owner = Get-PortOwner $p.Port
        if ($owner -and -not (Test-TrackedRunning $p.Name)) {
            Write-Bad ("Port {0} is already used by {1}. Close it (an old npm run dev?) or the {2} will fail." -f $p.Port, $owner, $p.Name)
            if (-not (Read-YesNo '  Continue anyway?' $false)) { return $false }
        }
    }

    Write-Section 'Database'
    if (-not (Invoke-Step 'Start embedded PostgreSQL and apply pending migrations' 'npm run db:prepare' -LogName 'database.log')) {
        Write-Info 'See packages\database\.embedded-pg\db.log for the database server log.'
        return $false
    }

    Write-Section 'API'
    if (-not (Test-TrackedRunning 'API')) {
        if (-not (Invoke-Step 'Build API and shared packages' 'npx turbo run build --filter=@parada/api' -LogName 'build.log')) {
            if (Test-Path (Join-Path $ApiDir 'dist\index.js')) { Write-Warn2 'Build failed - starting the last successful build instead' }
            else { return $false }
        }
    }
    Start-ServiceWindow -Name 'API' -WorkDir $ApiDir -Command 'node dist\index.js' -EnvVars @{ NODE_ENV = 'development'; MAIL_TRANSPORT = 'console' }
    if (-not (Wait-Url "http://127.0.0.1:$ApiPort/health" 90 'API health check')) {
        Write-Bad 'The API did not come up - read the "PARADA - API" window or .offline\logs\api.log'
        return $false
    }

    Write-Section 'Demo data'
    $zones = Get-Zones
    $doSeed = $false
    if ($zones.Count -eq 0) {
        Write-Warn2 'The database has no parking zones yet.'
        $doSeed = Read-YesNo '  Seed the LPU-Batangas demo data (zone, slots, gate cameras, admin + driver accounts, 3 vehicles)?' $true
    } else {
        Write-Ok "$($zones.Count) zone(s) already in the database"
        $doSeed = Read-YesNo '  Re-run the demo seed? (keeps data, but RESETS the admin@parada.local / driver@parada.local passwords)' $false
    }
    if ($doSeed) {
        $adminPw = Read-Password '  New password for admin@parada.local'
        $driverPw = Read-Password '  New password for driver@parada.local'
        $ok = Invoke-Step 'Seed demo data' 'npm run seed -w @parada/database' -LogName 'seed.log' -EnvVars @{ PARADA_SEED_ADMIN_PASSWORD = $adminPw; PARADA_SEED_USER_PASSWORD = $driverPw }
        if ($ok) { $script:AdminPw = $adminPw }
        $driverPw = $null
    }

    Write-Section 'Admin dashboard'
    if ($adminProd) { $adminCmd = "npm run start -- -p $AdminPort" } else { $adminCmd = "npm run dev -- -p $AdminPort" }
    Start-ServiceWindow -Name 'Admin' -WorkDir $AdminDir -Command $adminCmd -EnvVars @{ PORT = "$AdminPort" }
    $adminTimeout = 60
    if (-not $adminProd) { $adminTimeout = 180; Write-Info 'The dev server compiles the first page on demand - this can take a minute.' }
    [void](Wait-Url "http://localhost:$AdminPort/login" $adminTimeout 'admin dashboard')

    if ($withMobile) {
        Write-Section 'Mobile (Expo)'
        $expoArgs = ''
        if ((Get-Answer 'lastMobileApiUrl' '') -ne $apiUrlForMobile) {
            $expoArgs = ' -- --clear'
            Write-Info 'API address changed since last run - clearing the Metro cache so the new address is baked in.'
        }
        $script:Answers['lastMobileApiUrl'] = $apiUrlForMobile
        Save-Answers
        $mobileEnv = @{ EXPO_PUBLIC_API_URL = $apiUrlForMobile; EXPO_NO_WEB = '1'; EXPO_OFFLINE = '1' }
        if ($packagerHost) { $mobileEnv['REACT_NATIVE_PACKAGER_HOSTNAME'] = $packagerHost }
        Start-ServiceWindow -Name 'Mobile' -WorkDir $MobileDir -Command ("npm run dev:lan" + $expoArgs) -EnvVars $mobileEnv -NoLog
        Write-Info "Mobile app talks to the API at $apiUrlForMobile"
        Write-Info 'Scan the QR code in the "PARADA - Mobile" window with Expo Go (Android) or the Camera app (iOS).'
    }

    if ($withVision) {
        Write-Section 'Vision camera runtime'
        $zones = Get-Zones
        if ($zones.Count -eq 0) {
            Write-Warn2 'No zones exist, so there is nothing for a camera to report to - vision skipped.'
        } else {
            $zone = Select-Zone $zones 'Which zone is this camera installed at?'
            $camId = Read-CameraId $zone
            $apiEnv = Read-EnvFile $ApiEnvPath
            $vision['PARADA_API_URL'] = "http://127.0.0.1:$ApiPort"
            $vision['CAMERA_IDENTIFIER'] = $camId
            $vision['CAMERA_ZONE_ID'] = $zone.id
            $vision['PYTHONUNBUFFERED'] = '1'
            if ($apiEnv['CAMERA_API_KEY']) { $vision['CAMERA_API_KEY'] = $apiEnv['CAMERA_API_KEY'] }
            if ($apiEnv['OCR_PLATE_CONFIDENCE_THRESHOLD']) { $vision['OCR_PLATE_CONFIDENCE_THRESHOLD'] = $apiEnv['OCR_PLATE_CONFIDENCE_THRESHOLD'] }
            Save-Answers
            Write-Info 'Self-test first: open the source, grab one frame, run OCR on it (loading EasyOCR takes a moment).'
            $selfTest = Invoke-Step 'Vision camera self-test' '.venv\Scripts\python.exe -m app.camera.cli test' -WorkDir $VisionDir -LogName 'vision.log' -EnvVars $vision
            if ($selfTest -or (Read-YesNo '  The self-test failed. Start the camera runtime anyway?' $false)) {
                Start-ServiceWindow -Name 'Vision camera' -WorkDir $VisionDir -Command '.venv\Scripts\python.exe -m app.camera.cli run' -EnvVars $vision
                Write-Info 'Every camera read posts ENTRY events; watch Admin > Cameras and Zones update.'
            }
            $vision = $null
        }
    }

    if ($smoke) { Invoke-SmokeTest }
    Show-Summary
    return $true
}

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
function Invoke-SmokeTest {
    Write-Section 'Smoke test'
    $h = Invoke-Api -Method GET -Path '/health'
    if ($h.Ok -and $h.Data.status -eq 'ok') { Write-Ok "API health: ok, database $($h.Data.database)" }
    else { Write-Bad "API health: $($h.Message)"; return }

    $zones = Get-Zones
    if ($zones.Count -gt 0) { Write-Ok "Zones endpoint returned $($zones.Count) zone(s)" } else { Write-Warn2 'Zones endpoint returned nothing (seed the demo data)' }

    $pw = $script:AdminPw
    if (-not $pw -and (Read-YesNo '  Check admin sign-in? (type the admin@parada.local password; it is not stored)' $true)) {
        $pw = ConvertFrom-SecureText (Read-Host '  Admin password (hidden)' -AsSecureString)
    }
    if ($pw) {
        $login = Invoke-Api -Method POST -Path '/auth/login' -Body @{ email = 'admin@parada.local'; password = $pw }
        if ($login.Ok -and $login.Data.user.role -eq 'ADMIN') { Write-Ok 'Admin sign-in works (role ADMIN; token not shown)' }
        elseif ($login.Ok) { Write-Warn2 "Signed in, but the role is $($login.Data.user.role)" }
        else { Write-Bad "Admin sign-in failed: $($login.Message)" }
    }

    $s = Test-Url "http://localhost:$AdminPort/login"
    if ($s -eq 200) { Write-Ok "Admin dashboard serves http://localhost:$AdminPort/login" }
    elseif ($s -eq 0) { Write-Warn2 "Admin dashboard is not answering on port $AdminPort yet (the dev server may still be compiling)" }
    else { Write-Warn2 "Admin dashboard answered HTTP $s on /login" }

    if ($zones.Count -gt 0) {
        $zone = $zones | Where-Object { $_.code -eq (Get-Answer 'zoneCode' 'A') } | Select-Object -First 1
        if (-not $zone) { $zone = $zones[0] }
        $cam = Get-Answer 'cameraId' ('cam-' + ("$($zone.code)").ToLower() + '-main-gate')
        Write-Info "One car through zone $($zone.code) via camera $cam (same endpoint a real camera uses):"
        $script:SimRows = @()
        $plate = $SeedPlates[0]
        $in = Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $plate -Scenario 'smoke'
        if ($in -eq 'ACCEPTED') {
            Start-Sleep -Seconds 1
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'EXIT' -Plate $plate -Scenario 'smoke')
        } else {
            Write-Info 'Refused entries are business answers (e.g. the car is already inside, wrong camera/zone).'
            Write-Info 'Use the simulator to send an EXIT if this plate is still parked from an earlier run.'
        }
        Save-SimLog 'smoke'
    }
}

# ---------------------------------------------------------------------------
# Gate traffic simulator
# ---------------------------------------------------------------------------
function Save-SimLog([string]$Tag) {
    if ($script:SimRows.Count -eq 0) { return }
    $file = Join-Path $LogDir ("simulation-{0}-{1}.csv" -f $Tag, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $script:SimRows | Export-Csv -Path $file -NoTypeInformation -Encoding UTF8
    $acc = @($script:SimRows | Where-Object { $_.result -eq 'ACCEPTED' }).Count
    $ref = @($script:SimRows | Where-Object { $_.result -eq 'REFUSED' }).Count
    $err = @($script:SimRows | Where-Object { $_.result -eq 'ERROR' }).Count
    Write-Info ("Events: {0} accepted, {1} refused by business rules, {2} errors." -f $acc, $ref, $err)
    Write-Info "Saved as evidence: .offline\logs\$(Split-Path $file -Leaf)"
}

function Invoke-Simulation {
    Write-Section 'Gate traffic simulator'
    Write-Info 'Posts the same events the vision service posts (POST /zones/:id/events with the camera key),'
    Write-Info 'so occupancy, sessions, guest rules, notifications and the live dashboard react for real.'
    $h = Invoke-Api -Method GET -Path '/health'
    if (-not $h.Ok) { Write-Bad 'The API is not running - start the stack first (menu option 1).'; return }

    $zones = Get-Zones
    if ($zones.Count -eq 0) { Write-Bad 'No zones in the database - seed the demo data from the start step.'; return }
    Show-Zones $zones
    $zone = Select-Zone $zones 'Which zone?'
    $cam = Read-CameraId $zone
    Save-Answers

    $sc = Read-Choice 'Scenario' @(
        'Rush hour: several cars arrive one after another, wait, then leave',
        'Random traffic for a few minutes (arrivals and departures mixed)',
        'Fill the zone to capacity, then one more car (should be refused when full)',
        'Single car enters',
        'Single car leaves',
        'Duplicate camera event (same event id twice - must be counted once)',
        'Unregistered plate (guest admission rules)',
        'Low-confidence OCR read (below the trust threshold)',
        'Camera saw a car but read no plate'
    ) 1
    $delay = Read-Int -Question '  Seconds between events' -Default ([int](Get-Answer 'simDelay' 2)) -Min 0 -Max 60
    $script:Answers['simDelay'] = $delay
    Save-Answers
    $script:SimRows = @()
    $tag = @('rush-hour', 'random', 'fill', 'entry', 'exit', 'duplicate', 'guest', 'low-confidence', 'no-plate')[$sc - 1]

    switch ($sc) {
        1 {
            $n = Read-Int -Question '  How many cars' -Default 5 -Min 1 -Max 200
            $guests = Read-YesNo '  Include unregistered (guest) plates? The seed only registers 3 vehicles.' ($n -gt 3)
            $plates = @()
            for ($i = 0; $i -lt $n; $i++) {
                if ($i -lt $SeedPlates.Count) { $plates += $SeedPlates[$i] }
                elseif ($guests) { $plates += (New-RandomPlate) }
            }
            if ($plates.Count -lt $n) { Write-Info "Only $($plates.Count) registered plates available - sending $($plates.Count) cars." }
            $stay = Read-Int -Question '  Seconds the cars stay parked before leaving' -Default 10 -Min 0 -Max 3600
            $inside = @()
            foreach ($p in $plates) {
                if ((Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag) -eq 'ACCEPTED') { $inside += $p }
                Start-Sleep -Seconds $delay
            }
            Write-Info "Parked: $($inside.Count). Waiting $stay s - open the dashboard / phone and look."
            Start-Sleep -Seconds $stay
            foreach ($p in $inside) {
                [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'EXIT' -Plate $p -Scenario $tag)
                Start-Sleep -Seconds $delay
            }
        }
        2 {
            $minutes = Read-Int -Question '  How many minutes' -Default 3 -Min 1 -Max 240
            $guests = Read-YesNo '  Include unregistered (guest) plates?' $false
            $pool = @($SeedPlates)
            $inside = New-Object System.Collections.ArrayList
            $end = (Get-Date).AddMinutes($minutes)
            Write-Info 'Press Ctrl+C to stop early (cars still inside stay parked).'
            $refusedInRow = 0
            while ((Get-Date) -lt $end -and $refusedInRow -lt 10) {
                $outside = @($pool | Where-Object { $inside -notcontains $_ })
                $enter = ((Get-Random -Maximum 100) -lt 55)
                if ($inside.Count -eq 0) { $enter = $true }
                if ($enter) {
                    $p = $null
                    if ($guests -and ((Get-Random -Maximum 100) -lt 40 -or $outside.Count -eq 0)) { $p = New-RandomPlate }
                    elseif ($outside.Count -gt 0) { $p = $outside | Get-Random }
                    if ($p) {
                        if ((Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag) -eq 'ACCEPTED') { [void]$inside.Add($p); $refusedInRow = 0 }
                        else { $refusedInRow++ }
                    }
                } elseif ($inside.Count -gt 0) {
                    $p = $inside | Get-Random
                    if ((Send-SimEvent -Zone $zone -Camera $cam -Type 'EXIT' -Plate $p -Scenario $tag) -eq 'ACCEPTED') { $inside.Remove($p); $refusedInRow = 0 }
                    else { $refusedInRow++ }
                }
                Start-Sleep -Seconds ([Math]::Max(1, $delay + (Get-Random -Minimum 0 -Maximum 4)))
            }
            if ($refusedInRow -ge 10) {
                Write-Warn2 'Stopped after 10 refusals in a row. If the zone is already full from an earlier run,'
                Write-Info 'send exits first (scenario 5) or reset occupancy in Admin, then try again.'
            }
            if ($inside.Count -gt 0 -and (Read-YesNo ("  {0} car(s) are still parked. Send their exits now?" -f $inside.Count) $true)) {
                foreach ($p in @($inside)) { [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'EXIT' -Plate $p -Scenario $tag) }
            }
        }
        3 {
            $fresh = Get-Zones | Where-Object { $_.id -eq $zone.id } | Select-Object -First 1
            $need = [int]$fresh.capacity - [int]$fresh.occupiedCount
            Write-Info "Zone $($zone.code): $($fresh.occupiedCount)/$($fresh.capacity) occupied - $need more needed, plus one overflow car."
            Write-Info 'Registered plates go first, then guest plates; the guest policy may refuse those (that is a real result).'
            $refusedInRow = 0
            $sent = 0
            $i = 0
            while ($sent -lt $need -and $refusedInRow -lt 5) {
                $p = New-RandomPlate
                if ($i -lt $SeedPlates.Count) { $p = $SeedPlates[$i] }
                $i++
                $res = Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag
                if ($res -eq 'ACCEPTED') { $sent++; $refusedInRow = 0 } else { $refusedInRow++ }
                if ($delay -gt 0) { Start-Sleep -Seconds $delay }
            }
            if ($sent -ge $need) {
                Write-Info 'The zone should now be full. One more car (expected: refused because the zone is full):'
                $p = New-RandomPlate
                if ($i -lt $SeedPlates.Count) { $p = $SeedPlates[$i] }
                [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag)
            }
            if ($refusedInRow -ge 5) { Write-Info 'Stopped after 5 refusals in a row - see the detail column for why.' }
        }
        4 {
            $p = Read-Text -Question '  Plate' -Default $SeedPlates[0]
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag)
        }
        5 {
            $p = Read-Text -Question '  Plate' -Default $SeedPlates[0]
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'EXIT' -Plate $p -Scenario $tag)
        }
        6 {
            $p = Read-Text -Question '  Plate' -Default $SeedPlates[1]
            $id = 'offline-sim-dup-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
            Write-Info 'Sending the same ENTRY (same sourceEventId) twice; occupancy must move only once.'
            $before = [int](Get-Zones | Where-Object { $_.id -eq $zone.id } | Select-Object -First 1).occupiedCount
            $first = Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -EventId $id -Scenario $tag
            Start-Sleep -Seconds 1
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -EventId $id -Scenario $tag)
            $after = [int](Get-Zones | Where-Object { $_.id -eq $zone.id } | Select-Object -First 1).occupiedCount
            if ($first -ne 'ACCEPTED') { Write-Info 'The first event was not accepted, so idempotency could not be judged - pick a plate that is not parked.' }
            elseif (($after - $before) -eq 1) { Write-Ok "Counted once: occupancy $before -> $after (idempotent)" }
            else { Write-Bad "Occupancy moved by $($after - $before) for one physical car ($before -> $after)" }
        }
        7 {
            $p = Read-Text -Question '  Unregistered plate' -Default (New-RandomPlate)
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Scenario $tag)
        }
        8 {
            $p = Read-Text -Question '  Plate' -Default $SeedPlates[2]
            $thr = (Read-EnvFile $ApiEnvPath)['OCR_PLATE_CONFIDENCE_THRESHOLD']
            if (-not $thr) { $thr = '0.5' }
            Write-Info "Trust threshold is ${thr}: the car is counted, but the plate is not trusted as an identity."
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type 'ENTRY' -Plate $p -Confidence 0.30 -Scenario $tag)
        }
        9 {
            $t = Read-Choice 'Direction' @('ENTRY', 'EXIT') 1
            [void](Send-SimEvent -Zone $zone -Camera $cam -Type (@('ENTRY', 'EXIT')[$t - 1]) -Plate '' -Confidence 0 -Scenario $tag)
        }
    }
    Save-SimLog $tag
}

# ---------------------------------------------------------------------------
# Automated tests
# ---------------------------------------------------------------------------
function Invoke-Tests {
    Write-Section 'Automated tests'
    Write-Info 'Unit + integration suites against the real embedded PostgreSQL (separate test databases).'
    Write-Info 'These are not device, camera-hardware or deployment tests.'
    $c = Read-Choice 'Which suites?' @(
        'Everything (all workspaces + vision pytest)',
        'API (Express, real PostgreSQL)',
        'Database package',
        'Admin web (Jest)',
        'Mobile app (Jest)',
        'Shared types',
        'Vision / OCR (pytest)',
        'Static checks: typecheck + lint'
    ) 1
    Set-OfflineEnvironment
    $log = 'tests-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    $results = @()

    if ($c -in 1, 2, 3) {
        if (-not (Invoke-Step 'Start embedded PostgreSQL' 'npm run db:start' -LogName $log)) { return }
        if (-not (Invoke-Step 'Create / migrate the test databases' 'npm run db:test:setup -w @parada/database' -LogName $log)) { return }
    }
    $steps = @()
    switch ($c) {
        1 { $steps += , @('All Node workspaces', 'npm run test'); $steps += , @('Vision (pytest)', 'npm run test -w @parada/vision') }
        2 { $steps += , @('API', 'npx turbo run test --filter=@parada/api') }
        3 { $steps += , @('Database', 'npx turbo run test --filter=@parada/database') }
        4 { $steps += , @('Admin', 'npx turbo run test --filter=@parada/admin') }
        5 { $steps += , @('Mobile', 'npx turbo run test --filter=@parada/mobile') }
        6 { $steps += , @('Types', 'npx turbo run test --filter=@parada/types') }
        7 { $steps += , @('Vision (pytest)', 'npm run test -w @parada/vision') }
        8 { $steps += , @('Typecheck', 'npm run typecheck'); $steps += , @('Lint', 'npm run lint') }
    }
    foreach ($s in $steps) {
        if ($s[0] -like 'Vision*' -and -not (Test-Path $VenvPython)) { Write-Warn2 'Vision virtualenv missing - skipping pytest'; $results += , @($s[0], 'SKIPPED'); continue }
        $ok = Invoke-Step $s[0] $s[1] -LogName $log
        $status = 'FAILED'
        if ($ok) { $status = 'PASSED' }
        $results += , @($s[0], $status)
    }
    Write-Section 'Test summary'
    foreach ($r in $results) {
        if ($r[1] -eq 'PASSED') { Write-Ok $r[0] } elseif ($r[1] -eq 'SKIPPED') { Write-Warn2 "$($r[0]) skipped" } else { Write-Bad $r[0] }
    }
    Write-Info "Full output: .offline\logs\$log"
}

# ---------------------------------------------------------------------------
# Status, summary, stop
# ---------------------------------------------------------------------------
function Show-Status {
    Write-Section 'Status'
    $tracked = Get-Tracked
    if ($tracked.Count -eq 0) { Write-Info 'No service windows were started by this launcher.' }
    foreach ($t in $tracked) {
        if (Get-Process -Id $t.pid -ErrorAction SilentlyContinue) { Write-Ok "$($t.name) window running (since $($t.started))" }
        else { Write-Warn2 "$($t.name) window is closed" }
    }
    foreach ($p in @(@{ Port = $DbPort; Name = 'Database' }, @{ Port = $ApiPort; Name = 'API' }, @{ Port = $AdminPort; Name = 'Admin' }, @{ Port = $MetroPort; Name = 'Expo/Metro' })) {
        $owner = Get-PortOwner $p.Port
        if ($owner) { Write-Ok ("{0,-10} listening on {1}  ({2})" -f $p.Name, $p.Port, $owner) } else { Write-Info ("{0,-10} not listening on {1}" -f $p.Name, $p.Port) }
    }
    $h = Invoke-Api -Method GET -Path '/health'
    if ($h.Ok) {
        Write-Ok "API health: $($h.Data.status), database $($h.Data.database)"
        Show-Zones (Get-Zones)
    } else { Write-Info 'API is not answering.' }
}

function Show-Summary {
    Write-Section 'PARADA is running offline'
    Write-Host "  Admin dashboard : http://localhost:$AdminPort" -ForegroundColor White
    Write-Host "  API             : http://localhost:$ApiPort   (health: /health)" -ForegroundColor White
    $lan = Get-Answer 'lanIp' ''
    if ($lan -and (Get-Answer 'components' 1) -in 2, 3) { Write-Host "  Phone -> API    : http://${lan}:$ApiPort" -ForegroundColor White }
    Write-Host '  Accounts        : admin@parada.local (ADMIN), driver@parada.local (USER) - seeded passwords' -ForegroundColor White
    Write-Host '  Logs            : .offline\logs\' -ForegroundColor White
    Write-Info 'Each service has its own "PARADA - ..." window. Verification and reset codes appear in the API window.'
    Write-Info 'Note: Admin > Simulator needs zones with separate ENTRY and EXIT cameras; the seeded cameras are'
    Write-Info 'BIDIRECTIONAL, so use this launcher''s gate traffic simulator (or add ENTRY/EXIT cameras in Admin).'
}

function Stop-Everything([bool]$StopDb = $true) {
    Write-Section 'Stopping'
    $tracked = Get-Tracked
    foreach ($t in $tracked) {
        if (Get-Process -Id $t.pid -ErrorAction SilentlyContinue) {
            & taskkill.exe /T /F /PID $t.pid 2>&1 | Out-Null
            Write-Ok "$($t.name) stopped"
        } else { Write-Info "$($t.name) was already closed" }
    }
    Remove-Item -Path $PidFile -ErrorAction SilentlyContinue
    if ($StopDb) { [void](Invoke-Step 'Stop embedded PostgreSQL (data is kept)' 'npm run db:stop' -LogName 'database.log') }
    foreach ($port in @($ApiPort, $AdminPort, $MetroPort)) {
        $o = Get-PortOwner $port
        if ($o) { Write-Warn2 "Port $port is still held by $o (not started by this launcher, so left alone)" }
    }
}

function Show-ControlMenu {
    while ($true) {
        $c = Read-Choice 'PARADA is running. What next?' @(
            'Simulate gate traffic',
            'Status (services, ports, zone occupancy)',
            'Open the admin dashboard in the browser',
            'Run automated tests',
            'Open the logs folder',
            'Stop everything and exit',
            'Exit the launcher but leave everything running'
        ) 1
        switch ($c) {
            1 { Invoke-Simulation }
            2 { Show-Status }
            3 { Start-Process "http://localhost:$AdminPort" }
            4 { Invoke-Tests }
            5 { Start-Process -FilePath 'explorer.exe' -ArgumentList $LogDir }
            6 { Stop-Everything $true; return }
            7 { Write-Info 'Run "run-offline.cmd stop" later to shut everything down.'; return }
        }
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Set-Location -LiteralPath $Root
Initialize-State
$script:Answers = Get-Answers
Show-Banner

switch ($Action) {
    'start' { if ((@(Invoke-Start) | Select-Object -Last 1) -eq $true) { Show-ControlMenu } }
    'simulate' { Set-OfflineEnvironment; Invoke-Simulation }
    'test' { Invoke-Tests }
    'check' { [void](Test-Readiness) }
    'prepare' { Invoke-Prepare }
    'status' { Show-Status }
    'stop' { Stop-Everything $true }
    default {
        $running = @(Get-Tracked | Where-Object { Get-Process -Id $_.pid -ErrorAction SilentlyContinue }).Count -gt 0
        if ($running) { Write-Info 'Some PARADA windows from an earlier start are still open.' }
        $m = Read-Choice 'What would you like to do?' @(
            'Start PARADA offline (simulation / demo)',
            'Simulate gate traffic against the running stack',
            'Run automated tests',
            'Check offline readiness',
            'Prepare this PC for offline use (needs internet, run once)',
            'Show status',
            'Stop everything'
        ) 1
        switch ($m) {
            1 { if ((@(Invoke-Start) | Select-Object -Last 1) -eq $true) { Show-ControlMenu } }
            2 { Set-OfflineEnvironment; Invoke-Simulation; if ((Get-Tracked).Count -gt 0) { Show-ControlMenu } }
            3 { Invoke-Tests }
            4 { [void](Test-Readiness) }
            5 { Invoke-Prepare }
            6 { Show-Status; if ((Get-Tracked).Count -gt 0) { Show-ControlMenu } }
            7 { Stop-Everything $true }
        }
    }
}
Save-Answers
