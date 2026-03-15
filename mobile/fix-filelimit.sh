#!/bin/bash
# Run once to permanently fix EMFILE on macOS
# Then restart terminal and run: npx expo start

echo "Setting permanent file descriptor limits..."

sudo tee /Library/LaunchDaemons/limit.maxfiles.plist > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>65536</string>
      <string>200000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
  </dict>
</plist>
EOF

sudo launchctl load -w /Library/LaunchDaemons/limit.maxfiles.plist
ulimit -n 65536
echo "Done. Current limit: $(ulimit -n)"
echo ""
echo "Now run:  cd mobile && npx expo start"
