@echo off
setlocal

set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME_EXE%" (
  echo Google Chrome tidak ditemukan.
  echo Silakan instal Chrome, lalu jalankan file ini lagi.
  pause
  exit /b 1
)

set "PROFILE_DIR=%LocalAppData%\BonboxShopeeAutomation"
start "BONBOX Shopee Automation" "%CHROME_EXE%" ^
  --user-data-dir="%PROFILE_DIR%" ^
  --remote-debugging-port=9222 ^
  --remote-debugging-address=127.0.0.1 ^
  --remote-allow-origins=* ^
  --new-window "https://shopee.co.id/"

echo Browser khusus BONBOX sudah dibuka.
echo Login ke Shopee di jendela tersebut, lalu biarkan jendelanya tetap terbuka.
endlocal
