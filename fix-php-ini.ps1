$phpIni = "C:\tools\php\php.ini"

if (Test-Path $phpIni) {
    Write-Host "Fixing php.ini at $phpIni..."
    $content = Get-Content $phpIni
    
    # Fix extension_dir
    $content = $content -replace ';extension_dir = "ext"', 'extension_dir = "ext"'
    
    $content | Set-Content $phpIni
    Write-Host "Success: php.ini updated."
} else {
    Write-Host "Error: php.ini not found at $phpIni"
}
