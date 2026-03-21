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
APK will be at:

android/app/build/outputs/apk/release/app-release.apk
