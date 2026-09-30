# 3D Print Viewer

> TESTONIC R&D

사내 Creality 3D 프린터 14대를 한 화면에서 실시간으로 모니터링하고 원격 제어하는 웹 대시보드입니다.
사내 PC에서 서버를 띄우고, 같은 사내망에서 `http://<사내 PC IP>:8080/`으로 접속합니다.

---

## 주요 기능

### 실시간 모니터링
- 프린터별 MJPEG 카메라 스트림을 그리드로 표시
- 출력 상태(출력 중 / 일시정지 / 완료 / 오류) 배지 실시간 표시
- 연결이 끊긴 프린터 자동 감지 및 오류 배너 표시

### 확대 뷰어
- 카메라를 클릭하면 우측 패널에 확대 스트림 표시
- 방향키(← →)로 프린터 전환, 전환 시 슬라이드 애니메이션
- 자동 순환 모드 + 핀 고정으로 특정 프린터 고정
- 새로고침해도 보고 있던 프린터 유지
- **PIP(Picture-in-Picture)** 버튼으로 실시간 스트림을 플로팅 창으로 분리

### 출력 제어
- 일시정지 / 재개
- G-code 파일 브라우저에서 원격 출력 시작
- 출력 히스토리 조회 (완료 / 미완료 / 오류)

### 타임랩스
- 프린터별 타임랩스 영상 목록 조회 및 모달 재생
- PIP 모드로 영상 분리 재생
- 타임랩스 삭제

---

## 기술 스택

| 구성 | 내용 |
|------|------|
| **백엔드** | Python · Flask |
| **프론트** | Vanilla JS · CSS |
| **카메라 스트림** | MJPEG (포트 8080) — Flask 프록시로 중계 |
| **프린터 통신** | WebSocket (포트 9999) — 상태 조회 / 파일 / 제어 / 히스토리 |
| **정적 파일** | Flask가 `Cache-Control: no-store`로 직접 서빙 |

---

## 구조

```
├── server.py                        # Flask 서버 — MJPEG 프록시, WebSocket 브릿지
├── index.html                       # 단일 페이지 앱 마크업
├── style.css                        # 테마(다크/라이트), 애니메이션, 토스트, 레이아웃
├── app.js                           # UI 로직 (폴링, 확대 뷰어, PIP 등)
├── launcher.py                      # 서버 실행 + 접속 주소 알림/브라우저 열기
├── control.hta / start.vbs / tray.ps1  # 데스크톱 컨트롤 패널 + 트레이 아이콘 (선택사항)
├── setup.bat                        # 새 PC 최초 설치 (clone · 의존성 · 자동 시작/업데이트 등록)
├── update.ps1                       # GitHub 최신 코드로 동기화, 바뀐 경우만 재시작
├── register_startup_task.ps1        # 로그인 시 자동 시작 등록 (setup.bat이 실행)
└── register_auto_update_task.ps1    # 매시간 자동 업데이트 등록 (setup.bat이 실행)
```

---

## 새 PC에 설치하기

`setup.bat` 하나만 받아서 더블클릭하면 됩니다. 저장소 clone, 파이썬 패키지 설치,
로그인 시 자동 시작, 매시간 자동 업데이트 등록까지 한 번에 처리합니다.

Git과 Python이 설치되어 있어야 합니다(Python 설치 시 "Add python.exe to PATH" 체크).

## 자동 업데이트

`main`에 푸시하면 사내 PC가 1시간 안에 자동으로 받아서 적용합니다(`3DPrintViewerAutoUpdate` 작업).

- `update.ps1`이 `git fetch` 후 `origin/main`으로 맞추고(`reset --hard`), 코드가 바뀐 경우에만 패키지 설치 + 서버 재시작
- 로컬 수정은 버려지고, git이 관리하지 않는 파일은 유지
- 바로 적용하려면 `update.ps1`을 더블클릭하거나 `Start-ScheduledTask -TaskName '3DPrintViewerAutoUpdate'` 실행

## 수동 실행

```bash
pip install -r requirements.txt
python server.py
```

기본 포트 `8080`으로 실행됩니다.
