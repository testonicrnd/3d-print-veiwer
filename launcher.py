# TESTONIC R&D — 3D Print Viewer
import subprocess
import time
import webbrowser
import socket
import sys
import os
import base64

# server.py를 띄우고, 사내망 접속 주소를 알림 + 브라우저로 보여주는 런처
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def notify(title, msg):
    # PowerShell에 Unicode 문자를 안전하게 전달하기 위해 Base64 EncodedCommand 사용
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$n = New-Object System.Windows.Forms.NotifyIcon; "
        "$n.Icon = [System.Drawing.SystemIcons]::Information; "
        "$n.Visible = $true; "
        f"$n.ShowBalloonTip(4000, '{title}', '{msg}', "
        "[System.Windows.Forms.ToolTipIcon]::Info); "
        "Start-Sleep 5; $n.Dispose()"
    )
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    try:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
            creationflags=subprocess.CREATE_NO_WINDOW
        )
    except Exception:
        pass

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def get_lan_ip():
    # 실제 전송 없이, 외부로 나갈 때 쓰이는 로컬(LAN) IP만 조회
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

if is_port_in_use(8080):
    notify("3D 프린트 서버", "이미 실행 중입니다.")
    sys.exit(0)

notify("3D 프린트 서버", "서버를 시작합니다...")

flask_proc = subprocess.Popen(
    ["python", os.path.join(BASE_DIR, "server.py")],
    creationflags=subprocess.CREATE_NO_WINDOW
)

time.sleep(2)

lan_ip = get_lan_ip()
print_url = f"http://{lan_ip}:8080/"
notify("3D 프린트 서버", f"준비 완료\n{print_url}")
# 자동 업데이트로 재시작될 때(--no-browser)는 브라우저 탭을 새로 열지 않음
if "--no-browser" not in sys.argv:
    webbrowser.open(print_url)

flask_proc.wait()
