@echo off
REM Used by the daily scheduled task: searches for jobs and writes a log.
cd /d "%~dp0"
if not exist data mkdir data
echo ==== %date% %time% ==== >> data\log.txt
node index.js >> data\log.txt 2>&1
