# TESTONIC R&D — 3D Print Viewer
# 신규 펌웨어(K1A 등) WebRTC 카메라를 서버가 직접 받아서 JPEG 프레임으로 제공.
# 브라우저는 기존 MJPEG 프록시(/proxy/<ip>/)를 그대로 쓰므로 외부(Funnel) 접속에서도 동작함.
import asyncio
import base64
import io
import json
import re
import socket
import threading
import time

import requests
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
import aiortc.rtcdtlstransport as _dtls

IDLE_SEC      = 60    # 이 시간 동안 아무도 프레임을 요청하지 않으면 연결 종료
FRAME_TIMEOUT = 10    # 이 시간 동안 프레임이 안 오면 재연결
RETRY_SEC     = 3
JPEG_QUALITY  = 80
STREAM_FPS    = 15    # 확대 스트림 최대 프레임 수 (JPEG 인코딩 부하 제한)

# 프린터 DTLS 서버는 RSA 인증서를 쓰는데 aiortc 기본 암호 목록은 ECDSA 조합뿐이라 handshake_failure가 남
_orig_ssl_context = _dtls.RTCCertificate._create_ssl_context

def _ssl_context(self, srtp_profiles):
    ctx = _orig_ssl_context(self, srtp_profiles)
    ctx.set_cipher_list(
        b"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:"
        b"ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES128-SHA"
    )
    return ctx

_dtls.RTCCertificate._create_ssl_context = _ssl_context

_loop = asyncio.new_event_loop()
threading.Thread(target=_loop.run_forever, daemon=True, name="webrtc-cam").start()


def is_webrtc_camera(ip):
    try:
        return requests.post(f"http://{ip}:8000/call/webrtc_local", data="", timeout=3).status_code == 200
    except Exception:
        return False


def _local_ip_toward(ip):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((ip, 9))
        return s.getsockname()[0]
    finally:
        s.close()


def _printer_offer(sdp, local_ip):
    """프린터의 WebRTC 구현이 읽을 수 있게 offer를 Chrome과 같은 형태로 정리.
    aiortc는 c=/m= 줄에 첫 후보(IPv6, Tailscale 등)를 넣고 후보를 여러 개 보내는데,
    프린터는 이를 제대로 처리하지 못해 연결 확인을 시작하지 않음 → LAN 후보 하나만 남김"""
    lines = sdp.splitlines()
    hosts = [l.split() for l in lines if l.startswith("a=candidate") and " typ host" in l]
    host  = next((h for h in hosts if h[4] == local_ip), hosts[0])
    cand  = f"a=candidate:1 1 udp {host[3]} {host[4]} {host[5]} typ host generation 0"
    out = []
    for l in lines:
        if l.startswith(("a=candidate", "a=end-of-candidates", "a=fingerprint:sha-384", "a=fingerprint:sha-512")):
            continue
        if l.startswith("m=video"):
            l = re.sub(r"^m=video \d+", "m=video 9", l)
        elif l.startswith("c=IN"):
            l = "c=IN IP4 0.0.0.0"
        elif l.startswith("a=ice-ufrag"):
            out.append(cand)
        out.append(l)
    return "\r\n".join(out) + "\r\n"


class _Camera:
    def __init__(self, ip):
        self.ip       = ip
        self.frame    = None   # 최신 av.VideoFrame
        self.seq      = 0
        self.cond     = threading.Condition()
        self.last_req = 0.0
        self.running  = False
        self._jpeg    = (None, -1)
        self._jpeg_lock = threading.Lock()

    def touch(self):
        with self.cond:
            self.last_req = time.time()
            if not self.running:
                self.running = True
                asyncio.run_coroutine_threadsafe(self._run(), _loop)

    def wait_frame(self, after_seq, timeout):
        with self.cond:
            self.cond.wait_for(lambda: self.seq > after_seq, timeout)
            return self.seq

    def jpeg(self):
        """최신 프레임을 JPEG로 — 요청이 있을 때만 인코딩하고 같은 프레임은 캐시 재사용"""
        with self._jpeg_lock:
            seq, frame = self.seq, self.frame
            if frame is None:
                return None
            if self._jpeg[1] != seq:
                buf = io.BytesIO()
                frame.to_image().save(buf, format="JPEG", quality=JPEG_QUALITY)
                self._jpeg = (buf.getvalue(), seq)
            return self._jpeg[0]

    def _wanted(self):
        return time.time() - self.last_req < IDLE_SEC

    async def _run(self):
        try:
            while self._wanted():
                pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))   # LAN 전용 — 외부 STUN 대기 생략
                try:
                    track = await self._connect(pc)
                    while self._wanted():
                        frame = await asyncio.wait_for(track.recv(), FRAME_TIMEOUT)
                        with self.cond:
                            self.frame = frame
                            self.seq  += 1
                            self.cond.notify_all()
                except Exception as e:
                    print(f"[WebRTC 카메라] {self.ip}: {type(e).__name__} {e}")
                finally:
                    await pc.close()
                with self.cond:
                    self.frame = None
                if self._wanted():
                    await asyncio.sleep(RETRY_SEC)
        finally:
            with self.cond:
                self.running = False
                self.frame = None

    async def _connect(self, pc):
        track_ready = _loop.create_future()

        @pc.on("track")
        def on_track(track):
            if not track_ready.done():
                track_ready.set_result(track)

        pc.addTransceiver("video", direction="sendrecv")
        await pc.setLocalDescription(await pc.createOffer())
        sdp  = _printer_offer(pc.localDescription.sdp, _local_ip_toward(self.ip))
        body = base64.b64encode(json.dumps({"type": "offer", "sdp": sdp}).encode()).decode()

        r = await _loop.run_in_executor(None, lambda: requests.post(
            f"http://{self.ip}:8000/call/webrtc_local", data=body,
            headers={"Content-Type": "text/plain"}, timeout=10))
        answer = json.loads(base64.b64decode(r.text))
        # 두 번째 fmtp 줄(x-google-*)이 H264 프로필 정보를 덮어써서 aiortc가 코덱을 못 맞춤
        answer_sdp = "\r\n".join(l for l in answer["sdp"].splitlines() if "x-google" not in l) + "\r\n"
        await pc.setRemoteDescription(RTCSessionDescription(answer_sdp, answer["type"]))
        return await asyncio.wait_for(track_ready, FRAME_TIMEOUT)


_cameras = {}
_cameras_lock = threading.Lock()

def _camera(ip):
    with _cameras_lock:
        cam = _cameras.get(ip)
        if cam is None:
            cam = _cameras[ip] = _Camera(ip)
    cam.touch()
    return cam


def snapshot(ip, timeout=10):
    """최신 프레임 JPEG(bytes). 첫 연결이면 프레임이 올 때까지 기다림. 실패 시 None"""
    cam = _camera(ip)
    if cam.frame is None:
        cam.wait_frame(cam.seq, timeout)
    return cam.jpeg()


def mjpeg_stream(ip, timeout=10):
    """multipart/x-mixed-replace 본문 제너레이터 (boundary=frame)"""
    cam = _camera(ip)
    seq = cam.seq - 1 if cam.frame is not None else cam.seq
    while True:
        started = time.time()
        new_seq = cam.wait_frame(seq, timeout)
        if new_seq == seq:
            return   # 프레임이 끊김 → 스트림 종료 (브라우저가 onerror로 처리)
        seq = new_seq
        cam.touch()
        data = cam.jpeg()
        if data is None:
            return
        yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(data)).encode() + b"\r\n\r\n" + data + b"\r\n"
        time.sleep(max(0, 1 / STREAM_FPS - (time.time() - started)))
