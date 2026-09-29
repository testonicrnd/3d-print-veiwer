from flask import Flask, Response, send_file, request as freq
import requests
import websocket
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ALLOWED_IPS = {
    "192.168.0.24", "192.168.0.33", "192.168.0.11", "192.168.0.22",
    "192.168.0.14", "192.168.0.15", "192.168.0.17", "192.168.0.23",
    "192.168.0.6", "192.168.0.21", "192.168.0.3", "192.168.0.32",
    "192.168.0.25", "192.168.0.20",
}

def ws_call(ip, command, timeout=4):
    """프린터 WebSocket(9999)에 명령 전송 후 첫 응답 반환"""
    try:
        conn = websocket.create_connection(f"ws://{ip}:9999", timeout=timeout)
        conn.send(json.dumps(command))
        import time; time.sleep(0.5)
        resp = conn.recv()
        conn.close()
        return json.loads(resp)
    except Exception as e:
        return {"error": str(e)}

def ws_call_files(ip, timeout=8):
    """reqGcodeFile 전송 후 retGcodeFileInfo 또는 retGcodeFileInfo2가 포함된 응답 반환"""
    import time
    try:
        conn = websocket.create_connection(f"ws://{ip}:9999", timeout=timeout)
        conn.send(json.dumps({"method": "get", "params": {"reqGcodeFile": 1}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                conn.settimeout(max(0.5, deadline - time.time()))
                resp = json.loads(conn.recv())
                if "retGcodeFileInfo" in resp or "retGcodeFileInfo2" in resp:
                    conn.close()
                    return resp
            except Exception:
                break
        conn.close()
        return {"error": "no file info received"}
    except Exception as e:
        return {"error": str(e)}

def ws_call_history(ip, timeout=6):
    """reqHistory 전송 후 historyList가 포함된 응답 반환 (두 번째 메시지)"""
    import time
    try:
        conn = websocket.create_connection(f"ws://{ip}:9999", timeout=timeout)
        conn.send(json.dumps({"method": "get", "params": {"reqHistory": 1}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                conn.settimeout(max(0.5, deadline - time.time()))
                resp = json.loads(conn.recv())
                if "historyList" in resp:
                    conn.close()
                    return resp
            except Exception:
                break
        conn.close()
        return {"error": "historyList not received"}
    except Exception as e:
        return {"error": str(e)}

# 이 서버 전체(/, /style.css, /app.js, /proxy/*, /api/*)를 통째로 끌 수 있는 스위치.
# 저장소 루트의 JSON 파일에 상태를 저장해서, 재시작 없이 다음 요청부터 바로 반영된다.
# 이 스위치는 어디까지나 "공개(Tailscale Funnel) 노출"만 막는 용도라, Funnel 도메인으로 들어온
# 요청만 차단하고 localhost/사내 LAN IP로 직접 접속한 요청은 토글 상태와 무관하게 항상 허용한다.
THREE_D_PRINT_STATE_FILE = os.path.join(BASE_DIR, "three_d_print_state.json")
_3d_print_state_cache = {"mtime": None, "enabled": None}
_3D_PRINT_EXACT_PATHS = {"/", "/style.css", "/app.js"}
_3D_PRINT_PREFIXES = ("/proxy/", "/api/")
FUNNEL_HOST = "user.tail1e87bb.ts.net"

def _default_3d_print_enabled():
    return os.environ.get("ENABLE_3D_PRINT", "1").lower() not in ("0", "false")

def is_3d_print_enabled():
    try:
        mtime = os.path.getmtime(THREE_D_PRINT_STATE_FILE)
    except OSError:
        mtime = None
    if mtime != _3d_print_state_cache["mtime"]:
        try:
            with open(THREE_D_PRINT_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _3d_print_state_cache["enabled"] = bool(data.get("enabled", True))
        except Exception:
            _3d_print_state_cache["enabled"] = _default_3d_print_enabled()
        _3d_print_state_cache["mtime"] = mtime
    return _3d_print_state_cache["enabled"]

@app.before_request
def _block_3d_print_routes():
    if is_3d_print_enabled():
        return None
    # Funnel 도메인으로 온 요청이 아니면(= localhost나 LAN IP로 직접 접속) 토글이 꺼져 있어도 막지 않는다
    if (freq.host or "").split(":")[0] != FUNNEL_HOST:
        return None
    if freq.path in _3D_PRINT_EXACT_PATHS or freq.path.startswith(_3D_PRINT_PREFIXES):
        return "3D 프린트 서버가 꺼져 있습니다", 404
    return None

@app.route("/")
def index():
    resp = send_file(os.path.join(BASE_DIR, "index.html"))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp

@app.route("/style.css")
def serve_css():
    resp = send_file(os.path.join(BASE_DIR, "style.css"), mimetype="text/css")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp

@app.route("/app.js")
def serve_js():
    resp = send_file(os.path.join(BASE_DIR, "app.js"), mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp

@app.route("/proxy/<ip>/")
def proxy_stream(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403

    action = freq.args.get("action", "stream")
    target = f"http://{ip}:8080/?action={action}"

    try:
        r = requests.get(target, stream=True, timeout=10)
        content_type = r.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=frame")

        def generate():
            try:
                for chunk in r.iter_content(chunk_size=1024):
                    if chunk:
                        yield chunk
            except Exception as e:
                print(f"[스트림 중단] {ip}: {e}")

        return Response(generate(), content_type=content_type)

    except Exception as e:
        print(f"[연결 오류] {ip}: {e}")
        return "연결 오류", 502

@app.route("/api/status/<ip>")
def printer_status(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call(ip, {"method": "get", "params": {"reqPrintObjects": 1}})
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/pause/<ip>", methods=["POST"])
def printer_pause(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call(ip, {"method": "set", "params": {"pause": 1}})
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/resume/<ip>", methods=["POST"])
def printer_resume(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call(ip, {"method": "set", "params": {"pause": 0}})
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/history/<ip>")
def print_history(ip):
    """히스토리 + 타임랩스 목록 공용 — WebSocket reqHistory:1 로 가져옴"""
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call_history(ip)
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/files/<ip>")
def gcode_files(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call_files(ip)
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/files/<ip>/print", methods=["POST"])
def gcode_print(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    body = freq.json or {}
    path     = body.get("path", "")
    filename = body.get("filename", "")
    if not filename:
        return Response(json.dumps({"error": "filename required"}), content_type="application/json"), 400
    cmd = f"printprt:{path}/{filename}" if path else f"printprt:{filename}"
    data = ws_call(ip, {"method": "set", "params": {"opGcodeFile": cmd}})
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/timelapse/<ip>/delete", methods=["POST"])
def timelapse_delete(ip):
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    ids = freq.json.get("ids", [])
    if not ids:
        return Response(json.dumps({"error": "no ids"}), content_type="application/json"), 400
    data = ws_call(ip, {"method": "set", "params": {"deleteHistory": ids}})
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/timelapse/<ip>")
def timelapse_list(ip):
    """히스토리와 동일 데이터 사용 (id로 영상 파일명 파생)"""
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    data = ws_call_history(ip)
    return Response(json.dumps(data), content_type="application/json")

@app.route("/api/timelapse/<ip>/video/<int:vid_id>")
def timelapse_video(ip, vid_id):
    """Creality 타임랩스 영상 프록시 — id(starttime)로 영상 경로 구성"""
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    import urllib.parse
    # Creality 영상 경로 패턴: /usr/data//creality/userdata/delay_image/video/{id}.mp4
    file_path = f"/usr/data//creality/userdata/delay_image/video/{vid_id}.mp4"
    encoded   = urllib.parse.quote(file_path, safe="")
    target    = f"http://{ip}/downloads/video/{encoded}"
    headers   = {}
    if freq.headers.get("Range"):
        headers["Range"] = freq.headers["Range"]
    try:
        r = requests.get(target, stream=True, timeout=30, headers=headers)
        if r.status_code in (200, 206):
            resp_headers = {
                "Content-Type": r.headers.get("Content-Type", "video/mp4"),
                "Accept-Ranges": "bytes",
            }
            if "Content-Range" in r.headers:
                resp_headers["Content-Range"] = r.headers["Content-Range"]
            if "Content-Length" in r.headers:
                resp_headers["Content-Length"] = r.headers["Content-Length"]
            return Response(r.iter_content(65536), status=r.status_code, headers=resp_headers)
        print(f"[타임랩스] {ip} → {r.status_code} {target}")
    except Exception as e:
        print(f"[타임랩스 프록시 오류] {ip}: {e}")
    return "영상을 찾을 수 없습니다", 404

@app.route("/api/thumbnail/<ip>/<path:gcode_filename>")
def thumbnail(ip, gcode_filename):
    """gcode_filename: .gcode 확장자 포함 파일명 → .png로 바꿔서 /downloads/humbnail/ 프록시"""
    if ip not in ALLOWED_IPS:
        return "Not allowed", 403
    import urllib.parse
    thumb_name = gcode_filename.replace(".gcode", ".png")
    encoded    = urllib.parse.quote(thumb_name, safe="")
    target     = f"http://{ip}/downloads/humbnail/{encoded}"
    try:
        r = requests.get(target, timeout=5)
        if r.status_code == 200:
            return Response(r.content, content_type=r.headers.get("Content-Type", "image/png"))
    except Exception:
        pass
    return "", 404

if __name__ == "__main__":
    print("AIRMAX 3D 프린터 서버 시작 (포트 8080)")
    app.run(host="0.0.0.0", port=8080, threaded=True)
