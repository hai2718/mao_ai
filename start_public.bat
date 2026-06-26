@echo off
chcp 65001 >nul
cd /d "C:\Users\34123\Documents\Codex\2026-06-26\ban-2\work\mao-app"

echo ==========================================
echo    毛泽东 AI - 正在启动...
echo ==========================================
echo.

echo [1/2] 启动本地服务器...
start /B node server.cjs > server_log.txt 2>&1
timeout /t 2 /nobreak >nul

echo [2/2] 创建公网隧道...
echo 正在连接 Cloudflare... 请稍候...

cloudflared.exe tunnel --url http://localhost:3000 2>&1 | findstr /C:"trycloudflare.com"