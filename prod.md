# to get cloudflare api token

Get CF API Token:

Go to dash.cloudflare.com → top right click your profile → My Profile
Left sidebar → API Tokens → Create Token
Use template "Edit zone DNS"
Under "Zone Resources" → select santoshdevops.cloud
Click Continue to summary → Create Token
Copy the token (shown only once)

# to restart all the services with new changes

docker stop kanban-traefik kanban-frontend kanban-push-service kanban-backend kanban-monitor

# Pull latest images

docker pull traefik:v3.6.10
docker pull santoshpalla27/gift-highway:frontend
docker pull santoshpalla27/gift-highway:push-service
docker pull santoshpalla27/gift-highway:backend
docker pull santoshpalla27/gift-highway:monitor

# Remove old containers

docker rm kanban-traefik kanban-frontend kanban-push-service kanban-backend kanban-monitor

# Start everything back up

docker compose up -d
