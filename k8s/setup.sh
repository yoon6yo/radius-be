#!/bin/sh
# k3s 클러스터 초기 배포 스크립트
# 사전 조건:
#   - k3s 설치 완료 (Traefik 비활성화 옵션으로 설치)
#   - nginx-ingress controller 설치 완료:
#       kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml
#   - cert-manager 설치 완료:
#       kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.5/cert-manager.yaml
#   - k8s/ingress.yaml의 PLACEHOLDER_DOMAIN을 실제 도메인으로 교체
#   - radius-signaling-secret 생성 (아래 참고)
#   - VITE_SIGNALING_URL을 포함해서 radius-fe 이미지를 빌드했는지 확인

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
