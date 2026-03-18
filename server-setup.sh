#!/bin/bash

set -e

echo "===== SYSTEM UPDATE & CLEANUP ====="
sudo apt update -y
sudo apt upgrade -y
sudo apt autoremove -y
sudo apt autoclean -y

# Optional: remove snap (saves RAM)
sudo systemctl stop snapd || true
sudo apt purge -y snapd || true
sudo rm -rf ~/snap /snap /var/snap /var/lib/snapd || true

echo "===== INSTALL DEPENDENCIES ====="
sudo apt install -y ca-certificates curl gnupg lsb-release ufw

echo "===== ADD DOCKER GPG KEY ====="
sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "===== ADD DOCKER REPO ====="
echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "===== INSTALL DOCKER ====="
sudo apt update -y
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "===== ENABLE DOCKER ====="
sudo systemctl enable docker
sudo systemctl start docker

echo "===== ADD USER TO DOCKER GROUP ====="
sudo usermod -aG docker $USER

echo "===== DOCKER DAEMON CONFIG ====="
sudo mkdir -p /etc/docker

cat <<EOF | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "exec-opts": ["native.cgroupdriver=systemd"]
}
EOF

sudo systemctl restart docker

echo "===== SETUP 4GB SWAP ====="
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo "===== SET SWAPPINESS ====="
sudo sysctl vm.swappiness=10
grep -q 'vm.swappiness' /etc/sysctl.conf || echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf

echo "===== FIREWALL SETUP ====="
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

echo "===== FINAL CLEANUP ====="
sudo apt autoremove -y
sudo apt autoclean -y

echo "===== VERIFY ====="
docker --version
docker compose version
free -h

echo "===== DONE ====="
echo "⚠️ Log out and log back in OR run: newgrp docker"