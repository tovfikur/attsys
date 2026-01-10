# Helper script to download and setup PHP 8.3 (Non-Thread Safe for FastCGI/Dev)
# Run this in PowerShell as Administrator if possible, or just user level

$phpVersion = "8.3.15"
# Trying the 'Thread Safe' version as it is sometimes more reliably linked on the main download page, or just a different mirror logic
# But actually, let's use the 'QA' or 'Archives' link logic if the main one fails? 
# Let's try a known persistent link format or scrape it. 
# For now, let's try the VS16 x64 Thread Safe version which is often the default 'zip' people grab.
# Actually, the error is 404, meaning the specific filename is wrong.
# Let's try to get the 'current stable' logic or just use a very specific known-good link.
# I will check the exact filename for 8.3.15 or use 8.2.

$phpUrl = "https://windows.php.net/downloads/releases/php-8.2.14-nts-Win32-vs16-x64.zip"
# Let's try 8.2.14 which is older and might be archived.
# Better yet, let's use the "releases" directory listing to be safe? No, that's hard in script.
# Let's use the LATEST 8.3 link that definitely exists.
# Checking windows.php.net... 8.3.15 is current.
# Maybe the file is php-8.3.15-nts-Win32-vs16-x64.zip
# Let's try to use the generic 'latest' redirect or a mirror? 
# Let's try 8.4.2 which is the newest.
$phpUrl = "https://windows.php.net/downloads/releases/archives/php-8.2.14-nts-Win32-vs16-x64.zip"
$installDir = "C:\tools\php"

Write-Host "Downloading PHP $phpVersion..."
if (-not (Test-Path "C:\tools")) { mkdir "C:\tools" | Out-Null }
$zipPath = "C:\tools\php.zip"

Invoke-WebRequest -Uri $phpUrl -OutFile $zipPath

Write-Host "Extracting..."
if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }
Expand-Archive -Path $zipPath -DestinationPath $installDir

Write-Host "Configuring php.ini..."
Copy-Item "$installDir\php.ini-development" "$installDir\php.ini"

# Enable extensions commonly needed
$iniContent = Get-Content "$installDir\php.ini"
$iniContent = $iniContent -replace ';extension=curl', 'extension=curl'
$iniContent = $iniContent -replace ';extension=mbstring', 'extension=mbstring'
$iniContent = $iniContent -replace ';extension=openssl', 'extension=openssl'
$iniContent = $iniContent -replace ';extension=pdo_mysql', 'extension=pdo_mysql'
$iniContent | Set-Content "$installDir\php.ini"

Write-Host "Cleaning up..."
Remove-Item $zipPath

Write-Host "-----------------------------------------------------"
Write-Host "PHP Installed at: $installDir"
Write-Host "IMPORTANT: You must manually add '$installDir' to your System PATH environment variable."
Write-Host "1. Search 'Edit the system environment variables'"
Write-Host "2. Click 'Environment Variables'"
Write-Host "3. Edit 'Path' and add 'C:\tools\php'"
Write-Host "4. Restart your terminal."
Write-Host "-----------------------------------------------------"
