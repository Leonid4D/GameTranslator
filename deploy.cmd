@echo off
setlocal
cd /d "%~dp0"

rem Обновление прод-сайта на Netlify (https://game-translator-leonid.netlify.app).
rem Нужен установленный и залогиненный Netlify CLI: npm install -g netlify-cli ; netlify login

where netlify >nul 2>&1
if errorlevel 1 (
    echo [error] Netlify CLI не найден. Установите: npm install -g netlify-cli
    pause
    exit /b 1
)

echo [1/2] Сборка статики...
call node netlify\build.js
if errorlevel 1 goto :fail

echo [2/2] Деплой на Netlify...
call netlify deploy --prod --dir=netlify-site --functions=netlify\functions --no-build --message "Update from deploy.cmd"
if errorlevel 1 goto :fail

echo.
echo Готово: https://game-translator-leonid.netlify.app
pause
goto :eof

:fail
echo [error] Деплой не удался, смотрите вывод выше.
pause
