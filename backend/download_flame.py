"""Download FLAME2020 generic_model.pkl via Python requests (avoids curl/schannel hang).

Usage (from backend/):
    python download_flame.py
  Or provide credentials via env (non-interactive):
    FLAME_USERNAME=you@example.com FLAME_PASSWORD=xxx python download_flame.py
"""
import getpass
import os
import shutil
import sys
import zipfile

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "third_party", "DECA", "data")
URL = "https://download.is.tue.mpg.de/download.php?domain=flame&sfile=FLAME2020.zip&resume=1"

username = os.environ.get("FLAME_USERNAME") or input("FLAME username/email: ")
password = os.environ.get("FLAME_PASSWORD") or getpass.getpass("FLAME password (hidden): ")

os.makedirs(DATA_DIR, exist_ok=True)
zip_path = os.path.join(DATA_DIR, "FLAME2020.zip")

print("Downloading FLAME2020.zip ...")
with requests.post(
    URL,
    data={"username": username, "password": password},
    stream=True,
    timeout=(30, 600),
    verify=False,
) as r:
    if r.status_code != 200:
        print(f"Download failed: HTTP {r.status_code}. Check username/password.")
        sys.exit(1)
    total = int(r.headers.get("content-length", 0) or 0)
    done = 0
    with open(zip_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 256):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(
                    f"\r{done / 1e6:7.1f} / {total / 1e6:.1f} MB ({done * 100 // total}%)",
                    end="",
                    flush=True,
                )
    print()

print("Extracting generic_model.pkl ...")
with zipfile.ZipFile(zip_path) as z:
    z.extractall(os.path.join(DATA_DIR, "FLAME2020"))

src = os.path.join(DATA_DIR, "FLAME2020", "generic_model.pkl")
if not os.path.exists(src):
    print("generic_model.pkl not found in zip. Please inspect FLAME2020.zip contents.")
    sys.exit(1)
shutil.copy2(src, DATA_DIR)
print("Done:", os.path.join(DATA_DIR, "generic_model.pkl"))
