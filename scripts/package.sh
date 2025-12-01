set -e
set -o xtrace

NAME="patternats-$(date --iso-8601=seconds).zip"

mkdir -p package
npm run build
cd dist && zip -r "../package/$NAME" .
