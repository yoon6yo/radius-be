# Radius — Backend (시그널링 서버)

WebRTC P2P 파일 공유를 위한 Socket.io 시그널링 서버.  
프론트엔드([radius-fe](https://github.com/yoon6yo/radius-fe))와 함께 동작합니다.

## 기술 스택

- Node.js + TypeScript
- Socket.io 4.x + Redis Adapter (수평 확장)
- ioredis (룸 상태 관리)
- Express (REST 엔드포인트)

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env

# 3. Redis 실행 (Docker)
docker compose up -d redis

# 4. 서버 실행
npm run dev
```

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 연결 주소 |
| `CORS_ORIGIN` | `*` | 허용할 프론트엔드 Origin |
| `RATE_LIMIT_WINDOW_MS` | `600000` | Rate limit 윈도우 (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `20` | 윈도우당 최대 요청 수 |
| `STUN_URLS` | Google STUN | 콤마 구분 STUN URL |
| `TURN_URL` | (없음) | TURN 서버 주소 |
| `TURN_USERNAME` | (없음) | TURN 사용자 |
| `TURN_CREDENTIAL` | (없음) | TURN 비밀번호 |

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /health` | 서버 + Redis 상태 확인 |
| `GET /ice-config` | RTCPeerConnection용 ICE 서버 목록 반환 |

## Socket.io 이벤트

클라이언트 → 서버: `create-room`, `join-room`, `rejoin`, `offer`, `answer`, `ice-candidate`  
서버 → 클라이언트: `peer-joined`, `peer-reconnected`, `peer-disconnected`, `offer`, `answer`, `ice-candidate`

자세한 페이로드 명세는 `src/types/signaling.ts` 참조.

## 테스트

```bash
npm test
```

## Docker

```bash
# 단독 실행
docker compose up

# 이미지만 빌드
docker build -t radius-be .
```

## CI/CD

`main` 브랜치 push 시 GitHub Actions가 자동으로 실행됩니다.

**필요한 GitHub Secrets:**

| Secret | 값 |
|--------|---|
| `K8S_SSH_HOST` | 서버 IP 또는 도메인 |
| `K8S_SSH_USER` | SSH 사용자 |
| `K8S_SSH_KEY` | SSH 개인키 |

## Kubernetes 배포

```bash
# 최초 배포 (서버에서 실행)
# 1. k8s/ingress.yaml의 PLACEHOLDER_DOMAIN을 실제 도메인으로 교체
# 2. GitHub PAT 발급: Settings → Developer settings → Personal access tokens (read:packages 권한)
# 3. 아래 환경변수와 함께 실행

FRONTEND_DOMAIN=radius.example.com \
GHCR_USER=깃허브유저명 \
GHCR_TOKEN=ghp_xxx \
sh k8s/setup.sh
```

선행 조건: k3s (`--disable traefik` + `--kube-apiserver-arg service-node-port-range=80-32767`), nginx-ingress controller (NodePort 80/443 고정), cert-manager 설치 필요.
