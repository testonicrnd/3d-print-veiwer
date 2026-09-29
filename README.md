# 3D Print Viewer

Creality 3D 프린터 14대를 한 화면에서 실시간으로 모니터링하고 원격 제어하는 웹 대시보드입니다.

---

## 주요 기능

### 실시간 모니터링
- 프린터별 MJPEG 카메라 스트림을 그리드로 표시
- 출력 상태(출력 중 / 일시정지 / 완료 / 오류) 배지 실시간 표시
- 연결 끊김 프린터 자동 감지 및 오류 배너 표시

### 확대 뷰어
- 카메라 클릭 시 우측 패널에 확대 스트림 표시
- 방향키(← →)로 프린터 간 전환, 전환 시 슬라이드 애니메이션
- 자동 순환 모드 + 핀 고정으로 특정 프린터 고정 가능
- **PIP(Picture-in-Picture)** 버튼으로 실시간 스트림을 플로팅 창으로 분리

### 출력 제어
- 일시정지 / 재개 버튼
- G-code 파일 브라우저에서 원격 출력 시작
- 출력 히스토리 조회 (완료 / 미완료 / 취소 / 오류)

### 타임랩스
- 프린터별 타임랩스 영상 목록 조회 및 모달 재생
- PIP 모드로 영상 분리 재생 지원
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
├── app.js                           # 모든 UI 로직 (폴링, 뷰어, PIP 등)
├── three_d_print_state.json         # 서버 전체 켜기/끄기 토글 상태 (gitignore됨)
├── launcher.py                      # 서버 실행 + 브라우저/알림 띄우는 런처
├── control.hta / start.vbs / tray.ps1  # 데스크톱 트레이 컨트롤 패널 (선택사항)
├── setup.bat                        # 새 컴퓨터에 처음 설치할 때 실행 (clone·의존성·자동시작 등록)
├── update.ps1                       # GitHub에서 최신 코드 받아와서 바뀐 경우만 재시작
├── register_startup_task.ps1        # 로그인 시 자동 시작 등록 (setup.bat이 대신 실행해줌)
└── register_auto_update_task.ps1    # 매시간 자동 업데이트 확인 등록 (setup.bat이 대신 실행해줌)
```

---

## 새 컴퓨터에 설치하기

`setup.bat` 하나만 받아서 더블클릭하면 됩니다 — 저장소를 clone하고, 파이썬 패키지를 설치하고,
로그인 시 자동 시작 + 매시간 자동 업데이트 확인까지 전부 등록합니다.

Git과 Python이 설치되어 있어야 합니다(설치 시 "Add python.exe to PATH" 체크 필요).

## 수동 실행

```bash
pip install -r requirements.txt
python server.py
```

기본 포트 `8080`으로 실행됩니다.
