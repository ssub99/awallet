#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
KEYSTORE_DIR="$ANDROID_DIR/keystore"
KEYSTORE_FILE="$KEYSTORE_DIR/awallet-upload.keystore"
PROPS_FILE="$ANDROID_DIR/keystore.properties"
CERT_FILE="$KEYSTORE_DIR/awallet-upload-certificate.pem"
ALIAS="awallet-upload"

if [[ -f "$KEYSTORE_FILE" ]]; then
  echo "이미 keystore가 있습니다: $KEYSTORE_FILE"
  echo "공개키 인증서만 다시 내보내려면:"
  echo "  keytool -export -rfc -alias $ALIAS -file \"$CERT_FILE\" -keystore \"$KEYSTORE_FILE\""
  exit 0
fi

mkdir -p "$KEYSTORE_DIR"

if [[ -n "${AWALLET_KEYSTORE_PASSWORD:-}" ]]; then
  STORE_PASSWORD="$AWALLET_KEYSTORE_PASSWORD"
else
  STORE_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
fi

KEY_PASSWORD="${AWALLET_KEY_PASSWORD:-$STORE_PASSWORD}"

echo "release keystore 생성 중..."
keytool -genkeypair -v -storetype PKCS12 \
  -keystore "$KEYSTORE_FILE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=A-Wallet, OU=Mobile, O=ssong, L=Seoul, ST=Seoul, C=KR"

cat > "$PROPS_FILE" <<EOF
storeFile=keystore/awallet-upload.keystore
storePassword=$STORE_PASSWORD
keyAlias=$ALIAS
keyPassword=$KEY_PASSWORD
EOF

keytool -export -rfc \
  -alias "$ALIAS" \
  -file "$CERT_FILE" \
  -keystore "$KEYSTORE_FILE" \
  -storepass "$STORE_PASSWORD"

chmod 600 "$PROPS_FILE" "$KEYSTORE_FILE"

echo ""
echo "완료."
echo "  keystore:     $KEYSTORE_FILE"
echo "  properties:   $PROPS_FILE"
echo "  공개키(PEM):  $CERT_FILE  ← Galaxy Store 「키 추가」에 업로드"
echo ""
echo "⚠️  keystore.properties 비밀번호를 안전한 곳(1Password 등)에 백업하세요."
echo "    분실 시 Play/Galaxy Store 앱 업데이트가 불가능합니다."
echo ""
echo "Play Store AAB 빌드:"
echo "  npm run android:release-bundle"
