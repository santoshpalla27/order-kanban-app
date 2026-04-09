docker compose stop frontend backend push-service monitor
docker compose rm -f frontend backend push-service monitor
docker compose build --no-cache frontend backend push-service monitor
docker compose up -d frontend backend push-service monitor

docker tag order-kanban-app-frontend santoshpalla27/gift-highway:frontend
docker tag order-kanban-app-backend santoshpalla27/gift-highway:backend
docker tag order-kanban-app-push-service santoshpalla27/gift-highway:push-service
docker tag order-kanban-app-monitor santoshpalla27/gift-highway:monitor

docker push santoshpalla27/gift-highway:frontend
docker push santoshpalla27/gift-highway:backend
docker push santoshpalla27/gift-highway:push-service
docker push santoshpalla27/gift-highway:monitor
