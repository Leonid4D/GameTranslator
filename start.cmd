@echo off
setlocal
cd /d "%~dp0"
title GameTranslator

rem ============================================================
rem  Kaspersky / antivirus HTTPS interception
rem  Antivirus proxies HTTPS and Node does not trust its root CA,
rem  so requests randomly fail with
rem  "self-signed certificate in certificate chain" (HTTP 500).
rem  Export the AV root certificate once and trust it via
rem  NODE_EXTRA_CA_CERTS - only for this server process.
rem ============================================================
set "GT_CA=%USERPROFILE%\.dsh\kaspersky-root.pem"
if not exist "%GT_CA%" call :export_ca
if exist "%GT_CA%" set "NODE_EXTRA_CA_CERTS=%GT_CA%"

if not exist node_modules (
    echo [setup] Installing dependencies...
    call npm install
    if errorlevel 1 goto :fail
)

echo.
echo   GameTranslator backend : http://localhost:3000/api/health
echo   Interface              : %~dp0index.html
echo   Stop server            : Ctrl+C
echo.
call npm start
goto :eof

:export_ca
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match 'Kaspersky' } | Select-Object -First 1; if ($c) { $nl = [Environment]::NewLine; $pem = '-----BEGIN CERTIFICATE-----' + $nl + [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks') + $nl + '-----END CERTIFICATE-----' + $nl; $dir = Join-Path $env:USERPROFILE '.dsh'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $file = $dir + '\kaspersky-root.pem'; Set-Content -Path $file -Value $pem -Encoding ascii }"
goto :eof

:fail
echo [error] npm install failed - check Node.js and network.
pause
