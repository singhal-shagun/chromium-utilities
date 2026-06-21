import os
import shutil
import subprocess
import time
import urllib.request

for proc_name in ['chrome.exe', 'msedge.exe']:
    try:
        subprocess.run(['taskkill', '/F', '/IM', proc_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    except Exception:
        pass

repo = r'D:\Tutorials\Javascript\chromium-utilities'
user_data = r'D:\Temp\chrome-html-md-dev2'
shutil.rmtree(user_data, ignore_errors=True)
os.makedirs(user_data, exist_ok=True)

subprocess.Popen(
    [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        '--remote-debugging-port=9223',
        '--user-data-dir=' + user_data,
        '--disable-extensions-except=' + repo,
        '--load-extension=' + repo,
        '--new-window',
        'about:blank',
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)

time.sleep(10)

with urllib.request.urlopen('http://127.0.0.1:9223/json/list', timeout=15) as r:
    print(r.read().decode())
