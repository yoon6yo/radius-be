#!/bin/sh
# k3s 클러스터 초기 배포 스크립트
#
# ── 사전 조건 ────────────────────────────────────────────────
#
# 1. k3s 설치 (Traefik 비활성화 + 80/443 NodePort 허용)
#    curl -sfL https://get.k3s.io | sh -s - --disable traefik \
#      --kube-apiserver-arg service-node-port-range=80-32767
#
# 2. kubectl 설정
#    mkdir -p ~/.kube
#    sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
#    sudo chown $USER ~/.kube/config
#
# 3. nginx-ingress 설치 (baremetal NodePort 방식)
#    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml
#
#    설치 후 NodePort를 80/443으로 고정
#    kubectl patch svc ingress-nginx-controller -n ingress-nginx \
#      --type='json' \
#      -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":80},
#           {"op":"replace","path":"/spec/ports/1/nodePort","value":443}]'
#
# 4. cert-manager 설치
#    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.5/cert-manager.yaml
#    kubectl wait --namespace cert-manager --for=condition=ready pod \
#      --selector=app.kubernetes.io/instance=cert-manager --timeout=120s
#
# 5. k8s/ingress.yaml의 PLACEHOLDER_DOMAIN을 실제 도메인으로 교체
# 6. VITE_SIGNALING_URL을 포함해서 radius-fe 이미지를 빌드했는지 확인
#    (GitHub Actions가 main push 시 자동 빌드)
# ─────────────────────────────────────────────────────────────

set -e

FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-}"
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

if [ -z "$FRONTEND_DOMAIN" ] || [ -z "$GHCR_USER" ] || [ -z "$GHCR_TOKEN" ]; then
  echo "사용법:"
  echo "  FRONTEND_DOMAIN=radius.example.com \\"
  echo "  GHCR_USER=깃허브유저명 \\"
  echo "  GHCR_TOKEN=ghp_xxx \\"
  echo "  sh k8s/setup.sh"
  echo ""
  echo "GHCR_TOKEN: GitHub → Settings → Developer settings → Personal access tokens"
  echo "           → read:packages 권한 필요"
  exit 1
fi

# 1. 네임스페이스 생성
kubectl apply -f k8s/namespace.yaml

# 2. GHCR 이미지 Pull 인증 시크릿
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_TOKEN" \
  -n radius \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. 시그널링 서버 CORS 시크릿
kubectl create secret generic radius-signaling-secret \
  --from-literal=cors-origin="https://$FRONTEND_DOMAIN" \
  -n radius \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. cert-manager ClusterIssuer 생성
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml

# 5. Redis 배포
kubectl apply -f k8s/redis/deployment.yaml
kubectl apply -f k8s/redis/service.yaml

# 6. 시그널링 백엔드 배포
kubectl apply -f k8s/signaling/deployment.yaml
kubectl apply -f k8s/signaling/service.yaml

# 7. 프론트엔드 배포
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml

# 8. Ingress + TLS 설정
kubectl apply -f k8s/ingress.yaml

echo "배포 완료. 상태 확인:"
kubectl get all -n radius
