1. System updates & basics

dnf update -y
dnf install -y git curl wget unzip tar bzip2 which 2. Node.js 20 (LTS)

curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node -v && npm -v 3. Java 17 (JDK)

dnf install -y java-17-amazon-corretto-devel
java -version 4. Android SDK

mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest 5. Environment variables

cat >> ~/.bashrc << 'EOF'
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/build-tools/35.0.0
export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto
EOF
source ~/.bashrc 6. Install Android SDK components

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" 7. Add swap (prevents OOM daemon crash)

fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h 8. Clone & install deps

cd /root
git clone <your-repo-url> order-kanban-app
cd order-kanban-app/mobile
npm install 9. Prebuild & build APK

cd /root/order-kanban-app/mobile
npx expo prebuild --clean --platform android

cd android
./gradlew assembleRelease --max-workers=2

cd app/build/outputs/apk/release/

python3 -m http.server 8000 --bind 0.0.0.0

=============

# ── System updates & basic tools ─────────────────────────────────────────────

dnf update -y
dnf install -y git curl wget unzip tar bzip2 which

# ── Node.js 20 (LTS) ─────────────────────────────────────────────────────────

curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node -v && npm -v

# ── Java 17 (JDK) ────────────────────────────────────────────────────────────

dnf install -y java-17-amazon-corretto-devel
java -version

# ── Android SDK setup ────────────────────────────────────────────────────────

mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest

# ── Environment variables ────────────────────────────────────────────────────

cat >> ~/.bashrc << 'EOF'
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/build-tools/35.0.0
export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto
EOF

source ~/.bashrc

# ── Install Android SDK components ───────────────────────────────────────────

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# ── Add swap (prevents OOM / Gradle crashes) ─────────────────────────────────

fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h

# ── Clone project & install dependencies ─────────────────────────────────────

cd /root
git clone https://github.com/santoshpalla27/order-kanban-app.git
cd order-kanban-app/mobile-main
npm install

# ── Prebuild & build APK ─────────────────────────────────────────────────────

cd /root/order-kanban-app/mobile-main
npx expo prebuild --clean --platform android

cd android
./gradlew assembleRelease --max-workers=2

# ── Serve APK for download ───────────────────────────────────────────────────

cd app/build/outputs/apk/release/
python3 -m http.server 8000 --bind 0.0.0.0

=============

Step 1 — Create new Firebase project
Go to console.firebase.google.com
Click "Add project"
Name: kanban-push → Continue
Disable Google Analytics → Create project
Step 2 — Add Android app
Click Android icon (Add app)
Package name: com.gifthighway
Nickname: KanbanFlow → Register app
Download google-services.json → save it
Click Next → Next → Continue to console
Step 3 — Download Service Account Key
Click gear icon → Project Settings
Service Accounts tab
Click "Generate new private key" → Generate key
Save the downloaded JSON file
Step 4 — Replace files locally

cp ~/Downloads/google-services.json /Users/vamsy/Desktop/mobile-app/order-kanban-app/google-services.json
cp ~/Downloads/google-services.json /Users/vamsy/Desktop/mobile-app/order-kanban-app/mobile-main/google-services.json
Step 5 — Upload to Expo via CLI

cd /Users/vamsy/Desktop/mobile-app/order-kanban-app/mobile-main
eas credentials --platform android
production
Google Service Account
Manage your Google Service Account Key for Push Notifications (FCM V1)
Set up a Google Service Account Key for Push Notifications (FCM V1)
Path: ~/Downloads/kanban-push-firebase-adminsdk-xxxxx.json
Step 6 — Push & rebuild
