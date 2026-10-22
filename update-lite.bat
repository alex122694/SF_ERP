@echo off
rem SF ERP lite updater: fetch release/SF ERP-lite.zip from GitHub and extract it to a folder.
rem Usage: update-lite.bat "D:\"        (the zip has a top-level "SF ERP" folder, so the result is D:\SF ERP\)
rem        update-lite.bat             (asks for the folder)
rem Download method (tried in this order):
rem   1) public repository -> plain download, no git and no token needed
rem   2) git installed       -> sparse clone (uses your saved git credentials)
rem   3) otherwise           -> GitHub API download with a read-only token, taken from the GITHUB_TOKEN
rem                             environment variable or from sf_erp_token.txt next to this file
rem Never touches SF ERP\data\ (database and backups).
setlocal EnableExtensions
chcp 65001 >nul

set "OWNER=alex122694"
set "NAME=SF_ERP"
set "BRANCH=main"
set "REPO=https://github.com/%OWNER%/%NAME%.git"
set "RAW=https://raw.githubusercontent.com/%OWNER%/%NAME%/%BRANCH%/release/SF%%20ERP-lite.zip"
set "API=https://api.github.com/repos/%OWNER%/%NAME%/contents/release/SF%%20ERP-lite.zip?ref=%BRANCH%"

set "TARGET=%~1"
set "DEFAULT_TARGET=D:\"
if "%TARGET%"=="" set /p "TARGET=Extract to which folder? [Enter = %DEFAULT_TARGET%] : "
if "%TARGET%"=="" set "TARGET=%DEFAULT_TARGET%"
if not exist "%TARGET:~0,3%" ( echo Drive "%TARGET:~0,2%" was not found. Is the USB drive plugged in? & goto :fail )

set "WORK=%TEMP%\sf_erp_update_%RANDOM%%RANDOM%"
mkdir "%WORK%" || goto :fail
set "ZIP=%WORK%\SF ERP-lite.zip"

call :viaraw
if not exist "%ZIP%" (
  where git >nul 2>nul
  if errorlevel 1 ( call :viaapi ) else ( call :viagit )
  if errorlevel 1 goto :fail
)
if not exist "%ZIP%" ( echo Download failed: zip not found. & goto :fail )

if not exist "%TARGET%" mkdir "%TARGET%" || goto :fail
if "%TARGET:~-1%"=="\" ( set "APP=%TARGET%SF ERP" ) else ( set "APP=%TARGET%\SF ERP" )
if exist "%APP%\index.html" (
  copy /y "%APP%\index.html" "%APP%\index.html.bak" >nul
  echo Previous index.html saved as index.html.bak
)

echo Extracting to "%TARGET%" ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:TARGET -Force" || ( echo Extract failed. & goto :fail )

if not exist "%APP%\data" mkdir "%APP%\data"
rd /s /q "%WORK%" 2>nul
echo.
echo Done. Open "%APP%\index.html" with Edge or Chrome. Your data folder was left untouched.
pause
exit /b 0

:viaraw
echo Downloading %NAME% release (%BRANCH%) ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -Uri $env:RAW -OutFile $env:ZIP } catch { exit 1 }" >nul 2>nul
if errorlevel 1 ( if exist "%ZIP%" del "%ZIP%" & echo Anonymous download not available ^(private repository?^); trying other methods ... )
exit /b 0

:viagit
echo Fetching with git from %REPO% (%BRANCH%) ...
git clone --quiet --depth 1 --branch %BRANCH% --filter=blob:none --sparse "%REPO%" "%WORK%\repo" || ( echo git clone failed. & exit /b 1 )
git -C "%WORK%\repo" sparse-checkout set release || exit /b 1
copy /y "%WORK%\repo\release\SF ERP-lite.zip" "%ZIP%" >nul || ( echo SF ERP-lite.zip not found in the repository. & exit /b 1 )
exit /b 0

:viaapi
echo git not found; downloading through the GitHub API ...
if not defined GITHUB_TOKEN if exist "%~dp0sf_erp_token.txt" set /p "GITHUB_TOKEN="<"%~dp0sf_erp_token.txt"
if not defined GITHUB_TOKEN (
  echo A read-only GitHub token is required when git is not installed.
  echo Put it in the GITHUB_TOKEN environment variable or in sf_erp_token.txt next to this file.
  echo ^(Fine-grained token, repository %OWNER%/%NAME%, permission "Contents: Read-only"^)
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -Uri $env:API -Headers @{Authorization='Bearer '+$env:GITHUB_TOKEN; Accept='application/vnd.github.raw'; 'User-Agent'='sf-erp-updater'} -OutFile $env:ZIP } catch { Write-Host $_.Exception.Message; exit 1 }" || ( echo Download failed. Check the token and network. & exit /b 1 )
exit /b 0

:fail
if defined WORK rd /s /q "%WORK%" 2>nul
echo.
echo Update failed.
pause
exit /b 1
