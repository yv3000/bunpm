param([string]$Source)
$ErrorActionPreference = 'Stop'
. $Source
$binDir = Join-Path $env:USERPROFILE '.bunpm\bin'
# In-memory registry-shaped object: these tests never open or write the registry.
$key = [pscustomobject]@{ Value = $null; Kind = [Microsoft.Win32.RegistryValueKind]::ExpandString; Writes = 0 }
$key | Add-Member ScriptMethod GetValue {
    param($Name, $Default, $Options)
    if ($Options -ne [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) { throw 'PATH was expanded before reading' }
    return $this.Value
}
$key | Add-Member ScriptMethod GetValueKind { param($Name) return $this.Kind }
$key | Add-Member ScriptMethod SetValue { param($Name, $Value, $Kind) $this.Value=$Value; $this.Kind=$Kind; $this.Writes++ }
foreach ($kind in @([Microsoft.Win32.RegistryValueKind]::String, [Microsoft.Win32.RegistryValueKind]::ExpandString)) {
    $key.Kind=$kind
    foreach ($entry in @($binDir.ToUpper(), ('"' + $binDir + '\"'), '%USERPROFILE%\.bunpm\bin')) {
        $key.Value="$entry;%USERPROFILE%\other;;"
        $key.Writes=0
        Update-BunpmPath -Key $key -BinDir $binDir
        if ($key.Writes -ne 0) { throw 'Duplicate PATH insertion' }
        Update-BunpmPath -Key $key -BinDir $binDir -Remove
        if ($key.Value -cne '%USERPROFILE%\other;;' -or $key.Kind -ne $kind) { throw 'Uninstall changed unrelated PATH text or registry kind' }
        Update-BunpmPath -Key $key -BinDir $binDir
        if ($key.Value -cne "$binDir;%USERPROFILE%\other;;" -or $key.Kind -ne $kind) { throw 'Install changed unrelated PATH text or registry kind' }
    }
}
foreach ($empty in @($null, '')) {
    $key.Value=$empty; $key.Writes=0
    Update-BunpmPath -Key $key -BinDir $binDir -Remove
    if ($key.Writes -ne 0) { throw 'Empty PATH removal wrote registry' }
    Update-BunpmPath -Key $key -BinDir $binDir
    if ($key.Value -cne $binDir) { throw 'Empty PATH gained a trailing separator' }
    Update-BunpmPath -Key $key -BinDir $binDir -Remove
    if ($key.Value -cne '') { throw 'Only-entry removal failed' }
}
