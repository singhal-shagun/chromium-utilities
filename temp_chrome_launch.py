import os
import shutil
import subprocess
import time
import urllib.request

repo = r'D:\Tutorials\Javascript\chromium-utilities'
user_data = r'D:\Temp\chrome-html-md-dev'
shutil.rmtree(user_data, ignore_errors=True)
os.makedirs(user_data, exist_ok=True)

subprocess.Popen(
    [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        '--remote-debugging-port=9222',
        f'--user-data-dir={user_data}',
        '--disable-extensions-except=' + repo,
        '--load-extension=' + repo,
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)

time.sleep(8)

with urllib.request.urlopen('http://127.0.0.1:9222/json/list', timeout=10) as r:
    print(r.read().decode())
