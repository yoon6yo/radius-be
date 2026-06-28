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
# 6. radius-signaling-secret 생성 (아래 2번 참고)
# 7. VITE_SIGNALING_URL을 포함해서 radius-fe 이미지를 빌드했는지 확인
# ─────────────────────────────────────────────────────────────

set -e

# 1. 네임스페이스 생성
kubectl apply -f k8s/namespace.yaml

# 2. Secret 생성 (실제 도메인으로 변경 후 주석 해제)
# kubectl create secret generic radius-signaling-secret \
#   --from-literal=cors-origin="https://PLACEHOLDER_FRONTEND_DOMAIN" \
#   -n radius

# 3. cert-manager ClusterIssuer 생성
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml

# 4. Redis 배포
kubectl apply -f k8s/redis/deployment.yaml
kubectl apply -f k8s/redis/service.yaml

# 5. 시그널링 백엔드 배포
kubectl apply -f k8s/signaling/deployment.yaml
kubectl apply -f k8s/signaling/service.yaml

# 6. 프론트엔드 배포
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml

# 7. Ingress + TLS 설정
kubectl apply -f k8s/ingress.yaml

echo "배포 완료. 상태 확인:"
kubectl get all -n radius
