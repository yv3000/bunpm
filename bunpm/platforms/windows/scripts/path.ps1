function Update-BunpmPath {
    param($Key, [string]$BinDir, [switch]$Remove)
    $current = $Key.GetValue('PATH', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $kind = if ($null -eq $current) { [Microsoft.Win32.RegistryValueKind]::ExpandString } else { $Key.GetValueKind('PATH') }
    $entries = if ($null -eq $current) { @() } else { @($current -split ';') }
    $remaining = @($entries | Where-Object {
        [Environment]::ExpandEnvironmentVariables($_).Trim('"').TrimEnd('\') -ine $BinDir.TrimEnd('\')
    })
    if ($Remove) {
        if ($remaining.Count -ne $entries.Count) { $Key.SetValue('PATH', ($remaining -join ';'), $kind) }
    } elseif ($remaining.Count -eq $entries.Count) {
        $updated = if ([string]::IsNullOrEmpty($current)) { $BinDir } else { "$BinDir;$current" }
        $Key.SetValue('PATH', $updated, $kind)
    }
}
