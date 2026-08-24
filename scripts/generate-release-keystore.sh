#!/usr/bin/env bash
# Generates a real Android release-signing keystore. Run this yourself,
# interactively, when you're ready to create your actual production key —
# not something to run on someone else's behalf or capture the output of,
# since whoever types the passwords at the prompts is the only one who
# should ever know them.
#
# Usage:
#   scripts/generate-release-keystore.sh [alias] [output-path] [validity-days]
#
# Defaults: alias "mannerism", output "android/mannerism-release.keystore",
# validity 10000 days (~27 years — Play Store apps are tied to this key
# for the app's entire lifetime, so it's deliberately long-lived).
#
# Deliberately does NOT accept the store/key passwords as arguments or
# environment variables — keytool prompts for them interactively instead,
# so they never land in shell history, a process list, or a script's
# argv (all of which a passed-in flag would do). Same reasoning as never
# passing a password on an npm/git command line.
set -euo pipefail

ALIAS="${1:-mannerism}"
OUTPUT="${2:-android/mannerism-release.keystore}"
VALIDITY="${3:-10000}"

if [ -f "$OUTPUT" ]; then
  echo "Error: $OUTPUT already exists — refusing to overwrite a possibly-real production keystore." >&2
  echo "Move or rename the existing file first if you really want to regenerate it." >&2
  exit 1
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "Error: keytool not found on PATH. It ships with any JDK — e.g. run this from a" >&2
  echo "shell where JAVA_HOME/bin (or Android Studio's bundled JDK) is on PATH." >&2
  exit 1
fi

echo "Generating a release keystore at $OUTPUT (alias: $ALIAS, validity: ${VALIDITY} days)."
echo "You'll be prompted for a keystore password, a key password, and some certificate"
echo "details (name/org/etc. — these don't need to be accurate, Play Store doesn't verify them)."
echo
echo "IMPORTANT: write down both passwords somewhere safe RIGHT NOW (a password manager,"
echo "not a note you'll lose) — there is no recovery if you forget them. Losing this"
echo "keystore or its passwords means you can never publish an update to this app under"
echo "the same Play Store listing again."
echo

keytool -genkeypair \
  -v \
  -keystore "$OUTPUT" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY"

echo
echo "Done. $OUTPUT is already covered by android/.gitignore's *.keystore rule — never"
echo "commit it. Back it up (and its passwords) somewhere durable outside this repo."
